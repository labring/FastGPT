import type { FileWriteEntry } from '@/types';

/**
 * Check structurally if the given data is a ReadableStream.
 */
export function isReadableStreamData(data: unknown): data is ReadableStream<Uint8Array> {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof (data as ReadableStream<Uint8Array>).getReader === 'function'
  );
}

/**
 * Compute the caller-visible byte length without buffering stream inputs.
 */
export function getFileDataByteLength(data: FileWriteEntry['data']): number {
  if (typeof data === 'string') {
    return new TextEncoder().encode(data).byteLength;
  }
  if (data instanceof Uint8Array) {
    return data.byteLength;
  }
  if (data instanceof ArrayBuffer) {
    return data.byteLength;
  }
  if (data instanceof Blob) {
    return data.size;
  }
  return 0;
}

/**
 * Normalize an in-memory file payload into bytes. Stream payloads must stay on a streaming path.
 */
export async function fileDataToUint8Array(
  data: Exclude<FileWriteEntry['data'], ReadableStream<Uint8Array>>
): Promise<Uint8Array> {
  if (typeof data === 'string') {
    return new TextEncoder().encode(data);
  }
  if (data instanceof Uint8Array) {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  if (data instanceof Blob) {
    const arrayBuffer = await data.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }
  throw new TypeError('Unsupported file data type');
}

/** Convert the public POSIX bitmask form (`0o644`) to provider octal digits (`644`). */
export function posixModeToOctalNumber(mode: number): number {
  if (!Number.isSafeInteger(mode) || mode < 0 || mode > 0o7777) {
    throw new TypeError(`Invalid POSIX file mode: ${String(mode)}`);
  }
  return Number.parseInt(mode.toString(8), 10);
}

/** Convert provider octal digits (`644`) to the public POSIX bitmask form (`0o644`). */
export function octalNumberToPosixMode(mode: number): number {
  if (!Number.isSafeInteger(mode) || mode < 0 || !/^[0-7]+$/.test(String(mode))) {
    throw new TypeError(`Invalid provider file mode: ${String(mode)}`);
  }
  return Number.parseInt(String(mode), 8);
}
