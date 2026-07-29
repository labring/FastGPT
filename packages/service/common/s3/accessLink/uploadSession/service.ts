import {
  CreateS3UploadAccessUrlParamsSchema,
  S3ProxyUploadPayloadSchema,
  type S3ProxyUploadPayload
} from '../type';
import { s3AccessLinkService } from '../accessLinkService';

/**
 * 创建一次上传会话并返回短上传 URL。
 *
 * 上传 session 承载 maxSize/uploadPolicy/metadata 等服务端策略，不按 objectKey 复用，
 * 避免重复 PUT、覆盖对象和策略变更不生效。
 */
export const createS3UploadAccessUrl = async (params: unknown) => {
  const parsed = CreateS3UploadAccessUrlParamsSchema.parse(params);
  return s3AccessLinkService.createUploadUrl(parsed);
};

export const verifyS3UploadSessionToken = async (token: string): Promise<S3ProxyUploadPayload> => {
  return S3ProxyUploadPayloadSchema.parse(await s3AccessLinkService.verifyUploadToken(token));
};

/** 校验并返回 Multipart session，供分片、完成和取消流程复用同一 token。 */
export const verifyS3MultipartUploadSessionToken = async (token: string) => {
  const payload = await verifyS3UploadSessionToken(token);
  if (!payload.multipart) {
    throw new Error('Not a multipart upload session');
  }
  return payload;
};

/** 将已占用完成权的 Multipart session 从 completing 原子地标记为 completed。 */
export const markS3MultipartUploadCompleted = (token: string, completedAt?: Date) => {
  return s3AccessLinkService.markMultipartCompleted({ token, completedAt });
};

/** 原子地占用 Multipart 完成权，防止 complete 与 abort 并发操作同一个 provider upload。 */
export const markS3MultipartUploadCompleting = (token: string, completingAt?: Date) => {
  return s3AccessLinkService.markMultipartCompleting({ token, completingAt });
};

/** 仅在 completing 租约过期后重新占用完成权，允许网络超时后的 complete 重试。 */
export const retryS3MultipartUploadCompleting = (token: string, reclaimBefore: Date) => {
  return s3AccessLinkService.markMultipartCompleting({ token, reclaimBefore });
};

/** 将已占用完成权但 provider complete 失败的 session 标记为 aborted。 */
export const markS3MultipartUploadCompleteFailed = (token: string, abortedAt?: Date) => {
  return s3AccessLinkService.markMultipartCompleteFailed({ token, abortedAt });
};

/** 将 Multipart session 从 active 原子地标记为 aborted。 */
export const markS3MultipartUploadAborted = (token: string, abortedAt?: Date) => {
  return s3AccessLinkService.markMultipartAborted({ token, abortedAt });
};

export const revokeS3UploadSessionToken = (token: string) => {
  return s3AccessLinkService.revokeUploadToken(token);
};
