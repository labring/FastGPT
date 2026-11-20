export const S3_DOWNLOAD_ALIAS_SIGN_VERSION_V1 = 'v1';
export const S3_DOWNLOAD_ALIAS_SIGN_VERSION_V2 = 'v2';
export const S3_DOWNLOAD_ALIAS_SIGN_VERSION = S3_DOWNLOAD_ALIAS_SIGN_VERSION_V2;
export const S3_DOWNLOAD_ALIAS_ID_LENGTH = 16;
export const S3_DOWNLOAD_SIGNATURE_LENGTH = 22;
export const S3_UPLOAD_TOKEN_LENGTH = 22;
export const S3_MULTIPART_MAX_PART_COUNT = 10_000;
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

const S3_DOWNLOAD_ALIAS_ID_SOURCE = '[A-Za-z0-9_-]{12,32}';
const S3_DOWNLOAD_EXP_MINUTE36_SOURCE = '[0-9a-z]{1,8}';
const S3_DOWNLOAD_SIGNATURE_V1_SOURCE = '[A-Za-z0-9_-]{16,64}';
const S3_DOWNLOAD_SIGNATURE_V2_SOURCE = '[A-Za-z0-9]{16,64}';
const S3_DOWNLOAD_EXTENSION_SOURCE = '(?=[a-z0-9]*[a-z])[a-z0-9]{1,16}';

/** 短链可携带的安全文件扩展名（不含前导点，小写字母数字且至少含一个字母，避免纯数字版本号）。 */
export const S3_DOWNLOAD_EXTENSION_PATTERN = new RegExp(`^${S3_DOWNLOAD_EXTENSION_SOURCE}$`);

/** 存量 v1 点分格式：<aliasId>.<expMinute36>.<sig> */
export const S3_SIGNED_DOWNLOAD_ALIAS_V1_PATTERN = new RegExp(
  `^(${S3_DOWNLOAD_ALIAS_ID_SOURCE})\\.(${S3_DOWNLOAD_EXP_MINUTE36_SOURCE})\\.(${S3_DOWNLOAD_SIGNATURE_V1_SOURCE})$`
);

/** 新版 v2 连字符格式：v2-<aliasId>-<expMinute36>-<sig>[.<ext>] */
export const S3_SIGNED_DOWNLOAD_ALIAS_V2_PATTERN = new RegExp(
  `^${S3_DOWNLOAD_ALIAS_SIGN_VERSION_V2}-(${S3_DOWNLOAD_ALIAS_ID_SOURCE})-(${S3_DOWNLOAD_EXP_MINUTE36_SOURCE})-(${S3_DOWNLOAD_SIGNATURE_V2_SOURCE})(?:\\.(${S3_DOWNLOAD_EXTENSION_SOURCE}))?$`
);

export const S3_UPLOAD_TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,64}$/;
