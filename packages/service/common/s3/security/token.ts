import jwt from 'jsonwebtoken';
import { differenceInSeconds } from 'date-fns';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { EndpointUrl } from '@fastgpt/global/common/file/constants';
import type { UploadConstraints } from '../contracts/type';
import path from 'path';
import { env } from '../../../env';

/* ==================== 路由与类型 ==================== */
const FileApiPath = {
  legacyFile: '/api/system/file',
  proxyDownload: '/api/system/file/download',
  proxyUpload: '/api/system/file/upload'
} as const;

type S3ObjectKeyTokenPayload = {
  objectKey: string;
};

type S3DownloadTokenPayload = {
  objectKey: string;
  bucketName: string;
  type: 'download';
};

type S3UploadTokenPayload = {
  objectKey: string;
  bucketName: string;
  maxSize: number;
  uploadConstraints: UploadConstraints;
  metadata?: Record<string, string>;
  type: 'upload';
};

type SignS3DownloadTokenParams = {
  objectKey: string;
  bucketName: string;
  expiredTime: Date;
  filename?: string;
};

type SignS3UploadTokenParams = {
  objectKey: string;
  bucketName: string;
  expiredTime: Date;
  maxSize: number;
  uploadConstraints: UploadConstraints;
  metadata?: Record<string, string>;
};

/* ==================== 通用工具函数 ==================== */
const getTokenSecret = () => env.FILE_TOKEN_KEY;

const getExpiresIn = (expiredTime: Date) => {
  return Math.max(1, differenceInSeconds(expiredTime, new Date()));
};

const isRecord = (val: unknown): val is Record<string, unknown> =>
  !!val && typeof val === 'object' && !Array.isArray(val);

const isNonEmptyString = (val: unknown): val is string => typeof val === 'string' && val.length > 0;
const isStringArray = (val: unknown): val is string[] =>
  Array.isArray(val) && val.every(isNonEmptyString);

const buildFileApiUrl = (apiPath: string, token: string, query = '') => {
  return `${EndpointUrl}${apiPath}/${token}${query}`;
};

const parsePayload = <T>(payload: unknown, checker: (value: unknown) => value is T): T => {
  if (!checker(payload)) {
    throw ERROR_ENUM.unAuthFile;
  }
  return payload;
};

const signToken = <T extends object>(payload: T, expiredTime: Date) => {
  return jwt.sign(payload, getTokenSecret(), {
    expiresIn: getExpiresIn(expiredTime)
  });
};

const verifyToken = <T>(token: string, checker: (value: unknown) => value is T) => {
  return new Promise<T>((resolve, reject) => {
    jwt.verify(token, getTokenSecret(), (err, payload) => {
      if (err) {
        return reject(ERROR_ENUM.unAuthFile);
      }
      try {
        resolve(parsePayload(payload, checker));
      } catch (error) {
        reject(error);
      }
    });
  });
};

/* ==================== Payload 校验器 ==================== */
const isS3ObjectKeyTokenPayload = (value: unknown): value is S3ObjectKeyTokenPayload => {
  return isRecord(value) && isNonEmptyString(value.objectKey) && value.type === undefined;
};

const isS3DownloadTokenPayload = (value: unknown): value is S3DownloadTokenPayload => {
  return (
    isRecord(value) &&
    value.type === 'download' &&
    isNonEmptyString(value.objectKey) &&
    isNonEmptyString(value.bucketName)
  );
};

const isUploadConstraints = (value: unknown): value is UploadConstraints => {
  return (
    isRecord(value) &&
    isNonEmptyString(value.defaultContentType) &&
    (value.allowedExtensions === undefined || isStringArray(value.allowedExtensions))
  );
};

const isS3UploadTokenPayload = (value: unknown): value is S3UploadTokenPayload => {
  return (
    isRecord(value) &&
    value.type === 'upload' &&
    isNonEmptyString(value.objectKey) &&
    isNonEmptyString(value.bucketName) &&
    typeof value.maxSize === 'number' &&
    value.maxSize > 0 &&
    isUploadConstraints(value.uploadConstraints)
  );
};

/* ==================== 旧版文件链接 token ==================== */
export function jwtSignS3ObjectKey(objectKey: string, expiredTime: Date) {
  const token = signToken({ objectKey } satisfies S3ObjectKeyTokenPayload, expiredTime);

  return buildFileApiUrl(FileApiPath.legacyFile, token);
}

export function jwtVerifyS3ObjectKey(token: string) {
  return verifyToken<S3ObjectKeyTokenPayload>(token, isS3ObjectKeyTokenPayload);
}

/* ==================== 代理下载 token ==================== */
export function jwtSignS3DownloadToken({
  objectKey,
  bucketName,
  expiredTime,
  filename
}: SignS3DownloadTokenParams) {
  const token = signToken(
    {
      objectKey,
      bucketName,
      type: 'download'
    } satisfies S3DownloadTokenPayload,
    expiredTime
  );

  const finalFilename = filename || path.basename(objectKey) || '';
  const query = finalFilename ? `?filename=${encodeURIComponent(finalFilename)}` : '';

  return buildFileApiUrl(FileApiPath.proxyDownload, token, query);
}

export function jwtVerifyS3DownloadToken(token: string) {
  return verifyToken<S3DownloadTokenPayload>(token, isS3DownloadTokenPayload);
}

/* ==================== 代理上传 token ==================== */
export function jwtSignS3UploadToken({
  objectKey,
  bucketName,
  expiredTime,
  maxSize,
  uploadConstraints,
  metadata
}: SignS3UploadTokenParams) {
  const token = signToken(
    {
      objectKey,
      bucketName,
      maxSize,
      uploadConstraints,
      metadata,
      type: 'upload'
    } satisfies S3UploadTokenPayload,
    expiredTime
  );

  return buildFileApiUrl(FileApiPath.proxyUpload, token);
}

export function jwtVerifyS3UploadToken(token: string) {
  return verifyToken<S3UploadTokenPayload>(token, isS3UploadTokenPayload);
}
