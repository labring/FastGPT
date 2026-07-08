import { S3AccessLinkErrCode, S3AccessLinkError } from './errors';
import type { S3DownloadAliasStore, S3UploadSessionStore } from './stores';
import type {
  CreateS3DownloadAliasRecord,
  CreateS3UploadSessionRecord,
  S3DownloadAliasRecord,
  S3UploadSessionRecord
} from './types';

const cloneDate = (date: Date) => new Date(date.getTime());

const cloneDownloadAlias = (record: S3DownloadAliasRecord): S3DownloadAliasRecord => ({
  ...record,
  createTime: cloneDate(record.createTime),
  updateTime: cloneDate(record.updateTime),
  lastIssuedAt: cloneDate(record.lastIssuedAt),
  purgeAt: cloneDate(record.purgeAt),
  ...(record.disabledAt ? { disabledAt: cloneDate(record.disabledAt) } : {})
});

const cloneUploadSession = (record: S3UploadSessionRecord): S3UploadSessionRecord => ({
  ...record,
  createTime: cloneDate(record.createTime),
  expiresAt: cloneDate(record.expiresAt),
  ...(record.usedAt ? { usedAt: cloneDate(record.usedAt) } : {}),
  ...(record.revokedAt ? { revokedAt: cloneDate(record.revokedAt) } : {})
});

export type MemoryS3AccessLinkStores = {
  downloadAliases: Map<string, S3DownloadAliasRecord>;
  uploadSessions: Map<string, S3UploadSessionRecord>;
  downloadAliasStore: S3DownloadAliasStore;
  uploadSessionStore: S3UploadSessionStore;
  reset: () => void;
};

export const createMemoryS3AccessLinkStores = (): MemoryS3AccessLinkStores => {
  const downloadAliases = new Map<string, S3DownloadAliasRecord>();
  const uploadSessions = new Map<string, S3UploadSessionRecord>();

  const downloadAliasStore: S3DownloadAliasStore = {
    findByAliasKey: async (aliasKey) => {
      const record = Array.from(downloadAliases.values()).find(
        (item) => item.aliasKey === aliasKey
      );
      return record ? cloneDownloadAlias(record) : null;
    },
    findByAliasId: async (aliasId) => {
      const record = downloadAliases.get(aliasId);
      return record ? cloneDownloadAlias(record) : null;
    },
    create: async (record: CreateS3DownloadAliasRecord) => {
      const hasAliasKey = Array.from(downloadAliases.values()).some(
        (item) => item.aliasKey === record.aliasKey
      );

      if (hasAliasKey) {
        throw new S3AccessLinkError(S3AccessLinkErrCode.duplicateAliasKey);
      }

      const now = new Date();
      const nextRecord: S3DownloadAliasRecord = {
        ...record,
        createTime: record.createTime ?? now,
        updateTime: record.updateTime ?? now
      };
      downloadAliases.set(nextRecord.aliasId, cloneDownloadAlias(nextRecord));
      return cloneDownloadAlias(nextRecord);
    },
    touchLease: async ({ aliasId, purgeAt, lastIssuedAt }) => {
      const record = downloadAliases.get(aliasId);
      if (!record) return;
      downloadAliases.set(aliasId, {
        ...record,
        purgeAt: record.purgeAt.getTime() > purgeAt.getTime() ? record.purgeAt : purgeAt,
        lastIssuedAt,
        updateTime: lastIssuedAt
      });
    },
    disableByAliasId: async ({ aliasId, disabledAt }) => {
      const record = downloadAliases.get(aliasId);
      if (!record) return;
      downloadAliases.set(aliasId, {
        ...record,
        disabledAt,
        updateTime: disabledAt
      });
    },
    deleteByObject: async ({ bucketName, objectKey }) => {
      for (const [aliasId, record] of downloadAliases.entries()) {
        if (record.bucketName === bucketName && record.objectKey === objectKey) {
          downloadAliases.delete(aliasId);
        }
      }
    },
    deleteByObjects: async ({ bucketName, objectKeys }) => {
      const objectKeySet = new Set(objectKeys);
      for (const [aliasId, record] of downloadAliases.entries()) {
        if (record.bucketName === bucketName && objectKeySet.has(record.objectKey)) {
          downloadAliases.delete(aliasId);
        }
      }
    }
  };

  const uploadSessionStore: S3UploadSessionStore = {
    create: async (record: CreateS3UploadSessionRecord) => {
      const now = new Date();
      const nextRecord: S3UploadSessionRecord = {
        ...record,
        createTime: record.createTime ?? now
      };
      uploadSessions.set(nextRecord.tokenHash, cloneUploadSession(nextRecord));
      return cloneUploadSession(nextRecord);
    },
    findByTokenHash: async (tokenHash) => {
      const record = uploadSessions.get(tokenHash);
      return record ? cloneUploadSession(record) : null;
    },
    markUsed: async ({ tokenHash, usedAt }) => {
      const record = uploadSessions.get(tokenHash);
      if (!record) return;
      uploadSessions.set(tokenHash, {
        ...record,
        usedAt
      });
    },
    revoke: async ({ tokenHash, revokedAt }) => {
      const record = uploadSessions.get(tokenHash);
      if (!record) return;
      uploadSessions.set(tokenHash, {
        ...record,
        revokedAt
      });
    }
  };

  return {
    downloadAliases,
    uploadSessions,
    downloadAliasStore,
    uploadSessionStore,
    reset: () => {
      downloadAliases.clear();
      uploadSessions.clear();
    }
  };
};
