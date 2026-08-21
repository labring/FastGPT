import {
  constantTimeEqual,
  createS3AccessLinkCrypto,
  decodeExpiresAtMinute,
  encodeExpiresAtMinute,
  parseSignedS3DownloadAlias as parseSdkSignedS3DownloadAlias,
  resolveDownloadExpiresAt
} from '@fastgpt-sdk/storage';
import { serviceEnv } from '../../../env';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { S3_DOWNLOAD_ALIAS_ID_LENGTH, S3_UPLOAD_TOKEN_LENGTH } from './constants';
import { ParsedS3SignedDownloadAliasSchema, type ParsedS3SignedDownloadAlias } from './type';
import { S3AccessLinkErrCode, S3AccessLinkError } from './error';
import { buildS3AccessLinkDownloadUrl, buildS3AccessLinkUploadUrl } from './url';

const s3AccessLinkCrypto = createS3AccessLinkCrypto({ secret: serviceEnv.FILE_TOKEN_KEY });

export const generateS3AliasId = () => getNanoid(S3_DOWNLOAD_ALIAS_ID_LENGTH);

export const generateS3UploadToken = () => getNanoid(S3_UPLOAD_TOKEN_LENGTH);

export const hashS3UploadToken = (token: string) => s3AccessLinkCrypto.hashUploadToken(token);

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
  return s3AccessLinkCrypto.buildDownloadAliasKey({
    bucketName,
    objectKey,
    filename,
    responseContentType
  });
};

export const signS3DownloadAlias = ({
  aliasId,
  expMinute36
}: {
  aliasId: string;
  expMinute36: string;
}) => {
  return s3AccessLinkCrypto.signDownloadAlias({ aliasId, expMinute36 });
};

export const parseSignedS3DownloadAlias = (value: string): ParsedS3SignedDownloadAlias => {
  const parsed = ParsedS3SignedDownloadAliasSchema.safeParse(parseSdkSignedS3DownloadAlias(value));

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
  return buildS3AccessLinkDownloadUrl(signedAlias);
};

export const buildS3UploadUrl = (token: string) => {
  return buildS3AccessLinkUploadUrl(token);
};

export { decodeExpiresAtMinute, encodeExpiresAtMinute, resolveDownloadExpiresAt };
