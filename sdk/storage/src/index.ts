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
export {
  NoSuchBucketError,
  NoBucketReadPermissionError,
  EmptyObjectError,
  InvalidStorageObjectKeyError
} from './errors';
export type { InvalidStorageObjectKeyReason } from './errors';
export {
  MAX_STORAGE_OBJECT_KEY_UTF8_BYTES,
  assertStorageObjectKey,
  assertStorageObjectKeys,
  assertStorageObjectPrefix
} from './objectKey';
export { AwsS3StorageAdapter } from './adapters/aws-s3.adapter';
export { CosStorageAdapter } from './adapters/cos.adapter';
export { MinioStorageAdapter } from './adapters/minio.adapter';
export { OssStorageAdapter } from './adapters/oss.adapter';
export {
  S3_ACCESS_LINK_PURGE_GRACE_HOURS,
  S3_DOWNLOAD_ALIAS_ID_LENGTH,
  S3_DOWNLOAD_ALIAS_SIGN_VERSION,
  S3_DOWNLOAD_URL_BATCH_MAX_SIZE,
  S3_DOWNLOAD_EXPIRE_BUCKET_MS,
  S3_DOWNLOAD_EXPIRE_BUCKET_THRESHOLD_MS,
  S3_DOWNLOAD_SIGNATURE_LENGTH,
  S3_UPLOAD_TOKEN_LENGTH,
  createS3AccessLinkCrypto,
  createDefaultIdGenerator,
  constantTimeEqual,
  decodeExpiresAtMinute,
  encodeExpiresAtMinute,
  parseSignedS3DownloadAlias,
  resolveDownloadExpiresAt,
  S3AccessLinkErrCode,
  S3AccessLinkError,
  isS3AccessLinkError,
  createS3AccessLinkService,
  createMemoryS3AccessLinkStores
} from './access-link';
export type {
  S3AccessLinkCrypto,
  S3AccessLinkErrorCode,
  MemoryS3AccessLinkStores,
  S3DownloadAliasStore,
  S3UploadSessionStore,
  CreateS3AccessLinkServiceOptions,
  CreateS3DownloadAccessUrlParams,
  CreateS3DownloadAliasRecord,
  CreateS3UploadAccessUrlParams,
  CreateS3UploadSessionRecord,
  DeleteS3DownloadAliasByObjectParams,
  DeleteS3DownloadAliasByObjectsParams,
  ParsedS3SignedDownloadAlias,
  S3AccessLinkClock,
  S3AccessLinkIdGenerator,
  S3AccessLinkRoutes,
  S3AccessLinkService,
  S3AccessLinkStores,
  S3DownloadAliasRecord,
  S3ProxyDownloadPayload,
  S3ProxyUploadPayload,
  S3VerifiedDownloadPayload,
  S3UploadConstraints,
  S3UploadSessionRecord,
  UploadSessionUsePolicy
} from './access-link';
