import type { FileWriteEntry } from '@/types';

const VERIFY_UPLOAD_CONTENT_MAX_BYTES = 1024 * 1024;

type ReplayableWriteData = Exclude<FileWriteEntry['data'], ReadableStream<Uint8Array>>;

export type CommittedUploadVerificationDeps = {
  getCommittedFileSize: (path: string) => Promise<number | undefined>;
  readCommittedFileBytes: (path: string) => Promise<Uint8Array | undefined>;
};

export type VerifyCommittedUploadParams = CommittedUploadVerificationDeps & {
  entry: FileWriteEntry;
  normalizedPath: string;
  bytesWritten: number;
  error: unknown;
};

/**
 * Detect streams structurally instead of relying on `instanceof ReadableStream`;
 * Node and browser/polyfilled streams can come from different realms.
 */
export const isReadableStreamData = (
  data: FileWriteEntry['data']
): data is ReadableStream<Uint8Array> =>
  typeof data === 'object' &&
  data !== null &&
  typeof (data as ReadableStream<Uint8Array>).getReader === 'function';

/**
 * Computes expected bytes without buffering large in-memory inputs again.
 *
 * Strings need UTF-8 encoding length, while binary types already expose byte length/size.
 * Streams return 0 because committed-upload recovery never accepts stream uploads.
 */
export const getWriteEntryByteLength = async (entry: FileWriteEntry): Promise<number> => {
  if (typeof entry.data === 'string') return new TextEncoder().encode(entry.data).byteLength;
  if (entry.data instanceof Uint8Array) return entry.data.byteLength;
  if (entry.data instanceof ArrayBuffer) return entry.data.byteLength;
  if (entry.data instanceof Blob) return entry.data.size;
  if (isReadableStreamData(entry.data)) return 0;
  return 0;
};

/**
 * Converts Uint8Array inputs to a clean ArrayBuffer for the OpenSandbox SDK.
 *
 * Node Buffers and pooled Uint8Arrays may have a non-zero byteOffset. Passing the backing buffer
 * directly would upload unrelated bytes, so sliced views become standalone ArrayBuffers.
 */
export const toOpenSandboxWriteData = (data: FileWriteEntry['data']): FileWriteEntry['data'] => {
  if (!(data instanceof Uint8Array)) return data;

  if (data.byteOffset === 0 && data.byteLength === data.buffer.byteLength) {
    return data.buffer as ArrayBuffer;
  }

  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
};

export const isReplayableWriteData = (data: FileWriteEntry['data']): data is ReplayableWriteData =>
  !isReadableStreamData(data);

const toWriteEntryBytes = async (data: ReplayableWriteData): Promise<Uint8Array> => {
  if (typeof data === 'string') return new TextEncoder().encode(data);
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (data instanceof Blob) return new Uint8Array(await data.arrayBuffer());
  throw new TypeError('Unsupported write data');
};

/**
 * True only for OpenSandbox upload failures that may represent committed-but-failed responses.
 */
export const isUploadFalseNegativeCandidate = (error: unknown): boolean => {
  const err = error as { message?: string; statusCode?: number; error?: { message?: string } };
  const message = err?.message || err?.error?.message || '';
  if (!message.includes('Upload failed')) return false;
  return typeof err.statusCode === 'number' ? err.statusCode >= 500 : true;
};

/**
 * Detects the OpenSandbox upload false-negative observed in local integration tests.
 *
 * OpenSandbox `/files/upload` can return 500 after the file has already been committed. This
 * function only converts that failure to success when committed file state is strong enough:
 * non-upload errors stay failures; metadata writes stay failures; streams are not replayable;
 * large files use size-only confirmation; small files must match byte-for-byte.
 */
export const verifyCommittedUpload = async ({
  entry,
  normalizedPath,
  bytesWritten,
  error,
  getCommittedFileSize,
  readCommittedFileBytes
}: VerifyCommittedUploadParams): Promise<boolean> => {
  if (!isUploadFalseNegativeCandidate(error)) return false;

  // Size/content checks do not prove chmod/chown semantics, so preserve the original failure
  // whenever callers ask the SDK to set file metadata as part of the upload.
  if (entry.mode !== undefined || entry.owner !== undefined || entry.group !== undefined) {
    return false;
  }

  if (!isReplayableWriteData(entry.data)) return false;

  const committedSize = await getCommittedFileSize(normalizedPath);
  if (committedSize !== bytesWritten) return false;

  // Large files avoid a second full read. The false-negative symptom happens after the server
  // writes the file, so matching size is the bounded-cost acceptance signal.
  if (bytesWritten > VERIFY_UPLOAD_CONTENT_MAX_BYTES) {
    return true;
  }

  const expectedBytes = await toWriteEntryBytes(entry.data);
  const actualBytes = await readCommittedFileBytes(normalizedPath);
  if (!actualBytes || actualBytes.byteLength !== expectedBytes.byteLength) return false;

  for (let i = 0; i < expectedBytes.byteLength; i += 1) {
    if (actualBytes[i] !== expectedBytes[i]) return false;
  }
  return true;
};
