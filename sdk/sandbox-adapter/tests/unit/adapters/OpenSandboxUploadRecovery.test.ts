import { describe, expect, it, vi } from 'vitest';
import {
  getWriteEntryByteLength,
  isUploadFalseNegativeCandidate,
  toOpenSandboxWriteData,
  verifyCommittedUpload
} from '@/adapters/OpenSandboxAdapter/uploadRecovery';

const makeUploadError = (statusCode = 500) =>
  Object.assign(new Error(`Upload failed (status=${statusCode})`), { statusCode });

describe('OpenSandbox upload recovery', () => {
  it('detects only upload 5xx errors as false-negative candidates', () => {
    expect(isUploadFalseNegativeCandidate(makeUploadError(500))).toBe(true);
    expect(isUploadFalseNegativeCandidate(makeUploadError(503))).toBe(true);
    expect(isUploadFalseNegativeCandidate(makeUploadError(400))).toBe(false);
    expect(isUploadFalseNegativeCandidate(new Error('network failed'))).toBe(false);
  });

  it('calculates caller-visible bytes before SDK data conversion', async () => {
    const pooledBuffer = new ArrayBuffer(10);
    const data = new Uint8Array(pooledBuffer, 2, 3);

    await expect(getWriteEntryByteLength({ path: '/file.bin', data })).resolves.toBe(3);
  });

  it('converts offset Uint8Array data to a clean ArrayBuffer', () => {
    const pooledBuffer = new ArrayBuffer(6);
    const full = new Uint8Array(pooledBuffer);
    full.set([1, 2, 3, 4, 5, 6]);

    const converted = toOpenSandboxWriteData(new Uint8Array(pooledBuffer, 2, 3));

    expect(converted).toBeInstanceOf(ArrayBuffer);
    expect(Array.from(new Uint8Array(converted as ArrayBuffer))).toEqual([3, 4, 5]);
  });

  it('accepts small committed uploads only when bytes match exactly', async () => {
    const expected = new TextEncoder().encode('hello');

    await expect(
      verifyCommittedUpload({
        entry: { path: '/hello.txt', data: 'hello' },
        normalizedPath: '/hello.txt',
        bytesWritten: expected.byteLength,
        error: makeUploadError(),
        getCommittedFileSize: vi.fn(async () => expected.byteLength),
        readCommittedFileBytes: vi.fn(async () => expected)
      })
    ).resolves.toBe(true);

    await expect(
      verifyCommittedUpload({
        entry: { path: '/hello.txt', data: 'hello' },
        normalizedPath: '/hello.txt',
        bytesWritten: expected.byteLength,
        error: makeUploadError(),
        getCommittedFileSize: vi.fn(async () => expected.byteLength),
        readCommittedFileBytes: vi.fn(async () => new TextEncoder().encode('HELLO'))
      })
    ).resolves.toBe(false);
  });

  it('uses size-only confirmation for large committed uploads', async () => {
    const data = new Uint8Array(1024 * 1024 + 1);
    const readCommittedFileBytes = vi.fn(async () => data);

    await expect(
      verifyCommittedUpload({
        entry: { path: '/large.bin', data },
        normalizedPath: '/large.bin',
        bytesWritten: data.byteLength,
        error: makeUploadError(),
        getCommittedFileSize: vi.fn(async () => data.byteLength),
        readCommittedFileBytes
      })
    ).resolves.toBe(true);

    expect(readCommittedFileBytes).not.toHaveBeenCalled();
  });

  it('does not recover metadata writes or stream uploads', async () => {
    const getCommittedFileSize = vi.fn(async () => 0);
    const readCommittedFileBytes = vi.fn(async () => new Uint8Array());
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close();
      }
    });

    await expect(
      verifyCommittedUpload({
        entry: { path: '/mode.txt', data: 'ok', mode: 0o644 },
        normalizedPath: '/mode.txt',
        bytesWritten: 2,
        error: makeUploadError(),
        getCommittedFileSize,
        readCommittedFileBytes
      })
    ).resolves.toBe(false);

    await expect(
      verifyCommittedUpload({
        entry: { path: '/stream.bin', data: stream },
        normalizedPath: '/stream.bin',
        bytesWritten: 0,
        error: makeUploadError(),
        getCommittedFileSize,
        readCommittedFileBytes
      })
    ).resolves.toBe(false);

    expect(getCommittedFileSize).not.toHaveBeenCalled();
    expect(readCommittedFileBytes).not.toHaveBeenCalled();
  });
});
