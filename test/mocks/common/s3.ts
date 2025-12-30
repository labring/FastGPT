import { vi } from 'vitest';

// Create mock S3 bucket object for global use
const createMockS3Bucket = () => ({
  name: 'mock-bucket',
  client: {},
  externalClient: {},
  exist: vi.fn().mockResolvedValue(true),
  delete: vi.fn().mockResolvedValue(undefined),
  putObject: vi.fn().mockResolvedValue(undefined),
  getFileStream: vi.fn().mockResolvedValue(null),
  statObject: vi.fn().mockResolvedValue({ size: 0, etag: 'mock-etag' }),
  move: vi.fn().mockResolvedValue(undefined),
  copy: vi.fn().mockResolvedValue(undefined),
  addDeleteJob: vi.fn().mockResolvedValue(undefined),
  createPostPresignedUrl: vi.fn().mockResolvedValue({
    url: 'http://localhost:9000/mock-bucket',
    fields: { key: 'mock-key' },
    maxSize: 100 * 1024 * 1024
  }),
  createExternalUrl: vi.fn().mockResolvedValue('http://localhost:9000/mock-bucket/mock-key'),
  createGetPresignedUrl: vi.fn().mockResolvedValue('http://localhost:9000/mock-bucket/mock-key'),
  createPublicUrl: vi.fn((key: string) => `http://localhost:9000/mock-bucket/${key}`)
});

// Initialize global s3BucketMap early to prevent any real S3 connections
const mockBucket = createMockS3Bucket();
global.s3BucketMap = {
  'fastgpt-public': mockBucket,
  'fastgpt-private': mockBucket
} as any;

// Mock minio Client to prevent real connections
const createMockMinioClient = vi.hoisted(() => {
  return vi.fn().mockImplementation(() => ({
    bucketExists: vi.fn().mockResolvedValue(true),
    makeBucket: vi.fn().mockResolvedValue(undefined),
    setBucketPolicy: vi.fn().mockResolvedValue(undefined),
    copyObject: vi.fn().mockResolvedValue(undefined),
    removeObject: vi.fn().mockResolvedValue(undefined),
    putObject: vi.fn().mockResolvedValue({ etag: 'mock-etag' }),
    getFileStream: vi.fn().mockResolvedValue(null),
    statObject: vi.fn().mockResolvedValue({ size: 0, etag: 'mock-etag' }),
    presignedGetObject: vi.fn().mockResolvedValue('http://localhost:9000/mock-bucket/mock-object'),
    presignedPostPolicy: vi.fn().mockResolvedValue({
      postURL: 'http://localhost:9000/mock-bucket',
      formData: { key: 'mock-key' }
    }),
    newPostPolicy: vi.fn(() => ({
      setKey: vi.fn().mockReturnThis(),
      setBucket: vi.fn().mockReturnThis(),
      setContentType: vi.fn().mockReturnThis(),
      setContentLengthRange: vi.fn().mockReturnThis(),
      setExpires: vi.fn().mockReturnThis(),
      setUserMetaData: vi.fn().mockReturnThis()
    }))
  }));
});

vi.mock('minio', () => ({
  Client: createMockMinioClient(),
  S3Error: class S3Error extends Error {},
  CopyConditions: vi.fn()
}));

// Simplified S3 bucket class mock
const createMockBucketClass = (defaultName: string) => {
  return class MockS3Bucket {
    public name: string;
    public options: any;
    public client = {};
    public externalClient = {};

    constructor(bucket?: string, options?: any) {
      this.name = bucket || defaultName;
      this.options = options || {};
    }

    async exist() {
      return true;
    }
    async delete() {}
    async putObject() {}
    async getFileStream() {
      return null;
    }
    async statObject() {
      return { size: 0, etag: 'mock-etag' };
    }
    async move() {}
    async copy() {}
    async addDeleteJob() {}
    async createPostPresignedUrl(params: any, options?: any) {
      return {
        url: 'http://localhost:9000/mock-bucket',
        fields: { key: `mock/${params.teamId || 'test'}/${params.filename}` },
        maxSize: (options?.maxFileSize || 100) * 1024 * 1024
      };
    }
    async createExternalUrl(params: any) {
      return `http://localhost:9000/mock-bucket/${params.key}`;
    }
    async createGetPresignedUrl(params: any) {
      return `http://localhost:9000/mock-bucket/${params.key}`;
    }
    createPublicUrl(objectKey: string) {
      return `http://localhost:9000/mock-bucket/${objectKey}`;
    }
  };
};

vi.mock('@fastgpt/service/common/s3/buckets/base', () => ({
  S3BaseBucket: createMockBucketClass('fastgpt-bucket')
}));

vi.mock('@fastgpt/service/common/s3/buckets/public', () => ({
  S3PublicBucket: createMockBucketClass('fastgpt-public')
}));

vi.mock('@fastgpt/service/common/s3/buckets/private', () => ({
  S3PrivateBucket: createMockBucketClass('fastgpt-private')
}));

// Mock S3 source modules
vi.mock('@fastgpt/service/common/s3/sources/avatar', () => ({
  getS3AvatarSource: vi.fn(() => ({
    prefix: '/avatar/',
    createUploadAvatarURL: vi.fn().mockResolvedValue({
      url: 'http://localhost:9000/mock-bucket',
      fields: { key: 'mock-key' },
      maxSize: 5 * 1024 * 1024
    }),
    createPublicUrl: vi.fn((key: string) => `http://localhost:9000/mock-bucket/${key}`),
    removeAvatarTTL: vi.fn().mockResolvedValue(undefined),
    deleteAvatar: vi.fn().mockResolvedValue(undefined),
    refreshAvatar: vi.fn().mockResolvedValue(undefined),
    copyAvatar: vi.fn().mockResolvedValue('http://localhost:9000/mock-bucket/mock-avatar')
  }))
}));

vi.mock('@fastgpt/service/common/s3/sources/dataset/index', () => ({
  getS3DatasetSource: vi.fn(() => ({
    createUploadDatasetFileURL: vi.fn().mockResolvedValue({
      url: 'http://localhost:9000/mock-bucket',
      fields: { key: 'mock-key' },
      maxSize: 500 * 1024 * 1024
    }),
    deleteDatasetFile: vi.fn().mockResolvedValue(undefined)
  })),
  S3DatasetSource: vi.fn()
}));

vi.mock('@fastgpt/service/common/s3/sources/chat/index', () => ({
  S3ChatSource: vi.fn(),
  getS3ChatSource: vi.fn(() => ({
    createUploadChatFileURL: vi.fn().mockResolvedValue({
      url: 'http://localhost:9000/mock-bucket',
      fields: { key: 'mock-key' },
      maxSize: 5 * 1024 * 1024
    }),
    deleteChatFilesByPrefix: vi.fn().mockResolvedValue(undefined),
    deleteChatFile: vi.fn().mockResolvedValue(undefined)
  }))
}));

// Mock S3 initialization
vi.mock('@fastgpt/service/common/s3', () => ({
  initS3Buckets: vi.fn(() => {
    const mockBucket = createMockS3Bucket();
    global.s3BucketMap = {
      'fastgpt-public': mockBucket,
      'fastgpt-private': mockBucket
    } as any;
  }),
  initS3MQWorker: vi.fn().mockResolvedValue(undefined)
}));

// Mock S3 MQ (Message Queue) operations
vi.mock('@fastgpt/service/common/s3/mq', () => ({
  prefixDel: vi.fn().mockResolvedValue(undefined),
  addDeleteJob: vi.fn().mockResolvedValue(undefined)
}));
