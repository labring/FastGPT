import { assertStorageObjectKey } from '@fastgpt-sdk/storage';

/**
 * Encode an object key segment while preserving the S3 path separators.
 * Percent signs are encoded as literal input so distinct raw segments cannot
 * collapse to the same storage key.
 */
const encodeObjectKeySegment = (segment: string): string => encodeURIComponent(segment);

/**
 * Encode an object key before it is persisted or sent to object storage.
 * The function validates the encoded key internally and throws when the
 * resulting key violates the shared storage contract.
 */
export function encodeS3ObjectKey(key: string): string {
  const encodedKey = (() => {
    try {
      return key.split('/').map(encodeObjectKeySegment).join('/');
    } catch (error) {
      // Normalize malformed UTF-16 into the shared SDK validation error.
      assertStorageObjectKey(key);
      throw error;
    }
  })();
  assertStorageObjectKey(encodedKey);
  return encodedKey;
}
