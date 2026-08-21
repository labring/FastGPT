import jwt from 'jsonwebtoken';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import type { UploadConstraints } from '../contracts/type';
import { serviceEnv } from '../../../env';

export type S3ObjectKeyTokenPayload = {
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

/* ==================== 通用工具函数 ==================== */
const isRecord = (val: unknown): val is Record<string, unknown> =>
  !!val && typeof val === 'object' && !Array.isArray(val);

const isNonEmptyString = (val: unknown): val is string => typeof val === 'string' && val.length > 0;
const isStringArray = (val: unknown): val is string[] =>
  Array.isArray(val) && val.every(isNonEmptyString);

const endpointUrl = `${serviceEnv.FILE_DOMAIN || serviceEnv.FE_DOMAIN || ''}${serviceEnv.NEXT_PUBLIC_BASE_URL}`;

const parsePayload = <T>(payload: unknown, checker: (value: unknown) => value is T): T => {
  if (!checker(payload)) {
    throw ERROR_ENUM.unAuthFile;
  }
  return payload;
};

export const verifyToken = <T>(token: string, checker: (value: unknown) => value is T) => {
  return new Promise<T>((resolve, reject) => {
    jwt.verify(token, serviceEnv.FILE_TOKEN_KEY, (err, payload) => {
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
export const isS3ObjectKeyTokenPayload = (value: unknown): value is S3ObjectKeyTokenPayload => {
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

/* ==================== 代理下载 token ==================== */
export function jwtVerifyS3DownloadToken(token: string) {
  return verifyToken<S3DownloadTokenPayload>(token, isS3DownloadTokenPayload);
}

/* ==================== 代理上传 token ==================== */
export function jwtVerifyS3UploadToken(token: string) {
  return verifyToken<S3UploadTokenPayload>(token, isS3UploadTokenPayload);
}
