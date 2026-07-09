import type { S3DownloadAliasStore, S3UploadSessionStore } from './stores';

export type S3AccessLinkClock = () => Date;

export type S3AccessLinkIdGenerator = {
  aliasId: () => string;
  uploadToken: () => string;
};

export type S3AccessLinkRoutes = {
  buildDownloadUrl: (signedAlias: string) => string;
  buildUploadUrl: (token: string) => string;
};

export type S3AccessLinkStores = {
  downloadAlias: S3DownloadAliasStore;
  uploadSession: S3UploadSessionStore;
};

export type S3UploadConstraints = {
  defaultContentType: string;
  allowedExtensions?: string[];
};

export type S3DownloadAliasRecord = {
  aliasId: string;
  aliasKey: string;
  bucketName: string;
  objectKey: string;
  filename?: string;
  responseContentType?: string;
  createTime: Date;
  updateTime: Date;
  lastIssuedAt: Date;
  purgeAt: Date;
  disabledAt?: Date;
};

export type CreateS3DownloadAliasRecord = Omit<
  S3DownloadAliasRecord,
  'createTime' | 'updateTime'
> & {
  createTime?: Date;
  updateTime?: Date;
};

export type CreateS3DownloadAccessUrlParams = {
  bucketName: string;
  objectKey: string;
  expiredTime: Date;
  filename?: string;
  responseContentType?: string;
};

export type ParsedS3SignedDownloadAlias = {
  aliasId: string;
  expMinute36: string;
  sig: string;
};

export type S3ProxyDownloadPayload = {
  bucketName: string;
  objectKey: string;
  filename?: string;
  responseContentType?: string;
};

export type S3VerifiedDownloadPayload = S3ProxyDownloadPayload & {
  expiresAt: Date;
};

export type DeleteS3DownloadAliasByObjectParams = {
  bucketName: string;
  objectKey: string;
};

export type DeleteS3DownloadAliasByObjectsParams = {
  bucketName: string;
  objectKeys: string[];
};

export type S3UploadSessionRecord = {
  tokenHash: string;
  bucketName: string;
  objectKey: string;
  maxSize: number;
  uploadConstraints: S3UploadConstraints;
  metadata?: Record<string, string>;
  createTime: Date;
  expiresAt: Date;
  usedAt?: Date;
  revokedAt?: Date;
};

export type CreateS3UploadSessionRecord = Omit<S3UploadSessionRecord, 'createTime'> & {
  createTime?: Date;
};

export type CreateS3UploadAccessUrlParams = {
  bucketName: string;
  objectKey: string;
  expiredTime: Date;
  maxSize: number;
  uploadConstraints: S3UploadConstraints;
  metadata?: Record<string, string>;
};

export type S3ProxyUploadPayload = {
  bucketName: string;
  objectKey: string;
  maxSize: number;
  uploadConstraints: S3UploadConstraints;
  metadata?: Record<string, string>;
};

export type UploadSessionUsePolicy = 'allow-retry' | 'mark-used' | 'reject-used';

export type CreateS3AccessLinkServiceOptions = {
  secret: string;
  routes: S3AccessLinkRoutes;
  stores: S3AccessLinkStores;
  clock?: S3AccessLinkClock;
  idGenerator?: Partial<S3AccessLinkIdGenerator>;
  uploadSessionUsePolicy?: UploadSessionUsePolicy;
};

export type S3AccessLinkService = {
  createDownloadUrl: (params: CreateS3DownloadAccessUrlParams) => Promise<string>;
  verifyDownloadAlias: (signedAlias: string) => Promise<S3VerifiedDownloadPayload>;
  revokeDownloadAlias: (aliasId: string) => Promise<void>;
  deleteDownloadAliasByObject: (params: DeleteS3DownloadAliasByObjectParams) => Promise<void>;
  deleteDownloadAliasByObjects: (params: DeleteS3DownloadAliasByObjectsParams) => Promise<void>;
  createUploadUrl: (params: CreateS3UploadAccessUrlParams) => Promise<string>;
  verifyUploadToken: (token: string) => Promise<S3ProxyUploadPayload>;
  revokeUploadToken: (token: string) => Promise<void>;
};

export type ResolvedS3AccessLinkServiceOptions = Omit<
  CreateS3AccessLinkServiceOptions,
  'clock' | 'idGenerator' | 'uploadSessionUsePolicy'
> & {
  clock: S3AccessLinkClock;
  idGenerator: S3AccessLinkIdGenerator;
  uploadSessionUsePolicy: UploadSessionUsePolicy;
};
