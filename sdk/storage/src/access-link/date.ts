import { S3_DOWNLOAD_EXPIRE_BUCKET_MS, S3_DOWNLOAD_EXPIRE_BUCKET_THRESHOLD_MS } from './constants';
import { S3AccessLinkErrCode, S3AccessLinkError } from './errors';

const addMinutes = (date: Date, minutes: number) => new Date(date.getTime() + minutes * 60_000);
export const addHours = (date: Date, hours: number) =>
  new Date(date.getTime() + hours * 60 * 60_000);

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
 * Rounds a requested download expiry up to a stable bucket without shortening
 * the caller-requested lifetime.
 */
export const resolveDownloadExpiresAt = (expiredTime: Date, now = new Date()) => {
  const safeExpiredAt = new Date(Math.max(expiredTime.getTime(), addMinutes(now, 1).getTime()));
  const ttlMs = Math.max(1, safeExpiredAt.getTime() - now.getTime());
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
