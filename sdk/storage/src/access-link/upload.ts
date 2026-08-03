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
      uploadPolicy: parsed.uploadPolicy,
      fileHint: parsed.fileHint,
      metadata: parsed.metadata,
      multipart: parsed.multipart,
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
      uploadPolicy: session.uploadPolicy,
      fileHint: session.fileHint,
      metadata: session.metadata,
      multipart: session.multipart
    });
  };

export const markMultipartCompletingHandler =
  ({
    clock,
    crypto,
    idGenerator,
    stores
  }: ResolvedS3AccessLinkServiceOptions & { crypto: S3AccessLinkCrypto }) =>
  async ({
    token,
    completingAt,
    reclaimBefore
  }: {
    token: string;
    completingAt?: Date;
    reclaimBefore?: Date;
  }) => {
    assertUploadTokenFormat(token);
    const completionAttemptId = idGenerator.multipartCompletionAttemptId();
    return stores.uploadSession.markMultipartCompleting({
      tokenHash: crypto.hashUploadToken(token),
      completionAttemptId,
      completingAt: completingAt ?? clock(),
      reclaimBefore
    });
  };

export const markMultipartCompletedHandler =
  ({
    clock,
    crypto,
    stores
  }: ResolvedS3AccessLinkServiceOptions & { crypto: S3AccessLinkCrypto }) =>
  async ({
    token,
    completionAttemptId,
    completedAt
  }: {
    token: string;
    completionAttemptId: string;
    completedAt?: Date;
  }) => {
    assertUploadTokenFormat(token);
    return stores.uploadSession.markMultipartCompleted({
      tokenHash: crypto.hashUploadToken(token),
      completionAttemptId,
      completedAt: completedAt ?? clock()
    });
  };

export const markMultipartCompleteFailedHandler =
  ({
    clock,
    crypto,
    stores
  }: ResolvedS3AccessLinkServiceOptions & { crypto: S3AccessLinkCrypto }) =>
  async ({
    token,
    completionAttemptId,
    abortedAt
  }: {
    token: string;
    completionAttemptId: string;
    abortedAt?: Date;
  }) => {
    assertUploadTokenFormat(token);
    return stores.uploadSession.markMultipartCompleteFailed({
      tokenHash: crypto.hashUploadToken(token),
      completionAttemptId,
      abortedAt: abortedAt ?? clock()
    });
  };

export const markMultipartAbortedHandler =
  ({
    clock,
    crypto,
    stores
  }: ResolvedS3AccessLinkServiceOptions & { crypto: S3AccessLinkCrypto }) =>
  async ({ token, abortedAt }: { token: string; abortedAt?: Date }) => {
    assertUploadTokenFormat(token);
    return stores.uploadSession.markMultipartAborted({
      tokenHash: crypto.hashUploadToken(token),
      abortedAt: abortedAt ?? clock()
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
