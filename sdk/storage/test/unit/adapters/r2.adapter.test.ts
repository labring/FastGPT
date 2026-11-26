import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { R2StorageAdapter } from '../../../src/adapters/r2.adapter';

const createOptions = () => ({
  vendor: 'r2' as const,
  bucket: 'fastgpt-public',
  endpoint: 'https://account.r2.cloudflarestorage.com',
  region: 'auto',
  credentials: {
    accessKeyId: 'access-key',
    secretAccessKey: 'secret-key'
  }
});

describe('R2StorageAdapter.constructor', () => {
  it('accepts an R2 vendor', () => {
    expect(new R2StorageAdapter(createOptions())).toBeInstanceOf(R2StorageAdapter);
  });

  it('rejects a non-R2 vendor before creating the AWS-compatible client', () => {
    expect(
      () =>
        new R2StorageAdapter({
          ...createOptions(),
          vendor: 'aws-s3'
        } as never)
    ).toThrow('Invalid storage vendor: expected "r2"');
  });
});

describe('R2StorageAdapter.downloadObject', () => {
  it('inherits byte range downloads and rejects invalid ranges before dispatch', async () => {
    const adapter = new R2StorageAdapter(createOptions());
    const body = Readable.from([Buffer.from('r2-slice')]);
    const send = vi.fn().mockResolvedValue({ Body: body });
    (adapter as any).client.send = send;

    const result = await adapter.downloadObject({
      key: 'dataset/team/file.zip',
      range: { start: 10, end: 17 }
    });

    expect(result.body).toBe(body);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: {
          Bucket: 'fastgpt-public',
          Key: 'dataset/team/file.zip',
          Range: 'bytes=10-17'
        }
      }),
      { abortSignal: undefined }
    );

    send.mockClear();
    await expect(
      adapter.downloadObject({
        key: 'dataset/team/file.zip',
        range: { start: 10, end: 5 }
      })
    ).rejects.toThrow('Download range end must be a safe integer >= start');
    expect(send).not.toHaveBeenCalled();
  });
});
