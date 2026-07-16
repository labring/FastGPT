import {
  S3_ACCESS_LINK_PURGE_GRACE_HOURS,
  S3_DOWNLOAD_ALIAS_LEASE_REFRESH_MARGIN_MS,
  S3_DOWNLOAD_ALIAS_ID_LENGTH,
  S3_DOWNLOAD_URL_BATCH_MAX_SIZE,
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
  S3DownloadAliasRecord,
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

type PreparedDownloadUrl = {
  parsed: CreateS3DownloadAccessUrlParams;
  aliasKey: string;
  expiresAt: Date;
  expMinute36: string;
  purgeAt: Date;
};

type DownloadAliasGroup = {
  aliasKey: string;
  parsed: CreateS3DownloadAccessUrlParams;
  purgeAt: Date;
  leaseRefreshThreshold: number;
};

/**
 * 批量创建或复用下载 alias，并按输入顺序返回签名 URL。
 *
 * 同一批次先按 aliasKey 去重，再通过 store 批量查找、创建和续租。不同输入即使共享
 * alias，也会按各自过期时间独立生成 expMinute36 和签名。
 */
export const createDownloadUrlsHandler =
  ({
    clock,
    crypto,
    idGenerator,
    onDownloadUrlTiming,
    routes,
    stores
  }: ResolvedS3AccessLinkServiceOptions & { crypto: S3AccessLinkCrypto }) =>
  async (paramsList: CreateS3DownloadAccessUrlParams[]) => {
    if (!Array.isArray(paramsList) || paramsList.length > S3_DOWNLOAD_URL_BATCH_MAX_SIZE) {
      throw new S3AccessLinkError(S3AccessLinkErrCode.invalidDownloadBatch);
    }
    if (paramsList.length === 0) return [];

    const totalStartedAt = performance.now();
    let storeFindDurationMs = 0;
    let storeCreateDurationMs = 0;
    let storeTouchLeaseDurationMs = 0;
    let duplicateAliasRetry = false;

    const findByAliasKeys = async (aliasKeys: string[]) => {
      const startedAt = performance.now();
      try {
        return await stores.downloadAlias.findByAliasKeys(aliasKeys);
      } finally {
        storeFindDurationMs += performance.now() - startedAt;
      }
    };

    const now = clock();
    const aliasKeyHmacStartedAt = performance.now();
    const preparedItems: PreparedDownloadUrl[] = paramsList.map((params) => {
      const parsed = assertCreateDownloadParams(params);
      const expiresAt = resolveDownloadExpiresAt(parsed.expiredTime, now);

      return {
        parsed,
        aliasKey: crypto.buildDownloadAliasKey(parsed),
        expiresAt,
        expMinute36: encodeExpiresAtMinute(expiresAt),
        purgeAt: addHours(expiresAt, S3_ACCESS_LINK_PURGE_GRACE_HOURS)
      };
    });
    const aliasKeyHmacDurationMs = performance.now() - aliasKeyHmacStartedAt;

    const aliasGroups = Array.from(
      preparedItems
        .reduce<Map<string, DownloadAliasGroup>>((map, item) => {
          const existingGroup = map.get(item.aliasKey);
          const leaseRefreshThreshold =
            item.expiresAt.getTime() + S3_DOWNLOAD_ALIAS_LEASE_REFRESH_MARGIN_MS;

          if (existingGroup) {
            if (item.purgeAt.getTime() > existingGroup.purgeAt.getTime()) {
              existingGroup.purgeAt = item.purgeAt;
            }
            existingGroup.leaseRefreshThreshold = Math.max(
              existingGroup.leaseRefreshThreshold,
              leaseRefreshThreshold
            );
          } else {
            map.set(item.aliasKey, {
              aliasKey: item.aliasKey,
              parsed: item.parsed,
              purgeAt: item.purgeAt,
              leaseRefreshThreshold
            });
          }

          return map;
        }, new Map())
        .values()
    );
    const aliasKeys = aliasGroups.map((item) => item.aliasKey);
    const initialAliases = await findByAliasKeys(aliasKeys);
    const aliasesByKey = new Map(initialAliases.map((alias) => [alias.aliasKey, alias]));
    const aliasSourceByKey = new Map<string, 'reused' | 'created'>(
      initialAliases.map((alias) => [alias.aliasKey, 'reused'])
    );
    const missingGroups = aliasGroups.filter((item) => !aliasesByKey.has(item.aliasKey));

    if (missingGroups.length > 0) {
      const records = missingGroups.map((group) => ({
        aliasId: idGenerator.aliasId(),
        aliasKey: group.aliasKey,
        bucketName: group.parsed.bucketName,
        objectKey: group.parsed.objectKey,
        filename: group.parsed.filename,
        responseContentType: group.parsed.responseContentType,
        lastIssuedAt: now,
        purgeAt: group.purgeAt
      }));

      const createdAliases = await (async () => {
        const startedAt = performance.now();
        try {
          return await stores.downloadAlias.createMany(records);
        } finally {
          storeCreateDurationMs += performance.now() - startedAt;
        }
      })().catch(async (error): Promise<S3DownloadAliasRecord[]> => {
        if (isS3AccessLinkError(error) && error.code === S3AccessLinkErrCode.duplicateAliasKey) {
          duplicateAliasRetry = true;
          return findByAliasKeys(missingGroups.map((item) => item.aliasKey));
        }
        throw error;
      });

      createdAliases.forEach((alias) => {
        aliasesByKey.set(alias.aliasKey, alias);
        aliasSourceByKey.set(alias.aliasKey, duplicateAliasRetry ? 'reused' : 'created');
      });
    }

    if (aliasesByKey.size !== aliasGroups.length) {
      throw new S3AccessLinkError(S3AccessLinkErrCode.downloadAliasNotFound);
    }

    // create 已写入 24 小时 grace；复用时消费这段余量，只在接近链接有效期边界时低频续租。
    const leasesToTouch = aliasGroups.flatMap((group) => {
      const alias = aliasesByKey.get(group.aliasKey)!;
      if (alias.purgeAt.getTime() > group.leaseRefreshThreshold) return [];

      return [
        {
          aliasId: alias.aliasId,
          purgeAt: group.purgeAt,
          lastIssuedAt: now
        }
      ];
    });
    if (leasesToTouch.length > 0) {
      const touchLeaseStartedAt = performance.now();
      try {
        await stores.downloadAlias.touchLeases(leasesToTouch);
      } finally {
        storeTouchLeaseDurationMs += performance.now() - touchLeaseStartedAt;
      }
    }

    const signatureHmacStartedAt = performance.now();
    const urls = preparedItems.map((item) => {
      const alias = aliasesByKey.get(item.aliasKey)!;
      const sig = crypto.signDownloadAlias({
        aliasId: alias.aliasId,
        expMinute36: item.expMinute36
      });

      return routes.buildDownloadUrl(`${alias.aliasId}.${item.expMinute36}.${sig}`);
    });
    const signatureHmacDurationMs = performance.now() - signatureHmacStartedAt;
    const hmacDurationMs = aliasKeyHmacDurationMs + signatureHmacDurationMs;
    const storeIoDurationMs =
      storeFindDurationMs + storeCreateDurationMs + storeTouchLeaseDurationMs;
    const reusedAliasCount = Array.from(aliasSourceByKey.values()).filter(
      (source) => source === 'reused'
    ).length;
    const createdAliasCount = aliasGroups.length - reusedAliasCount;

    emitDownloadUrlTiming(onDownloadUrlTiming, {
      inputCount: paramsList.length,
      uniqueAliasCount: aliasGroups.length,
      reusedAliasCount,
      createdAliasCount,
      leaseTouchedCount: leasesToTouch.length,
      totalDurationMs: performance.now() - totalStartedAt,
      hmacDurationMs,
      aliasKeyHmacDurationMs,
      signatureHmacDurationMs,
      storeIoDurationMs,
      storeFindDurationMs,
      storeCreateDurationMs,
      storeTouchLeaseDurationMs,
      aliasReused: reusedAliasCount === aliasGroups.length,
      duplicateAliasRetry,
      leaseTouched: leasesToTouch.length > 0
    });

    return urls;
  };

/** 单链接兼容入口，复用批量状态机以保持 alias 与续租语义一致。 */
export const createDownloadUrlHandler = (
  options: ResolvedS3AccessLinkServiceOptions & { crypto: S3AccessLinkCrypto }
) => {
  const createDownloadUrls = createDownloadUrlsHandler(options);

  return async (params: CreateS3DownloadAccessUrlParams) => {
    const [url] = await createDownloadUrls([params]);
    return url!;
  };
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
