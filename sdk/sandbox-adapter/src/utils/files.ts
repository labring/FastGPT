import { asyncIterableToBuffer, readableStreamToAsyncIterable } from './streams';
import type { FileWriteEntry } from '@/types';

/**
 * Check structurally if the given data is a ReadableStream.
 */
export function isReadableStreamData(data: any): data is ReadableStream<Uint8Array> {
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

export const getWriteEntryByteLength = async (entry: FileWriteEntry): Promise<number> =>
  getFileDataByteLength(entry.data);

/**
 * Normalize any supported FileWriteEntry data type into a Uint8Array.
 */
export async function fileDataToUint8Array(
  data: string | Uint8Array | ArrayBuffer | Blob | ReadableStream<Uint8Array>
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
  if (isReadableStreamData(data)) {
    return asyncIterableToBuffer(readableStreamToAsyncIterable(data));
  }
  throw new TypeError('Unsupported file data type');
}

/**
 * Convert a Uint8Array view into an ArrayBuffer that contains exactly its visible bytes.
 */
export function uint8ArrayToCleanArrayBuffer(data: Uint8Array): ArrayBuffer {
  if (data.byteOffset === 0 && data.byteLength === data.buffer.byteLength) {
    return data.buffer as ArrayBuffer;
  }

  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}
