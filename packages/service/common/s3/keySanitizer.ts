import { assertStorageObjectKey } from '@fastgpt-sdk/storage';

/**
 * Encode an object key segment while preserving the S3 path separators.
 * Existing percent-encoded segments are decoded once first so the result is
 * canonical and safe to pass through this function repeatedly.
 */
const encodeObjectKeySegment = (segment: string): string => {
  let decodedSegment = segment;
  try {
    decodedSegment = decodeURIComponent(segment);
  } catch {
    // Invalid percent sequences are treated as literal characters and encoded below.
  }
  return encodeURIComponent(decodedSegment);
};

/**
 * Encode an object key before it is persisted or sent to object storage.
 * The function validates the encoded key internally and throws when the
 * resulting key violates the shared storage contract.
 */
export function encodeS3ObjectKey(key: string): string {
  const encodedKey = key.split('/').map(encodeObjectKeySegment).join('/');
  assertStorageObjectKey(encodedKey);
  return encodedKey;
}
