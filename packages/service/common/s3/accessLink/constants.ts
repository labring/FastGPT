export const S3_ACCESS_LINK_ROUTES = {
  download: '/api/system/file/d',
  upload: '/api/system/file/u'
} as const;

export const S3_DOWNLOAD_ALIAS_SIGN_VERSION = 'v1';
export const S3_DOWNLOAD_ALIAS_ID_LENGTH = 16;
export const S3_DOWNLOAD_SIGNATURE_LENGTH = 22;
export const S3_UPLOAD_TOKEN_LENGTH = 22;
export const S3_ACCESS_LINK_PURGE_GRACE_HOURS = 24;

export const S3_DOWNLOAD_EXPIRE_BUCKET_MS = {
  short: 15 * 60 * 1000,
  medium: 60 * 60 * 1000,
  long: 24 * 60 * 60 * 1000
} as const;

export const S3_DOWNLOAD_EXPIRE_BUCKET_THRESHOLD_MS = {
  short: 2 * 60 * 60 * 1000,
  medium: 24 * 60 * 60 * 1000
} as const;
