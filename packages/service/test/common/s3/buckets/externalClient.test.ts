import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createStorageMock, createDefaultStorageOptionsMock } = vi.hoisted(() => ({
  createStorageMock: vi.fn(),
  createDefaultStorageOptionsMock: vi.fn()
}));

vi.unmock('@fastgpt/service/common/s3/buckets/base');
vi.unmock('@fastgpt/service/common/s3/buckets/public');
vi.unmock('@fastgpt/service/common/s3/buckets/private');

vi.mock('@fastgpt-sdk/storage', async () => {
  const actual =
    await vi.importActual<typeof import('@fastgpt-sdk/storage')>('@fastgpt-sdk/storage');
  return {
    ...actual,
    createStorage: createStorageMock
  };
});

vi.mock('@fastgpt/service/common/s3/config/constants', async () => {
  const actual = await vi.importActual<
    typeof import('@fastgpt/service/common/s3/config/constants')
  >('@fastgpt/service/common/s3/config/constants');
  return {
    ...actual,
    createDefaultStorageOptions: createDefaultStorageOptionsMock
  };
});

vi.resetModules();
const { S3PublicBucket } = await import('@fastgpt/service/common/s3/buckets/public');
const { S3PrivateBucket } = await import('@fastgpt/service/common/s3/buckets/private');

const makeFakeClient = (bucket: string, endpoint?: string) => ({
  bucketName: bucket,
  endpoint,
  ensureBucket: vi.fn().mockResolvedValue({ exists: true, created: false, bucket })
});

describe('S3PublicBucket and S3PrivateBucket externalClient resolution', () => {
  beforeEach(() => {
    createStorageMock.mockReset();
    createDefaultStorageOptionsMock.mockReset();
    createStorageMock.mockImplementation((options: { bucket: string; endpoint?: string }) =>
      makeFakeClient(options.bucket, options.endpoint)
    );
  });

  it.each([
    {
      vendor: 'oss' as const,
      extra: {
        endpoint: 'https://oss-cn-hangzhou.aliyuncs.com',
        cname: false,
        internal: false,
        secure: true
      }
    },
    {
      vendor: 'cos' as const,
      extra: {
        protocol: 'https:',
        useAccelerate: false
      }
    },
    {
      vendor: 'r2' as const,
      extra: {
        endpoint: 'https://account.r2.cloudflarestorage.com',
        publicEndpoint: 'https://pub.example.r2.dev',
        forcePathStyle: false,
        maxRetries: 3
      }
    }
  ])(
    'reuses primary client for $vendor even when storage.externalEndpoint is set in instance config',
    ({ vendor, extra }) => {
      createDefaultStorageOptionsMock.mockReturnValue({
        vendor,
        region: 'auto',
        credentials: { accessKeyId: 'ak', secretAccessKey: 'sk' },
        publicBucket: 'pub-bucket',
        privateBucket: 'priv-bucket',
        externalEndpoint: 'http://100.96.142.32:9000',
        ...extra
      });

      const pub = new S3PublicBucket();
      const priv = new S3PrivateBucket();

      expect(createStorageMock).toHaveBeenCalledTimes(2);
      expect(pub.externalClient).toBe(pub.client);
      expect(priv.externalClient).toBe(priv.client);
    }
  );

  it.each(['minio', 'aws-s3'] as const)(
    'creates externalClient for %s when externalEndpoint is configured',
    (vendor) => {
      createDefaultStorageOptionsMock.mockReturnValue({
        vendor,
        region: 'us-east-1',
        endpoint: 'http://internal-s3:9000',
        credentials: { accessKeyId: 'ak', secretAccessKey: 'sk' },
        publicBucket: 'pub-bucket',
        privateBucket: 'priv-bucket',
        externalEndpoint: 'https://public-s3.example.com',
        forcePathStyle: true,
        maxRetries: 3
      });

      const pub = new S3PublicBucket();
      const priv = new S3PrivateBucket();

      expect(createStorageMock).toHaveBeenCalledTimes(4);
      expect(pub.externalClient).not.toBe(pub.client);
      expect(priv.externalClient).not.toBe(priv.client);
      expect(createStorageMock).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          vendor,
          bucket: 'pub-bucket',
          endpoint: 'https://public-s3.example.com'
        })
      );
      expect(createStorageMock).toHaveBeenNthCalledWith(
        4,
        expect.objectContaining({
          vendor,
          bucket: 'priv-bucket',
          endpoint: 'https://public-s3.example.com'
        })
      );
    }
  );
});
