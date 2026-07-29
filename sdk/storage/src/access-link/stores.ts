import type {
  CreateS3DownloadAliasRecord,
  CreateS3UploadSessionRecord,
  S3DownloadAliasRecord,
  S3UploadSessionRecord
} from './types';

export type S3DownloadAliasStore = {
  findByAliasKeys: (aliasKeys: string[]) => Promise<S3DownloadAliasRecord[]>;
  findByAliasId: (aliasId: string) => Promise<S3DownloadAliasRecord | null>;
  createMany: (records: CreateS3DownloadAliasRecord[]) => Promise<S3DownloadAliasRecord[]>;
  touchLeases: (params: { aliasId: string; purgeAt: Date; lastIssuedAt: Date }[]) => Promise<void>;
  disableByAliasId: (params: { aliasId: string; disabledAt: Date }) => Promise<void>;
  deleteByObject: (params: { bucketName: string; objectKey: string }) => Promise<void>;
  deleteByObjects: (params: { bucketName: string; objectKeys: string[] }) => Promise<void>;
};

export type S3UploadSessionStore = {
  create: (record: CreateS3UploadSessionRecord) => Promise<S3UploadSessionRecord>;
  findByTokenHash: (tokenHash: string) => Promise<S3UploadSessionRecord | null>;
  markUsed: (params: { tokenHash: string; usedAt: Date }) => Promise<void>;
  markMultipartCompleting: (params: {
    tokenHash: string;
    completingAt: Date;
    reclaimBefore?: Date;
  }) => Promise<boolean>;
  markMultipartCompleted: (params: { tokenHash: string; completedAt: Date }) => Promise<boolean>;
  markMultipartCompleteFailed: (params: { tokenHash: string; abortedAt: Date }) => Promise<boolean>;
  markMultipartAborted: (params: { tokenHash: string; abortedAt: Date }) => Promise<boolean>;
  revoke: (params: { tokenHash: string; revokedAt: Date }) => Promise<void>;
};
