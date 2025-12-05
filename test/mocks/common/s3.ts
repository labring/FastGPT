import { vi } from 'vitest';

vi.mock('@fastgpt/service/common/s3/buckets/base', async (importOriginal) => {
  const actual = (await importOriginal()) as any;

  class MockS3BaseBucket {
    private _bucket: string;
    public options: any;

    constructor(bucket: string, options?: any) {
      this._bucket = bucket;
      this.options = options || {};
      // Prevent async init() from running in tests
    }

    get name(): string {
      return this._bucket;
    }

    get client(): any {
      return {
        bucketExists: vi.fn().mockResolvedValue(true),
        makeBucket: vi.fn().mockResolvedValue(undefined),
        setBucketPolicy: vi.fn().mockResolvedValue(undefined),
        copyObject: vi.fn().mockResolvedValue(undefined),
        removeObject: vi.fn().mockResolvedValue(undefined),
        presignedPostPolicy: vi.fn().mockResolvedValue({
          postURL: 'http://localhost:9000/mock-bucket',
          formData: { key: 'mock-key' }
        }),
        newPostPolicy: vi.fn(() => ({
          setKey: vi.fn(),
          setBucket: vi.fn(),
          setContentType: vi.fn(),
          setContentLengthRange: vi.fn(),
          setExpires: vi.fn(),
          setUserMetaData: vi.fn()
        }))
      };
    }

    get externalClient(): any {
      return {
        bucketExists: vi.fn().mockResolvedValue(true),
        makeBucket: vi.fn().mockResolvedValue(undefined),
        setBucketPolicy: vi.fn().mockResolvedValue(undefined),
        copyObject: vi.fn().mockResolvedValue(undefined),
        removeObject: vi.fn().mockResolvedValue(undefined),
        presignedPostPolicy: vi.fn().mockResolvedValue({
          postURL: 'http://localhost:9000/mock-bucket',
          formData: { key: 'mock-key' }
        }),
        newPostPolicy: vi.fn(() => ({
          setKey: vi.fn(),
          setBucket: vi.fn(),
          setContentType: vi.fn(),
          setContentLengthRange: vi.fn(),
          setExpires: vi.fn(),
          setUserMetaData: vi.fn()
        }))
      };
    }

    move(src: string, dst: string, options?: any): Promise<void> {
      return Promise.resolve();
    }

    copy(src: string, dst: string, options?: any): any {
      return Promise.resolve();
    }

    exist(): Promise<boolean> {
      return Promise.resolve(true);
    }

    delete(objectKey: string, options?: any): Promise<void> {
      return Promise.resolve();
    }

    addDeleteJob(params: any): Promise<void> {
      return Promise.resolve();
    }

    async createPostPresignedUrl(params: any, options?: any): Promise<any> {
      const key = `mock/${params.teamId || 'test'}/${params.filename}`;
      return {
        url: 'http://localhost:9000/mock-bucket',
        fields: { key },
        maxSize: (options?.maxFileSize || 100) * 1024 * 1024
      };
    }

    async createExternalUrl(params: any): Promise<string> {
      return `http://localhost:9000/mock-bucket/${params.key}`;
    }
  }

  return {
    ...actual,
    S3BaseBucket: MockS3BaseBucket
  };
});

vi.mock('@fastgpt/service/common/s3/buckets/public', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  const { S3BaseBucket } = await import('@fastgpt/service/common/s3/buckets/base');

  class MockS3PublicBucket extends S3BaseBucket {
    createPublicUrl(objectKey: string): string {
      return `http://localhost:9000/mock-public-bucket/${objectKey}`;
    }
  }

  return {
    ...actual,
    S3PublicBucket: MockS3PublicBucket
  };
});

vi.mock('@fastgpt/service/common/s3/buckets/private', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  const { S3BaseBucket } = await import('@fastgpt/service/common/s3/buckets/base');

  return {
    ...actual,
    S3PrivateBucket: S3BaseBucket
  };
});

// Mock S3 initialization to prevent real connections
vi.mock('@fastgpt/service/common/s3', async (importOriginal) => {
  const actual = (await importOriginal()) as any;

  return {
    ...actual,
    initS3Buckets: vi.fn(() => {
      // Mock global s3BucketMap
      global.s3BucketMap = {} as any;
    }),
    initS3MQWorker: vi.fn().mockResolvedValue(undefined)
  };
});
