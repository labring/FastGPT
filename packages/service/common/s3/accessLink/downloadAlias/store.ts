import {
  S3AccessLinkErrCode,
  S3AccessLinkError,
  type S3DownloadAliasStore
} from '@fastgpt-sdk/storage/access-link';
import { MongoS3DownloadAlias } from './schema';
import type { S3DownloadAliasType } from '../type';

const isMongoDuplicateKeyError = (error: unknown) =>
  !!error && typeof error === 'object' && 'code' in error && error.code === 11000;

const toAliasRecord = (record: S3DownloadAliasType) => record;

export const mongoS3DownloadAliasStore: S3DownloadAliasStore = {
  findByAliasKey: async (aliasKey) => {
    const record = await MongoS3DownloadAlias.findOne({ aliasKey }).lean();
    return record ? toAliasRecord(record) : null;
  },
  findByAliasId: async (aliasId) => {
    const record = await MongoS3DownloadAlias.findOne({ aliasId }).lean();
    return record ? toAliasRecord(record) : null;
  },
  create: async (data) => {
    try {
      const now = new Date();
      const [created] = await MongoS3DownloadAlias.create([
        {
          ...data,
          createTime: data.createTime ?? now,
          updateTime: data.updateTime ?? now
        }
      ]);

      return toAliasRecord(created.toObject() as S3DownloadAliasType);
    } catch (error) {
      if (isMongoDuplicateKeyError(error)) {
        throw new S3AccessLinkError(S3AccessLinkErrCode.duplicateAliasKey, { cause: error });
      }

      throw error;
    }
  },
  touchLease: async ({ aliasId, purgeAt, lastIssuedAt }) => {
    await MongoS3DownloadAlias.updateOne(
      { aliasId },
      {
        $set: {
          updateTime: lastIssuedAt,
          lastIssuedAt
        },
        $max: {
          purgeAt
        }
      }
    );
  },
  disableByAliasId: async ({ aliasId, disabledAt }) => {
    await MongoS3DownloadAlias.updateOne(
      { aliasId },
      {
        $set: {
          disabledAt,
          updateTime: disabledAt
        }
      }
    );
  },
  deleteByObject: async ({ bucketName, objectKey }) => {
    await MongoS3DownloadAlias.deleteMany({
      bucketName,
      objectKey
    });
  },
  deleteByObjects: async ({ bucketName, objectKeys }) => {
    if (objectKeys.length === 0) return;

    await MongoS3DownloadAlias.deleteMany({
      bucketName,
      objectKey: { $in: objectKeys }
    });
  }
};
