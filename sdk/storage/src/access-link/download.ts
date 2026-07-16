import {
  S3_ACCESS_LINK_PURGE_GRACE_HOURS,
  S3_DOWNLOAD_ALIAS_LEASE_REFRESH_MARGIN_MS,
  S3_DOWNLOAD_ALIAS_ID_LENGTH,
  S3_DOWNLOAD_SIGNATURE_LENGTH
} from './constants';
import type { S3AccessLinkCrypto } from './crypto';
import { constantTimeEqual } from './crypto';
import {
  addHours,
  decodeExpiresAtMinute,
  encodeExpiresAtMinute,
  resolveDownloadExpiresAt
} from './date';
import { S3AccessLinkErrCode, S3AccessLinkError, isS3AccessLinkError } from './errors';
import {
  assertCreateDownloadParams,
  assertDownloadPayload,
  assertSignedAliasFormat
} from './guards';
import type {
  CreateS3DownloadAccessUrlParams,
  ParsedS3SignedDownloadAlias,
  ResolvedS3AccessLinkServiceOptions,
  S3DownloadUrlTiming,
  S3VerifiedDownloadPayload
} from './types';

/** 可观测性回调不能影响短链签发结果。 */
const emitDownloadUrlTiming = (
  callback: ResolvedS3AccessLinkServiceOptions['onDownloadUrlTiming'],
  timing: S3DownloadUrlTiming
) => {
  try {
    callback?.(timing);
  } catch {
    // Ignore telemetry callback failures.
  }
};

const parseSignedS3DownloadAliasValue = (value: string): ParsedS3SignedDownloadAlias => {
  assertSignedAliasFormat(value);
  const [aliasId = '', expMinute36 = '', sig = ''] = value.split('.');

  if (
    aliasId.length < 12 ||
    aliasId.length > 32 ||
    expMinute36.length === 0 ||
    expMinute36.length > 8 ||
    sig.length < 16 ||
    sig.length > 64
  ) {
    throw new S3AccessLinkError(S3AccessLinkErrCode.invalidSignedAlias);
  }

  return { aliasId, expMinute36, sig };
};

export const createDownloadAliasSignatureAssert = ({
  clock,
  crypto
}: {
  clock: () => Date;
  crypto: S3AccessLinkCrypto;
}) => {
  return (value: string) => {
    const parsed = parseSignedS3DownloadAliasValue(value);
    const expiresAt = decodeExpiresAtMinute(parsed.expMinute36);

    if (expiresAt.getTime() <= clock().getTime()) {
      throw new S3AccessLinkError(S3AccessLinkErrCode.expiredSignedAlias);
    }

    const expectedSig = crypto.signDownloadAlias({
      aliasId: parsed.aliasId,
      expMinute36: parsed.expMinute36
    });

    if (!constantTimeEqual(parsed.sig, expectedSig)) {
      throw new S3AccessLinkError(S3AccessLinkErrCode.invalidSignedAliasSignature);
    }

    return {
      ...parsed,
      expiresAt
    };
  };
};

export const createDownloadUrlHandler =
  ({
    clock,
    crypto,
    idGenerator,
    onDownloadUrlTiming,
    routes,
    stores
  }: ResolvedS3AccessLinkServiceOptions & { crypto: S3AccessLinkCrypto }) =>
  async (params: CreateS3DownloadAccessUrlParams) => {
    const totalStartedAt = performance.now();
    let storeFindDurationMs = 0;
    let storeCreateDurationMs = 0;
    let storeTouchLeaseDurationMs = 0;
    let duplicateAliasRetry = false;
    let leaseTouched = false;

    const findByAliasKey = async (aliasKey: string) => {
      const startedAt = performance.now();
      try {
        return await stores.downloadAlias.findByAliasKey(aliasKey);
      } finally {
        storeFindDurationMs += performance.now() - startedAt;
      }
    };

    const parsed = assertCreateDownloadParams(params);
    const now = clock();
    const expiresAt = resolveDownloadExpiresAt(parsed.expiredTime, now);
    const expMinute36 = encodeExpiresAtMinute(expiresAt);
    const purgeAt = addHours(expiresAt, S3_ACCESS_LINK_PURGE_GRACE_HOURS);
    const aliasKeyHmacStartedAt = performance.now();
    const aliasKey = crypto.buildDownloadAliasKey(parsed);
    const aliasKeyHmacDurationMs = performance.now() - aliasKeyHmacStartedAt;
    const existingAlias = await findByAliasKey(aliasKey);
    const alias =
      existingAlias ??
      (await (async () => {
        const startedAt = performance.now();
        try {
          return await stores.downloadAlias.create({
            aliasId: idGenerator.aliasId(),
            aliasKey,
            bucketName: parsed.bucketName,
            objectKey: parsed.objectKey,
            filename: parsed.filename,
            responseContentType: parsed.responseContentType,
            lastIssuedAt: now,
            purgeAt
          });
        } finally {
          storeCreateDurationMs += performance.now() - startedAt;
        }
      })().catch(async (error) => {
        if (isS3AccessLinkError(error) && error.code === S3AccessLinkErrCode.duplicateAliasKey) {
          duplicateAliasRetry = true;
          return findByAliasKey(aliasKey);
        }
        throw error;
      }));

    if (!alias) {
      throw new S3AccessLinkError(S3AccessLinkErrCode.downloadAliasNotFound);
    }

    // create 已写入 24 小时 grace；复用时消费这段余量，只在接近链接有效期边界时低频续租。
    const leaseRefreshThreshold = expiresAt.getTime() + S3_DOWNLOAD_ALIAS_LEASE_REFRESH_MARGIN_MS;
    if (alias.purgeAt.getTime() <= leaseRefreshThreshold) {
      const touchLeaseStartedAt = performance.now();
      try {
        await stores.downloadAlias.touchLease({
          aliasId: alias.aliasId,
          purgeAt,
          lastIssuedAt: now
        });
        leaseTouched = true;
      } finally {
        storeTouchLeaseDurationMs += performance.now() - touchLeaseStartedAt;
      }
    }

    const signatureHmacStartedAt = performance.now();
    const sig = crypto.signDownloadAlias({
      aliasId: alias.aliasId,
      expMinute36
    });
    const signatureHmacDurationMs = performance.now() - signatureHmacStartedAt;
    const url = routes.buildDownloadUrl(`${alias.aliasId}.${expMinute36}.${sig}`);
    const hmacDurationMs = aliasKeyHmacDurationMs + signatureHmacDurationMs;
    const storeIoDurationMs =
      storeFindDurationMs + storeCreateDurationMs + storeTouchLeaseDurationMs;

    emitDownloadUrlTiming(onDownloadUrlTiming, {
      totalDurationMs: performance.now() - totalStartedAt,
      hmacDurationMs,
      aliasKeyHmacDurationMs,
      signatureHmacDurationMs,
      storeIoDurationMs,
      storeFindDurationMs,
      storeCreateDurationMs,
      storeTouchLeaseDurationMs,
      aliasReused: Boolean(existingAlias),
      duplicateAliasRetry,
      leaseTouched
    });

    return url;
  };

export const verifyDownloadAliasHandler =
  ({
    clock,
    crypto,
    stores
  }: ResolvedS3AccessLinkServiceOptions & { crypto: S3AccessLinkCrypto }) =>
  async (signedAlias: string): Promise<S3VerifiedDownloadPayload> => {
    const assertSignature = createDownloadAliasSignatureAssert({ clock, crypto });
    const { aliasId, expiresAt } = assertSignature(signedAlias);
    const alias = await stores.downloadAlias.findByAliasId(aliasId);

    if (!alias) {
      throw new S3AccessLinkError(S3AccessLinkErrCode.downloadAliasNotFound);
    }

    if (alias.disabledAt) {
      throw new S3AccessLinkError(S3AccessLinkErrCode.downloadAliasRevoked);
    }

    return assertDownloadPayload({
      bucketName: alias.bucketName,
      objectKey: alias.objectKey,
      expiresAt,
      filename: alias.filename,
      responseContentType: alias.responseContentType
    });
  };

export const revokeDownloadAliasHandler =
  ({ clock, stores }: ResolvedS3AccessLinkServiceOptions) =>
  async (aliasId: string) => {
    await stores.downloadAlias.disableByAliasId({
      aliasId,
      disabledAt: clock()
    });
  };

export const deleteDownloadAliasByObjectHandler =
  ({ stores }: ResolvedS3AccessLinkServiceOptions) =>
  async (params: { bucketName: string; objectKey: string }) => {
    await stores.downloadAlias.deleteByObject(params);
  };

export const deleteDownloadAliasByObjectsHandler =
  ({ stores }: ResolvedS3AccessLinkServiceOptions) =>
  async (params: { bucketName: string; objectKeys: string[] }) => {
    await stores.downloadAlias.deleteByObjects(params);
  };

export const parseSignedS3DownloadAlias = parseSignedS3DownloadAliasValue;
export { decodeExpiresAtMinute, encodeExpiresAtMinute, resolveDownloadExpiresAt };
export { S3_DOWNLOAD_ALIAS_ID_LENGTH, S3_DOWNLOAD_SIGNATURE_LENGTH };
