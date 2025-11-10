import { vi } from 'vitest';
import './request';

vi.mock('@fastgpt/service/support/audit/util', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    addAuditLog: vi.fn()
  };
});

// Mock Redis connections to prevent connection errors in tests
vi.mock('@fastgpt/service/common/redis', async (importOriginal) => {
  const actual = (await importOriginal()) as any;

  // Create a mock Redis client
  const mockRedisClient = {
    on: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    keys: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    exists: vi.fn().mockResolvedValue(0),
    expire: vi.fn().mockResolvedValue(1),
    ttl: vi.fn().mockResolvedValue(-1)
  };

  return {
    ...actual,
    newQueueRedisConnection: vi.fn(() => mockRedisClient),
    newWorkerRedisConnection: vi.fn(() => mockRedisClient),
    getGlobalRedisConnection: vi.fn(() => mockRedisClient)
  };
});

// Mock BullMQ to prevent queue connection errors
vi.mock('@fastgpt/service/common/bullmq', async (importOriginal) => {
  const actual = (await importOriginal()) as any;

  const mockQueue = {
    add: vi.fn().mockResolvedValue({ id: '1' }),
    close: vi.fn().mockResolvedValue(undefined),
    on: vi.fn()
  };

  const mockWorker = {
    close: vi.fn().mockResolvedValue(undefined),
    on: vi.fn()
  };

  return {
    ...actual,
    getQueue: vi.fn(() => mockQueue),
    getWorker: vi.fn(() => mockWorker)
  };
});

vi.mock('@fastgpt/service/common/s3/buckets/base', async (importOriginal) => {
  const actual = (await importOriginal()) as any;

  class MockS3BaseBucket {
    private _bucket: string;
    public options: any;

    constructor(bucket: string, afterInits?: any, options?: any) {
      this._bucket = bucket;
      this.options = options || {};
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

    async createPostPresignedUrl(params: any, options?: any): Promise<any> {
      const key = `mock/${params.teamId}/${params.filename}`;
      return {
        url: 'http://localhost:9000/mock-bucket',
        fields: { key }
      };
    }
  }

  return {
    ...actual,
    S3BaseBucket: MockS3BaseBucket
  };
});
