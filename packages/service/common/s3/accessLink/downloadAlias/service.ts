import { addHours } from 'date-fns';
import {
  CreateS3DownloadAccessUrlParamsSchema,
  S3ProxyDownloadPayloadSchema,
  type S3ProxyDownloadPayload
} from '../type';
import {
  assertS3DownloadAliasSignature,
  buildS3DownloadAliasKey,
  buildS3DownloadUrl,
  encodeExpiresAtMinute,
  generateS3AliasId,
  resolveDownloadExpiresAt,
  signS3DownloadAlias
} from '../utils';
import { S3AccessLinkErrCode, S3AccessLinkError } from '../error';
import { S3_ACCESS_LINK_PURGE_GRACE_HOURS } from '../constants';
import {
  createS3DownloadAlias,
  disableS3DownloadAliasByAliasId,
  findS3DownloadAliasByAliasId,
  findS3DownloadAliasByAliasKey,
  touchS3DownloadAliasPurgeAt
} from './entity';

/**
 * 创建或复用下载 alias，并返回带过期时间与 HMAC 签名的短 URL。
 *
 * 该函数只承载已经完成业务鉴权后的存储上下文，不做 app/dataset/team 等归属校验。
 * 调用方必须在传入 objectKey 前确认当前用户有权访问该文件。
 */
export const createS3DownloadAccessUrl = async (params: unknown) => {
  const parsed = CreateS3DownloadAccessUrlParamsSchema.parse(params);
  const now = new Date();
  const expiresAt = resolveDownloadExpiresAt(parsed.expiredTime, now);
  const expMinute36 = encodeExpiresAtMinute(expiresAt);
  const purgeAt = addHours(expiresAt, S3_ACCESS_LINK_PURGE_GRACE_HOURS);
  const aliasKey = buildS3DownloadAliasKey(parsed);

  const existingAlias = await findS3DownloadAliasByAliasKey(aliasKey);
  const alias =
    existingAlias ??
    (await createS3DownloadAlias({
      aliasId: generateS3AliasId(),
      aliasKey,
      bucketName: parsed.bucketName,
      objectKey: parsed.objectKey,
      filename: parsed.filename,
      responseContentType: parsed.responseContentType,
      lastIssuedAt: now,
      purgeAt
    }));

  if (!alias) {
    throw new S3AccessLinkError(S3AccessLinkErrCode.downloadAliasNotFound);
  }

  await touchS3DownloadAliasPurgeAt({
    aliasKey,
    purgeAt,
    now
  });

  const sig = signS3DownloadAlias({
    aliasId: alias.aliasId,
    expMinute36
  });

  return buildS3DownloadUrl(`${alias.aliasId}.${expMinute36}.${sig}`);
};

/**
 * 校验 signed alias 并返回文件代理下载 payload。
 *
 * URL 的过期由 `expMinute36 + HMAC` 保证；Mongo alias 只负责把短 id 映射回真实
 * `bucketName/objectKey`。
 */
export const verifyS3DownloadAccess = async (
  signedAlias: string
): Promise<S3ProxyDownloadPayload> => {
  const { aliasId } = assertS3DownloadAliasSignature(signedAlias);
  const alias = await findS3DownloadAliasByAliasId(aliasId);

  if (!alias) {
    throw new S3AccessLinkError(S3AccessLinkErrCode.downloadAliasNotFound);
  }

  if (alias.disabledAt) {
    throw new S3AccessLinkError(S3AccessLinkErrCode.downloadAliasRevoked);
  }

  return S3ProxyDownloadPayloadSchema.parse({
    bucketName: alias.bucketName,
    objectKey: alias.objectKey,
    filename: alias.filename,
    responseContentType: alias.responseContentType
  });
};

export const revokeS3DownloadAlias = (aliasId: string) => {
  return disableS3DownloadAliasByAliasId(aliasId);
};
