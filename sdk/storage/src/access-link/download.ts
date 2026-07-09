import {
  S3_ACCESS_LINK_PURGE_GRACE_HOURS,
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
  S3VerifiedDownloadPayload
} from './types';

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
    routes,
    stores
  }: ResolvedS3AccessLinkServiceOptions & { crypto: S3AccessLinkCrypto }) =>
  async (params: CreateS3DownloadAccessUrlParams) => {
    const parsed = assertCreateDownloadParams(params);
    const now = clock();
    const expiresAt = resolveDownloadExpiresAt(parsed.expiredTime, now);
    const expMinute36 = encodeExpiresAtMinute(expiresAt);
    const purgeAt = addHours(expiresAt, S3_ACCESS_LINK_PURGE_GRACE_HOURS);
    const aliasKey = crypto.buildDownloadAliasKey(parsed);
    const existingAlias = await stores.downloadAlias.findByAliasKey(aliasKey);
    const alias =
      existingAlias ??
      (await stores.downloadAlias
        .create({
          aliasId: idGenerator.aliasId(),
          aliasKey,
          bucketName: parsed.bucketName,
          objectKey: parsed.objectKey,
          filename: parsed.filename,
          responseContentType: parsed.responseContentType,
          lastIssuedAt: now,
          purgeAt
        })
        .catch(async (error) => {
          if (isS3AccessLinkError(error) && error.code === S3AccessLinkErrCode.duplicateAliasKey) {
            return stores.downloadAlias.findByAliasKey(aliasKey);
          }
          throw error;
        }));

    if (!alias) {
      throw new S3AccessLinkError(S3AccessLinkErrCode.downloadAliasNotFound);
    }

    await stores.downloadAlias.touchLease({
      aliasId: alias.aliasId,
      purgeAt,
      lastIssuedAt: now
    });

    const sig = crypto.signDownloadAlias({
      aliasId: alias.aliasId,
      expMinute36
    });

    return routes.buildDownloadUrl(`${alias.aliasId}.${expMinute36}.${sig}`);
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
