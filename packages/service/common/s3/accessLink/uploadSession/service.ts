import {
  CreateS3UploadAccessUrlParamsSchema,
  S3ProxyUploadPayloadSchema,
  S3UploadTokenSchema,
  type S3ProxyUploadPayload
} from '../type';
import { buildS3UploadUrl, generateS3UploadToken, hashS3UploadToken } from '../utils';
import { S3AccessLinkErrCode, S3AccessLinkError } from '../error';
import {
  createS3UploadSession,
  findS3UploadSessionByTokenHash,
  markS3UploadSessionUsed,
  revokeS3UploadSessionByTokenHash
} from './entity';

/**
 * 创建一次上传会话并返回短上传 URL。
 *
 * 上传 session 承载 maxSize/uploadConstraints/metadata 等服务端策略，不按 objectKey 复用，
 * 避免重复 PUT、覆盖对象和策略变更不生效。
 */
export const createS3UploadAccessUrl = async (params: unknown) => {
  const parsed = CreateS3UploadAccessUrlParamsSchema.parse(params);
  const token = generateS3UploadToken();
  const tokenHash = hashS3UploadToken(token);

  await createS3UploadSession({
    tokenHash,
    bucketName: parsed.bucketName,
    objectKey: parsed.objectKey,
    maxSize: parsed.maxSize,
    uploadConstraints: parsed.uploadConstraints,
    metadata: parsed.metadata,
    expiresAt: parsed.expiredTime
  });

  return buildS3UploadUrl(token);
};

export const verifyS3UploadSessionToken = async (
  token: string,
  now = new Date()
): Promise<S3ProxyUploadPayload> => {
  const parsedToken = S3UploadTokenSchema.safeParse(token);

  if (!parsedToken.success) {
    throw new S3AccessLinkError(S3AccessLinkErrCode.uploadSessionNotFound);
  }

  const tokenHash = hashS3UploadToken(parsedToken.data);
  const session = await findS3UploadSessionByTokenHash(tokenHash);

  if (!session) {
    throw new S3AccessLinkError(S3AccessLinkErrCode.uploadSessionNotFound);
  }

  if (session.revokedAt) {
    throw new S3AccessLinkError(S3AccessLinkErrCode.uploadSessionRevoked);
  }

  if (session.expiresAt.getTime() <= now.getTime()) {
    throw new S3AccessLinkError(S3AccessLinkErrCode.uploadSessionExpired);
  }

  await markS3UploadSessionUsed(tokenHash);

  return S3ProxyUploadPayloadSchema.parse({
    bucketName: session.bucketName,
    objectKey: session.objectKey,
    maxSize: session.maxSize,
    uploadConstraints: session.uploadConstraints,
    metadata: session.metadata
  });
};

export const revokeS3UploadSessionToken = (token: string) => {
  return revokeS3UploadSessionByTokenHash(hashS3UploadToken(token));
};
