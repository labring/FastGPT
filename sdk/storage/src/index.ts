export { createStorage } from './factory';
export { createVitestStorageMock } from './testing/vitestMock';
export type { VitestStorageMock, CreateVitestStorageMockParams } from './testing/vitestMock';
export type {
  IStorage,
  IStorageOptions,
  IAwsS3CompatibleStorageOptions,
  IOssStorageOptions,
  ICosStorageOptions,
  ICommonStorageOptions
} from './interface';
export type {
  StorageBucketName,
  StorageObjectKey,
  StorageObjectMetadata,
  StorageUploadBody,
  EnsureBucketResult,
  ExistsObjectParams,
  ExistsObjectResult,
  UploadObjectParams,
  UploadObjectResult,
  DownloadObjectParams,
  DownloadObjectResult,
  DeleteObjectParams,
  DeleteObjectResult,
  DeleteObjectsParams,
  DeleteObjectsResult,
  DeleteObjectsByPrefixParams,
  PresignedPutUrlParams,
  PresignedPutUrlResult,
  PresignedGetUrlParams,
  PresignedGetUrlResult,
  ListObjectsParams,
  ListObjectsResult,
  GetObjectMetadataParams,
  GetObjectMetadataResult
} from './types';
export { NoSuchBucketError, NoBucketReadPermissionError, EmptyObjectError } from './errors';
export { AwsS3StorageAdapter } from './adapters/aws-s3.adapter';
export { CosStorageAdapter } from './adapters/cos.adapter';
export { MinioStorageAdapter } from './adapters/minio.adapter';
export { OssStorageAdapter } from './adapters/oss.adapter';
