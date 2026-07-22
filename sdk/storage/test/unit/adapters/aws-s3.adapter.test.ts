import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { AwsS3StorageAdapter } from '../../../src/adapters/aws-s3.adapter';

const createAdapter = () =>
  new AwsS3StorageAdapter({
    vendor: 'aws-s3',
    bucket: 'fastgpt-private',
    endpoint: 'http://localhost:9000',
    region: 'us-east-1',
    forcePathStyle: true,
    maxRetries: 1,
    credentials: {
      accessKeyId: 'access-key',
      secretAccessKey: 'secret-key'
    }
  });

describe('AwsS3StorageAdapter.downloadObject', () => {
  it('passes the caller abort signal to the AWS request handler', async () => {
    const adapter = createAdapter();
    const body = Readable.from([Buffer.from('file')]);
    const send = vi.fn().mockResolvedValue({ Body: body });
    (adapter as any).client.send = send;
    const controller = new AbortController();

    const result = await adapter.downloadObject({
      key: 'dataset/team/file.txt',
      abortSignal: controller.signal
    });

    expect(result.body).toBe(body);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: {
          Bucket: 'fastgpt-private',
          Key: 'dataset/team/file.txt'
        }
      }),
      { abortSignal: controller.signal }
    );
  });
});

describe('AwsS3StorageAdapter.deleteObjectsByPrefix', () => {
  it('rejects a whitespace-only prefix without calling S3', async () => {
    const adapter = createAdapter();
    const send = vi.fn();
    (adapter as any).client.send = send;

    await expect(adapter.deleteObjectsByPrefix({ prefix: '   ' })).rejects.toThrow(
      'Prefix is required'
    );
    expect(send).not.toHaveBeenCalled();
  });
});
