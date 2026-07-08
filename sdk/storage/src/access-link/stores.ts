import type {
  CreateS3DownloadAliasRecord,
  CreateS3UploadSessionRecord,
  S3DownloadAliasRecord,
  S3UploadSessionRecord
} from './types';

export type S3DownloadAliasStore = {
  findByAliasKey: (aliasKey: string) => Promise<S3DownloadAliasRecord | null>;
  findByAliasId: (aliasId: string) => Promise<S3DownloadAliasRecord | null>;
  create: (record: CreateS3DownloadAliasRecord) => Promise<S3DownloadAliasRecord>;
  touchLease: (params: { aliasId: string; purgeAt: Date; lastIssuedAt: Date }) => Promise<void>;
  disableByAliasId: (params: { aliasId: string; disabledAt: Date }) => Promise<void>;
  deleteByObject: (params: { bucketName: string; objectKey: string }) => Promise<void>;
  deleteByObjects: (params: { bucketName: string; objectKeys: string[] }) => Promise<void>;
};

export type S3UploadSessionStore = {
  create: (record: CreateS3UploadSessionRecord) => Promise<S3UploadSessionRecord>;
  findByTokenHash: (tokenHash: string) => Promise<S3UploadSessionRecord | null>;
  markUsed: (params: { tokenHash: string; usedAt: Date }) => Promise<void>;
  revoke: (params: { tokenHash: string; revokedAt: Date }) => Promise<void>;
};
