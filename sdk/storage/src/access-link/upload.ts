import type { S3AccessLinkCrypto } from './crypto';
import { S3AccessLinkErrCode, S3AccessLinkError } from './errors';
import { assertCreateUploadParams, assertUploadPayload, assertUploadTokenFormat } from './guards';
import type {
  CreateS3UploadAccessUrlParams,
  ResolvedS3AccessLinkServiceOptions,
  S3ProxyUploadPayload
} from './types';

export const createUploadUrlHandler =
  ({
    clock,
    crypto,
    idGenerator,
    routes,
    stores
  }: ResolvedS3AccessLinkServiceOptions & { crypto: S3AccessLinkCrypto }) =>
  async (params: CreateS3UploadAccessUrlParams) => {
    const parsed = assertCreateUploadParams(params);
    const token = idGenerator.uploadToken();
    const tokenHash = crypto.hashUploadToken(token);

    await stores.uploadSession.create({
      tokenHash,
      bucketName: parsed.bucketName,
      objectKey: parsed.objectKey,
      maxSize: parsed.maxSize,
      uploadConstraints: parsed.uploadConstraints,
      uploadPolicy: parsed.uploadPolicy,
      fileHint: parsed.fileHint,
      metadata: parsed.metadata,
      expiresAt: parsed.expiredTime,
      createTime: clock()
    });

    return routes.buildUploadUrl(token);
  };

export const verifyUploadTokenHandler =
  ({
    clock,
    crypto,
    stores,
    uploadSessionUsePolicy
  }: ResolvedS3AccessLinkServiceOptions & { crypto: S3AccessLinkCrypto }) =>
  async (token: string): Promise<S3ProxyUploadPayload> => {
    assertUploadTokenFormat(token);

    const tokenHash = crypto.hashUploadToken(token);
    const session = await stores.uploadSession.findByTokenHash(tokenHash);

    if (!session) {
      throw new S3AccessLinkError(S3AccessLinkErrCode.uploadSessionNotFound);
    }

    if (session.revokedAt) {
      throw new S3AccessLinkError(S3AccessLinkErrCode.uploadSessionRevoked);
    }

    if (session.expiresAt.getTime() <= clock().getTime()) {
      throw new S3AccessLinkError(S3AccessLinkErrCode.uploadSessionExpired);
    }

    if (session.usedAt && uploadSessionUsePolicy === 'reject-used') {
      throw new S3AccessLinkError(S3AccessLinkErrCode.uploadSessionUsed);
    }

    if (uploadSessionUsePolicy !== 'allow-retry') {
      await stores.uploadSession.markUsed({
        tokenHash,
        usedAt: clock()
      });
    }

    return assertUploadPayload({
      bucketName: session.bucketName,
      objectKey: session.objectKey,
      maxSize: session.maxSize,
      uploadConstraints: session.uploadConstraints,
      uploadPolicy: session.uploadPolicy,
      fileHint: session.fileHint,
      metadata: session.metadata
    });
  };

export const revokeUploadTokenHandler =
  ({
    clock,
    crypto,
    stores
  }: ResolvedS3AccessLinkServiceOptions & { crypto: S3AccessLinkCrypto }) =>
  async (token: string) => {
    assertUploadTokenFormat(token);
    await stores.uploadSession.revoke({
      tokenHash: crypto.hashUploadToken(token),
      revokedAt: clock()
    });
  };
