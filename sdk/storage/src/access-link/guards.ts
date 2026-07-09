import { S3_SIGNED_DOWNLOAD_ALIAS_PATTERN, S3_UPLOAD_TOKEN_PATTERN } from './constants';
import { S3AccessLinkErrCode, S3AccessLinkError, type S3AccessLinkErrorCode } from './errors';
import type {
  CreateS3DownloadAccessUrlParams,
  CreateS3UploadAccessUrlParams,
  S3ProxyUploadPayload,
  S3VerifiedDownloadPayload,
  S3UploadConstraints
} from './types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const assertNonEmptyString = (value: unknown, code: S3AccessLinkErrorCode): string => {
  if (typeof value !== 'string' || value.length === 0) {
    throw new S3AccessLinkError(code);
  }

  return value;
};

const assertDate = (value: unknown, code: S3AccessLinkErrorCode): Date => {
  const date = value instanceof Date ? value : new Date(value as string | number);

  if (!Number.isFinite(date.getTime())) {
    throw new S3AccessLinkError(code);
  }

  return date;
};

const assertPositiveNumber = (value: unknown, code: S3AccessLinkErrorCode): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new S3AccessLinkError(code);
  }

  return value;
};

const assertStringRecord = (
  value: unknown,
  code: S3AccessLinkErrorCode
): Record<string, string> | undefined => {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new S3AccessLinkError(code);

  for (const item of Object.values(value)) {
    if (typeof item !== 'string') throw new S3AccessLinkError(code);
  }

  return value as Record<string, string>;
};

const assertUploadConstraints = (
  value: unknown,
  code: S3AccessLinkErrorCode
): S3UploadConstraints => {
  if (!isRecord(value)) throw new S3AccessLinkError(code);

  const defaultContentType = assertNonEmptyString(value.defaultContentType, code);
  const allowedExtensions = (() => {
    if (value.allowedExtensions === undefined) return undefined;
    if (
      !Array.isArray(value.allowedExtensions) ||
      value.allowedExtensions.some((item) => typeof item !== 'string' || item.length === 0)
    ) {
      throw new S3AccessLinkError(code);
    }
    return value.allowedExtensions;
  })();

  return {
    defaultContentType,
    ...(allowedExtensions ? { allowedExtensions } : {})
  };
};

export const assertCreateDownloadParams = (
  params: CreateS3DownloadAccessUrlParams
): CreateS3DownloadAccessUrlParams => {
  if (!isRecord(params)) throw new S3AccessLinkError(S3AccessLinkErrCode.invalidSignedAlias);

  return {
    bucketName: assertNonEmptyString(params.bucketName, S3AccessLinkErrCode.invalidSignedAlias),
    objectKey: assertNonEmptyString(params.objectKey, S3AccessLinkErrCode.invalidSignedAlias),
    expiredTime: assertDate(params.expiredTime, S3AccessLinkErrCode.invalidSignedAlias),
    ...(params.filename !== undefined
      ? { filename: assertNonEmptyString(params.filename, S3AccessLinkErrCode.invalidSignedAlias) }
      : {}),
    ...(params.responseContentType !== undefined
      ? {
          responseContentType: assertNonEmptyString(
            params.responseContentType,
            S3AccessLinkErrCode.invalidSignedAlias
          )
        }
      : {})
  };
};

export const assertSignedAliasFormat = (value: string) => {
  if (!S3_SIGNED_DOWNLOAD_ALIAS_PATTERN.test(value)) {
    throw new S3AccessLinkError(S3AccessLinkErrCode.invalidSignedAlias);
  }
};

export const assertDownloadPayload = (
  payload: S3VerifiedDownloadPayload
): S3VerifiedDownloadPayload => {
  if (!isRecord(payload)) throw new S3AccessLinkError(S3AccessLinkErrCode.downloadAliasNotFound);

  return {
    bucketName: assertNonEmptyString(payload.bucketName, S3AccessLinkErrCode.downloadAliasNotFound),
    objectKey: assertNonEmptyString(payload.objectKey, S3AccessLinkErrCode.downloadAliasNotFound),
    expiresAt: assertDate(payload.expiresAt, S3AccessLinkErrCode.downloadAliasNotFound),
    ...(payload.filename !== undefined
      ? {
          filename: assertNonEmptyString(
            payload.filename,
            S3AccessLinkErrCode.downloadAliasNotFound
          )
        }
      : {}),
    ...(payload.responseContentType !== undefined
      ? {
          responseContentType: assertNonEmptyString(
            payload.responseContentType,
            S3AccessLinkErrCode.downloadAliasNotFound
          )
        }
      : {})
  };
};

export const assertCreateUploadParams = (
  params: CreateS3UploadAccessUrlParams
): CreateS3UploadAccessUrlParams => {
  if (!isRecord(params)) throw new S3AccessLinkError(S3AccessLinkErrCode.uploadSessionNotFound);

  return {
    bucketName: assertNonEmptyString(params.bucketName, S3AccessLinkErrCode.uploadSessionNotFound),
    objectKey: assertNonEmptyString(params.objectKey, S3AccessLinkErrCode.uploadSessionNotFound),
    expiredTime: assertDate(params.expiredTime, S3AccessLinkErrCode.uploadSessionNotFound),
    maxSize: assertPositiveNumber(params.maxSize, S3AccessLinkErrCode.uploadSessionNotFound),
    uploadConstraints: assertUploadConstraints(
      params.uploadConstraints,
      S3AccessLinkErrCode.uploadSessionNotFound
    ),
    ...(params.metadata !== undefined
      ? {
          metadata: assertStringRecord(params.metadata, S3AccessLinkErrCode.uploadSessionNotFound)
        }
      : {})
  };
};

export const assertUploadTokenFormat = (token: string) => {
  if (!S3_UPLOAD_TOKEN_PATTERN.test(token)) {
    throw new S3AccessLinkError(S3AccessLinkErrCode.uploadSessionNotFound);
  }
};

export const assertUploadPayload = (payload: S3ProxyUploadPayload): S3ProxyUploadPayload => {
  if (!isRecord(payload)) throw new S3AccessLinkError(S3AccessLinkErrCode.uploadSessionNotFound);

  return {
    bucketName: assertNonEmptyString(payload.bucketName, S3AccessLinkErrCode.uploadSessionNotFound),
    objectKey: assertNonEmptyString(payload.objectKey, S3AccessLinkErrCode.uploadSessionNotFound),
    maxSize: assertPositiveNumber(payload.maxSize, S3AccessLinkErrCode.uploadSessionNotFound),
    uploadConstraints: assertUploadConstraints(
      payload.uploadConstraints,
      S3AccessLinkErrCode.uploadSessionNotFound
    ),
    ...(payload.metadata !== undefined
      ? {
          metadata: assertStringRecord(payload.metadata, S3AccessLinkErrCode.uploadSessionNotFound)
        }
      : {})
  };
};
