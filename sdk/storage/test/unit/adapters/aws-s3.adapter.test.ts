import { PassThrough, Readable } from 'node:stream';
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
  it('rejects a pre-aborted download without dispatching an AWS request', async () => {
    const adapter = createAdapter();
    const send = vi.fn();
    (adapter as any).client.send = send;
    const controller = new AbortController();
    controller.abort();

    await expect(
      adapter.downloadObject({
        key: 'dataset/team/file.txt',
        abortSignal: controller.signal
      })
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(send).not.toHaveBeenCalled();
  });

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

  it('destroys an in-flight body with the caller abort reason', async () => {
    const adapter = createAdapter();
    const body = new PassThrough();
    (adapter as any).client.send = vi.fn().mockResolvedValue({ Body: body });
    const controller = new AbortController();
    const abortReason = new Error('client aborted');
    const result = await adapter.downloadObject({
      key: 'dataset/team/file.txt',
      abortSignal: controller.signal
    });
    result.body.on('error', () => {});

    controller.abort(abortReason);

    expect(result.body.errored).toBe(abortReason);
    expect(result.body.destroyed).toBe(true);
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

  it('preserves failures collected before a later listing page is empty', async () => {
    const adapter = createAdapter();
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        Contents: [{ Key: 'dataset/failed.txt' }],
        IsTruncated: true,
        NextContinuationToken: 'next-page'
      })
      .mockResolvedValueOnce({ Errors: [{ Key: 'dataset/failed.txt' }] })
      .mockResolvedValueOnce({ Contents: [], IsTruncated: false });
    (adapter as any).client.send = send;

    await expect(adapter.deleteObjectsByPrefix({ prefix: 'dataset/' })).resolves.toEqual({
      bucket: 'fastgpt-private',
      keys: ['dataset/failed.txt']
    });
  });
});

describe('AwsS3StorageAdapter.generatePublicGetUrl', () => {
  it.each([
    [
      { forcePathStyle: true, publicAccessExtraSubPath: undefined },
      'https://storage.example.com/fastgpt-private/folder%20name/file%20%23%2B.txt'
    ],
    [
      { forcePathStyle: true, publicAccessExtraSubPath: '/proxy/' },
      'https://storage.example.com/proxy/fastgpt-private/folder%20name/file%20%23%2B.txt'
    ],
    [
      { forcePathStyle: false, publicAccessExtraSubPath: undefined },
      'https://fastgpt-private.storage.example.com/folder%20name/file%20%23%2B.txt'
    ],
    [
      { forcePathStyle: false, publicAccessExtraSubPath: '/proxy/' },
      'https://fastgpt-private.storage.example.com/proxy/folder%20name/file%20%23%2B.txt'
    ]
  ])('encodes keys for options %j', (overrides, expectedUrl) => {
    const adapter = new AwsS3StorageAdapter({
      vendor: 'aws-s3',
      bucket: 'fastgpt-private',
      endpoint: 'https://storage.example.com',
      region: 'us-east-1',
      credentials: {
        accessKeyId: 'access-key',
        secretAccessKey: 'secret-key'
      },
      ...overrides
    });

    expect(adapter.generatePublicGetUrl({ key: 'folder name/file #+.txt' }).url).toBe(expectedUrl);
  });
});
