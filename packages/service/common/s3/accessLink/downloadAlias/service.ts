import {
  CreateS3DownloadAccessUrlParamsSchema,
  CreateS3DownloadAccessUrlsParamsSchema,
  VerifiedS3DownloadAccessSchema,
  type VerifiedS3DownloadAccess
} from '../type';
import { s3AccessLinkService } from '../accessLinkService';

/**
 * 创建或复用下载 alias，并返回带过期时间与 HMAC 签名的短 URL。
 *
 * 该函数只承载已经完成业务鉴权后的存储上下文，不做 app/dataset/team 等归属校验。
 * 调用方必须在传入 objectKey 前确认当前用户有权访问该文件。
 */
export const createS3DownloadAccessUrl = async (params: unknown) => {
  const parsed = CreateS3DownloadAccessUrlParamsSchema.parse(params);
  return s3AccessLinkService.createDownloadUrl(parsed);
};

/**
 * 批量创建或复用下载 alias，并按输入顺序返回短 URL。
 *
 * 调用方仍需在进入该函数前完成所有 objectKey 的业务归属校验。
 */
export const createS3DownloadAccessUrls = async (params: unknown) => {
  const parsed = CreateS3DownloadAccessUrlsParamsSchema.parse(params);
  return s3AccessLinkService.createDownloadUrls(parsed);
};

/**
 * 校验 signed alias 并返回文件代理下载 payload。
 *
 * URL 的过期由 `expMinute36 + HMAC` 保证；Mongo alias 只负责把短 id 映射回真实
 * `bucketName/objectKey`。
 */
export const verifyS3DownloadAccess = async (
  signedAlias: string
): Promise<VerifiedS3DownloadAccess> => {
  return VerifiedS3DownloadAccessSchema.parse(
    await s3AccessLinkService.verifyDownloadAlias(signedAlias)
  );
};

export const revokeS3DownloadAlias = (aliasId: string) => {
  return s3AccessLinkService.revokeDownloadAlias(aliasId);
};
