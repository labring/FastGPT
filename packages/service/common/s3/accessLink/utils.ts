import { addMinutes, differenceInMilliseconds } from 'date-fns';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { serviceEnv } from '../../../env';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import {
  S3_ACCESS_LINK_ROUTES,
  S3_DOWNLOAD_ALIAS_ID_LENGTH,
  S3_DOWNLOAD_ALIAS_SIGN_VERSION,
  S3_DOWNLOAD_EXPIRE_BUCKET_MS,
  S3_DOWNLOAD_EXPIRE_BUCKET_THRESHOLD_MS,
  S3_DOWNLOAD_SIGNATURE_LENGTH,
  S3_UPLOAD_TOKEN_LENGTH
} from './constants';
import {
  ParsedS3SignedDownloadAliasSchema,
  S3SignedDownloadAliasValueSchema,
  type ParsedS3SignedDownloadAlias
} from './type';
import { S3AccessLinkErrCode, S3AccessLinkError } from './error';

const endpointUrl = `${serviceEnv.FILE_DOMAIN || serviceEnv.FE_DOMAIN || ''}${serviceEnv.NEXT_PUBLIC_BASE_URL}`;

const hmacSha256Hex = (value: string) =>
  createHmac('sha256', serviceEnv.FILE_TOKEN_KEY).update(value).digest('hex');

const hmacSha256Base64Url = (value: string) =>
  createHmac('sha256', serviceEnv.FILE_TOKEN_KEY).update(value).digest('base64url');

const constantTimeEqual = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) return false;

  return timingSafeEqual(leftBuffer, rightBuffer);
};

const getDownloadExpireBucketMs = (ttlMs: number) => {
  if (ttlMs <= S3_DOWNLOAD_EXPIRE_BUCKET_THRESHOLD_MS.short) {
    return S3_DOWNLOAD_EXPIRE_BUCKET_MS.short;
  }

  if (ttlMs <= S3_DOWNLOAD_EXPIRE_BUCKET_THRESHOLD_MS.medium) {
    return S3_DOWNLOAD_EXPIRE_BUCKET_MS.medium;
  }

  return S3_DOWNLOAD_EXPIRE_BUCKET_MS.long;
};

/**
 * 把下载链接过期时间向上归一到时间桶。
 *
 * 这样相同资源在短时间内反复签发时 URL 更稳定，同时不会让返回链接短于调用方请求的
 * `expiredTime`。如果调用方传入过去时间，则至少给 1 分钟有效期，保持与旧 JWT 签发的兜底语义一致。
 */
export const resolveDownloadExpiresAt = (expiredTime: Date, now = new Date()) => {
  const safeExpiredAt = new Date(Math.max(expiredTime.getTime(), addMinutes(now, 1).getTime()));
  const ttlMs = Math.max(1, differenceInMilliseconds(safeExpiredAt, now));
  const bucketMs = getDownloadExpireBucketMs(ttlMs);
  const expiresAtMs = Math.ceil(safeExpiredAt.getTime() / bucketMs) * bucketMs;

  return new Date(expiresAtMs);
};

export const encodeExpiresAtMinute = (date: Date) => {
  const unixMinute = Math.ceil(date.getTime() / 60_000);
  return unixMinute.toString(36);
};

export const decodeExpiresAtMinute = (value: string) => {
  const unixMinute = Number.parseInt(value, 36);

  if (!Number.isFinite(unixMinute) || unixMinute <= 0) {
    throw new S3AccessLinkError(S3AccessLinkErrCode.invalidSignedAlias);
  }

  return new Date(unixMinute * 60_000);
};

export const generateS3AliasId = () => getNanoid(S3_DOWNLOAD_ALIAS_ID_LENGTH);

export const generateS3UploadToken = () => getNanoid(S3_UPLOAD_TOKEN_LENGTH);

export const hashS3UploadToken = (token: string) => hmacSha256Hex(token);

export const buildS3DownloadAliasKey = ({
  bucketName,
  objectKey,
  filename,
  responseContentType
}: {
  bucketName: string;
  objectKey: string;
  filename?: string;
  responseContentType?: string;
}) => {
  const stablePayload = JSON.stringify({
    bucketName,
    objectKey,
    filename: filename ?? '',
    responseContentType: responseContentType ?? ''
  });

  return hmacSha256Hex(stablePayload);
};

export const signS3DownloadAlias = ({
  aliasId,
  expMinute36
}: {
  aliasId: string;
  expMinute36: string;
}) => {
  const signingInput = `s3-download:${S3_DOWNLOAD_ALIAS_SIGN_VERSION}:${aliasId}:${expMinute36}`;
  return hmacSha256Base64Url(signingInput).slice(0, S3_DOWNLOAD_SIGNATURE_LENGTH);
};

export const parseSignedS3DownloadAlias = (value: string): ParsedS3SignedDownloadAlias => {
  const parsedValue = S3SignedDownloadAliasValueSchema.safeParse(value);

  if (!parsedValue.success) {
    throw new S3AccessLinkError(S3AccessLinkErrCode.invalidSignedAlias);
  }

  const [aliasId, expMinute36, sig] = parsedValue.data.split('.');
  const parsed = ParsedS3SignedDownloadAliasSchema.safeParse({ aliasId, expMinute36, sig });

  if (!parsed.success) {
    throw new S3AccessLinkError(S3AccessLinkErrCode.invalidSignedAlias);
  }

  return parsed.data;
};

/**
 * 校验 signed alias 的格式、过期时间和 HMAC 签名。
 *
 * Mongo alias 只负责资源映射；URL 的有效期由 `expMinute36` 和 `sig` 保证。
 */
export const assertS3DownloadAliasSignature = (value: string, now = new Date()) => {
  const parsed = parseSignedS3DownloadAlias(value);
  const expiresAt = decodeExpiresAtMinute(parsed.expMinute36);

  if (expiresAt.getTime() <= now.getTime()) {
    throw new S3AccessLinkError(S3AccessLinkErrCode.expiredSignedAlias);
  }

  const expectedSig = signS3DownloadAlias({
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

export const buildS3DownloadUrl = (signedAlias: string) => {
  return `${endpointUrl}${S3_ACCESS_LINK_ROUTES.download}/${signedAlias}`;
};

export const buildS3UploadUrl = (token: string) => {
  return `${endpointUrl}${S3_ACCESS_LINK_ROUTES.upload}/${token}`;
};
