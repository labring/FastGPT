export const S3_DOWNLOAD_ALIAS_SIGN_VERSION = 'v1';
export const S3_DOWNLOAD_ALIAS_ID_LENGTH = 16;
export const S3_DOWNLOAD_SIGNATURE_LENGTH = 22;
export const S3_UPLOAD_TOKEN_LENGTH = 22;
export const S3_DOWNLOAD_URL_BATCH_MAX_SIZE = 500;
export const S3_ACCESS_LINK_PURGE_GRACE_HOURS = 24;
// 在 alias 距离新链接过期时间只剩 1 小时时续租，避免每次签发都写 store。
export const S3_DOWNLOAD_ALIAS_LEASE_REFRESH_MARGIN_MS = 60 * 60 * 1000;

export const S3_DOWNLOAD_EXPIRE_BUCKET_MS = {
  short: 15 * 60 * 1000,
  medium: 60 * 60 * 1000,
  long: 24 * 60 * 60 * 1000
} as const;

export const S3_DOWNLOAD_EXPIRE_BUCKET_THRESHOLD_MS = {
  short: 2 * 60 * 60 * 1000,
  medium: 24 * 60 * 60 * 1000
} as const;

export const S3_SIGNED_DOWNLOAD_ALIAS_PATTERN =
  /^[A-Za-z0-9_-]{12,32}\.[0-9a-z]{1,8}\.[A-Za-z0-9_-]{16,64}$/;

export const S3_UPLOAD_TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,64}$/;
