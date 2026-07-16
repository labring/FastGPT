import {
  CreateS3UploadAccessUrlParamsSchema,
  S3ProxyUploadPayloadSchema,
  type S3ProxyUploadPayload
} from '../type';
import { s3AccessLinkService } from '../accessLinkService';

/**
 * 创建一次上传会话并返回短上传 URL。
 *
 * 上传 session 承载 maxSize/uploadConstraints/metadata 等服务端策略，不按 objectKey 复用，
 * 避免重复 PUT、覆盖对象和策略变更不生效。
 */
export const createS3UploadAccessUrl = async (params: unknown) => {
  const parsed = CreateS3UploadAccessUrlParamsSchema.parse(params);
  return s3AccessLinkService.createUploadUrl(parsed);
};

export const verifyS3UploadSessionToken = async (token: string): Promise<S3ProxyUploadPayload> => {
  return S3ProxyUploadPayloadSchema.parse(await s3AccessLinkService.verifyUploadToken(token));
};

export const revokeS3UploadSessionToken = (token: string) => {
  return s3AccessLinkService.revokeUploadToken(token);
};
