/**
 * Base64 encoding/decoding utilities.
 * Works in both Node.js and browser environments.
 */

/**
 * Encode a Uint8Array to base64 string.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  // Use built-in btoa for browser compatibility
  const binary = Array.from(bytes)
    .map((b) => String.fromCharCode(b))
    .join('');
  return btoa(binary);
}

/**
 * Decode a base64 string to Uint8Array.
 */
export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64.trim());
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Encode a string to base64.
 */
export function stringToBase64(str: string): string {
  return btoa(str);
}

/**
 * Decode a base64 string to utf-8 string.
 */
export function base64ToString(base64: string): string {
  return atob(base64.trim());
}
