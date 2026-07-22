import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMinioTimeoutTransport,
  MinioS3NotFound,
  MinioStorageAdapter
} from '../../../src/adapters/minio.adapter';

describe('createMinioTimeoutTransport', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('destroys the underlying request when the request timeout expires', () => {
    vi.useFakeTimers();
    const destroy = vi.fn();
    const request = {
      once: vi.fn(),
      destroy
    };
    const transport = {
      request: vi.fn(() => request)
    };
    const timeoutTransport = createMinioTimeoutTransport({
      transport: transport as any,
      timeoutMs: 1234
    });

    expect(timeoutTransport.request({} as any)).toBe(request);
    vi.advanceTimersByTime(1234);

    expect(destroy).toHaveBeenCalledOnce();
    expect(destroy.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ message: 'MinIO request timeout after 1234ms' })
    );
  });

  it('clears the timeout when the request closes', () => {
    vi.useFakeTimers();
    const destroy = vi.fn();
    const request = {
      once: vi.fn(),
      destroy
    };
    const timeoutTransport = createMinioTimeoutTransport({
      transport: { request: vi.fn(() => request) } as any,
      timeoutMs: 1234
    });

    timeoutTransport.request({} as any);
    expect(request.once).toHaveBeenCalledWith('close', expect.any(Function));
    request.once.mock.calls[0]?.[1]();
    vi.advanceTimersByTime(1234);

    expect(destroy).not.toHaveBeenCalled();
  });
});

const createAdapter = () =>
  new MinioStorageAdapter({
    vendor: 'minio',
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

describe('MinioStorageAdapter.constructor', () => {
  it('rejects a non-MinIO vendor', () => {
    expect(
      () =>
        new MinioStorageAdapter({
          vendor: 'aws-s3',
          bucket: 'fastgpt-private',
          endpoint: 'http://localhost',
          region: 'us-east-1',
          credentials: {
            accessKeyId: 'access-key',
            secretAccessKey: 'secret-key'
          }
        })
    ).toThrow('Invalid storage vendor: expected "minio"');
  });

  it.each(['http://localhost', 'https://localhost'])(
    'accepts an endpoint without an explicit port: %s',
    (endpoint) => {
      expect(
        new MinioStorageAdapter({
          vendor: 'minio',
          bucket: 'fastgpt-private',
          endpoint,
          region: 'us-east-1',
          credentials: {
            accessKeyId: 'access-key',
            secretAccessKey: 'secret-key'
          }
        })
      ).toBeInstanceOf(MinioStorageAdapter);
    }
  );
});

describe('MinioStorageAdapter.deleteObject', () => {
  it('deletes one object with the MinIO client', async () => {
    const adapter = createAdapter();
    const removeObject = vi.fn().mockResolvedValue(undefined);
    (adapter as any).minioClient.removeObject = removeObject;

    await expect(adapter.deleteObject({ key: 'dataset/file.txt' })).resolves.toEqual({
      bucket: 'fastgpt-private',
      key: 'dataset/file.txt'
    });
    expect(removeObject).toHaveBeenCalledWith('fastgpt-private', 'dataset/file.txt');
  });
});

describe('MinioStorageAdapter.deleteObjectsByMultiKeys', () => {
  it('returns without calling MinIO for an empty key list', async () => {
    const adapter = createAdapter();
    const removeObjects = vi.fn().mockResolvedValue(undefined);
    (adapter as any).minioClient.removeObjects = removeObjects;

    await expect(adapter.deleteObjectsByMultiKeys({ keys: [] })).resolves.toEqual({
      bucket: 'fastgpt-private',
      keys: []
    });
    expect(removeObjects).not.toHaveBeenCalled();
  });

  it('splits deletion into batches of at most 1000 keys', async () => {
    const adapter = createAdapter();
    const removeObjects = vi
      .fn()
      .mockResolvedValueOnce([{ Key: 'dataset/file-3.txt' }])
      .mockResolvedValueOnce([{ Error: { Key: 'dataset/file-1000.txt' } }]);
    const keys = Array.from({ length: 1001 }, (_, index) => `dataset/file-${index}.txt`);
    (adapter as any).minioClient.removeObjects = removeObjects;

    await expect(adapter.deleteObjectsByMultiKeys({ keys })).resolves.toEqual({
      bucket: 'fastgpt-private',
      keys: ['dataset/file-3.txt', 'dataset/file-1000.txt']
    });
    expect(removeObjects).toHaveBeenNthCalledWith(1, 'fastgpt-private', keys.slice(0, 1000));
    expect(removeObjects).toHaveBeenNthCalledWith(2, 'fastgpt-private', keys.slice(1000));
  });

  it.each([
    ['an error without a key', [{ Code: 'AccessDenied', Message: 'permission denied' }]],
    ['an error for an unexpected key', [{ Key: 'another-prefix/file.txt' }]],
    ['a non-array response', undefined]
  ])('marks the whole batch as failed for %s', async (_case, response) => {
    const adapter = createAdapter();
    const keys = ['dataset/first.txt', 'dataset/second.txt'];
    (adapter as any).minioClient.removeObjects = vi.fn().mockResolvedValue(response);

    await expect(adapter.deleteObjectsByMultiKeys({ keys })).resolves.toEqual({
      bucket: 'fastgpt-private',
      keys
    });
  });
});

describe('MinioStorageAdapter.deleteObjectsByPrefix', () => {
  let adapter: MinioStorageAdapter;
  let listObjects: ReturnType<typeof vi.fn>;
  let removeObjects: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    adapter = createAdapter();
    listObjects = vi.fn();
    removeObjects = vi.fn().mockResolvedValue([]);
    (adapter as any).client.send = listObjects;
    (adapter as any).minioClient.listObjectsV2 = vi.fn(() => {
      throw new Error('Entity expansion limit exceeded: 1002 > 1000');
    });
    (adapter as any).minioClient.removeObjects = removeObjects;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each(['', '   '])('rejects an empty prefix: %j', async (prefix) => {
    await expect(adapter.deleteObjectsByPrefix({ prefix })).rejects.toThrow('Prefix is required');

    expect(listObjects).not.toHaveBeenCalled();
    expect(removeObjects).not.toHaveBeenCalled();
  });

  it('lists 501 encoded objects in bounded pages and deletes each page sequentially', async () => {
    const firstPageKeys = Array.from(
      { length: 400 },
      (_, index) => `dataset/team%20%26%20one/file-${index}.txt`
    );
    const secondPageKeys = Array.from(
      { length: 101 },
      (_, index) => `dataset/team%20%26%20one/file-${index + 400}.txt`
    );
    let resolveFirstDelete: ((value: []) => void) | undefined;
    const firstDelete = new Promise<[]>((resolve) => {
      resolveFirstDelete = resolve;
    });

    listObjects
      .mockResolvedValueOnce({
        Contents: firstPageKeys.map((Key) => ({ Key })),
        IsTruncated: true,
        NextContinuationToken: 'next-page'
      })
      .mockResolvedValueOnce({
        Contents: secondPageKeys.map((Key) => ({ Key })),
        IsTruncated: false
      });
    removeObjects.mockReturnValueOnce(firstDelete).mockResolvedValueOnce([]);

    const resultPromise = adapter.deleteObjectsByPrefix({ prefix: 'dataset/team & one/' });
    await vi.waitFor(() => expect(removeObjects).toHaveBeenCalledTimes(1));

    expect(listObjects).toHaveBeenCalledTimes(1);
    expect(listObjects.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        input: {
          Bucket: 'fastgpt-private',
          Prefix: 'dataset/team & one/',
          ContinuationToken: undefined,
          EncodingType: 'url',
          MaxKeys: 400
        }
      })
    );
    expect(removeObjects).toHaveBeenNthCalledWith(
      1,
      'fastgpt-private',
      firstPageKeys.map((key) => decodeURIComponent(key))
    );

    resolveFirstDelete?.([]);
    await expect(resultPromise).resolves.toEqual({ bucket: 'fastgpt-private', keys: [] });

    expect(listObjects).toHaveBeenCalledTimes(2);
    expect(listObjects.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        input: expect.objectContaining({
          ContinuationToken: 'next-page'
        })
      })
    );
    expect(removeObjects).toHaveBeenNthCalledWith(
      2,
      'fastgpt-private',
      secondPageKeys.map((key) => decodeURIComponent(key))
    );
    expect((adapter as any).minioClient.listObjectsV2).not.toHaveBeenCalled();
  });

  it('collects per-object failures and continues deleting later pages', async () => {
    listObjects
      .mockResolvedValueOnce({
        Contents: [{ Key: 'parsed/first.txt' }, { Key: 'parsed/file+with+spaces.txt' }],
        IsTruncated: true,
        NextContinuationToken: 'next-page'
      })
      .mockResolvedValueOnce({
        Contents: [{ Key: 'parsed/last.txt' }, {}],
        IsTruncated: false
      });
    removeObjects
      .mockResolvedValueOnce([
        { Key: 'parsed/first.txt' },
        { Error: { Key: 'parsed/file with spaces.txt' } }
      ])
      .mockResolvedValueOnce([]);

    await expect(adapter.deleteObjectsByPrefix({ prefix: 'parsed/' })).resolves.toEqual({
      bucket: 'fastgpt-private',
      keys: ['parsed/first.txt', 'parsed/file with spaces.txt']
    });
    expect(removeObjects).toHaveBeenNthCalledWith(2, 'fastgpt-private', ['parsed/last.txt']);
  });

  it('marks the whole page as failed when the delete request rejects', async () => {
    listObjects.mockResolvedValueOnce({
      Contents: [{ Key: 'failed/first.txt' }, { Key: 'failed/second.txt' }],
      IsTruncated: false
    });
    removeObjects.mockRejectedValueOnce(new Error('MinIO request timeout after 60000ms'));

    await expect(adapter.deleteObjectsByPrefix({ prefix: 'failed/' })).resolves.toEqual({
      bucket: 'fastgpt-private',
      keys: ['failed/first.txt', 'failed/second.txt']
    });
  });

  it('marks the whole page as failed when an error item has no key', async () => {
    listObjects.mockResolvedValueOnce({
      Contents: [{ Key: 'failed/first.txt' }, { Key: 'failed/second.txt' }],
      IsTruncated: false
    });
    removeObjects.mockResolvedValueOnce([{ Code: 'AccessDenied', Message: 'permission denied' }]);

    await expect(adapter.deleteObjectsByPrefix({ prefix: 'failed/' })).resolves.toEqual({
      bucket: 'fastgpt-private',
      keys: ['failed/first.txt', 'failed/second.txt']
    });
  });

  it('skips deletion for an empty result page', async () => {
    listObjects.mockResolvedValueOnce({ Contents: [], IsTruncated: false });

    await expect(adapter.deleteObjectsByPrefix({ prefix: 'empty/' })).resolves.toEqual({
      bucket: 'fastgpt-private',
      keys: []
    });
    expect(removeObjects).not.toHaveBeenCalled();
  });

  it('rejects a truncated response without a continuation token', async () => {
    listObjects.mockResolvedValueOnce({ Contents: [], IsTruncated: true });

    await expect(adapter.deleteObjectsByPrefix({ prefix: 'parsed/' })).rejects.toThrow(
      'Invalid MinIO list response: missing continuation token'
    );
    expect(removeObjects).not.toHaveBeenCalled();
  });

  it('aborts and rejects when listing exceeds the request timeout', async () => {
    vi.useFakeTimers();
    listObjects.mockReturnValue(new Promise(() => {}));

    const resultPromise = adapter.deleteObjectsByPrefix({ prefix: 'stuck-list/' });
    const assertion = expect(resultPromise).rejects.toThrow(
      'Delete by prefix list timeout after 60000ms: stuck-list/'
    );

    await vi.advanceTimersByTimeAsync(60000);
    await assertion;

    expect(listObjects.mock.calls[0]?.[1]?.abortSignal.aborted).toBe(true);
    expect(removeObjects).not.toHaveBeenCalled();
  });

  it('keeps the timeout error stable when abort immediately rejects the list request', async () => {
    vi.useFakeTimers();
    listObjects.mockImplementation((_command, { abortSignal }) => {
      return new Promise((_resolve, reject) => {
        abortSignal.addEventListener('abort', () => reject(abortSignal.reason), { once: true });
      });
    });

    const resultPromise = adapter.deleteObjectsByPrefix({ prefix: 'stuck-list/' });
    const assertion = expect(resultPromise).rejects.toThrow(
      'Delete by prefix list timeout after 60000ms: stuck-list/'
    );

    await vi.advanceTimersByTimeAsync(60000);
    await assertion;
    expect(removeObjects).not.toHaveBeenCalled();
  });
});

describe('MinioStorageAdapter.ensureBucket', () => {
  it('returns the inherited result when the bucket exists', async () => {
    const adapter = createAdapter();
    const send = vi.fn().mockResolvedValue(undefined);
    (adapter as any).client.send = send;

    await expect(adapter.ensureBucket()).resolves.toEqual({
      exists: true,
      created: false,
      bucket: 'fastgpt-private'
    });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('creates the bucket when the head request returns NotFound', async () => {
    const adapter = createAdapter();
    const send = vi
      .fn()
      .mockRejectedValueOnce(new MinioS3NotFound({ $metadata: {}, message: 'not found' }))
      .mockResolvedValueOnce(undefined);
    (adapter as any).client.send = send;

    await expect(adapter.ensureBucket()).resolves.toEqual({
      exists: false,
      created: true,
      bucket: 'fastgpt-private'
    });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        input: { Bucket: 'fastgpt-private' }
      })
    );
  });

  it('preserves errors other than NotFound', async () => {
    const adapter = createAdapter();
    const error = new Error('permission denied');
    (adapter as any).client.send = vi.fn().mockRejectedValue(error);

    await expect(adapter.ensureBucket()).rejects.toBe(error);
  });
});

describe('MinioStorageAdapter.ensurePublicBucketPolicy', () => {
  it('applies a public object-read policy', async () => {
    const adapter = createAdapter();
    const send = vi.fn().mockResolvedValue(undefined);
    (adapter as any).client.send = send;

    await adapter.ensurePublicBucketPolicy();

    const command = send.mock.calls[0]?.[0];
    expect(command).toEqual(
      expect.objectContaining({
        input: expect.objectContaining({
          Bucket: 'fastgpt-private'
        })
      })
    );
    expect(JSON.parse(command.input.Policy)).toEqual(
      expect.objectContaining({
        Statement: [
          expect.objectContaining({
            Action: ['s3:GetObject'],
            Resource: ['arn:aws:s3:::fastgpt-private/*']
          })
        ]
      })
    );
  });
});

describe('MinioStorageAdapter.removeBucketLifecycle', () => {
  it('removes the lifecycle with the AWS client', async () => {
    const adapter = createAdapter();
    const send = vi.fn().mockResolvedValue(undefined);
    (adapter as any).client.send = send;

    await adapter.removeBucketLifecycle();

    expect(send.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        input: { Bucket: 'fastgpt-private' }
      })
    );
  });
});
