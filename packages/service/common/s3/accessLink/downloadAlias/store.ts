import {
  S3AccessLinkErrCode,
  S3AccessLinkError,
  type S3DownloadAliasStore
} from '@fastgpt-sdk/storage';
import { MongoS3DownloadAlias } from './schema';
import type { S3DownloadAliasType } from '../type';

const isMongoDuplicateKeyError = (error: unknown) =>
  !!error && typeof error === 'object' && 'code' in error && error.code === 11000;

const toAliasRecord = (record: S3DownloadAliasType) => record;

export const mongoS3DownloadAliasStore: S3DownloadAliasStore = {
  findByAliasKeys: async (aliasKeys) => {
    if (aliasKeys.length === 0) return [];

    const records = await MongoS3DownloadAlias.find({ aliasKey: { $in: aliasKeys } }).lean();
    return records.map(toAliasRecord);
  },
  findByAliasId: async (aliasId) => {
    const record = await MongoS3DownloadAlias.findOne({ aliasId }).lean();
    return record ? toAliasRecord(record) : null;
  },
  createMany: async (records) => {
    if (records.length === 0) return [];

    try {
      const now = new Date();
      const created = await MongoS3DownloadAlias.insertMany(
        records.map((record) => ({
          ...record,
          createTime: record.createTime ?? now,
          updateTime: record.updateTime ?? now
        })),
        { ordered: false }
      );

      return created.map((item) => toAliasRecord(item.toObject() as S3DownloadAliasType));
    } catch (error) {
      if (isMongoDuplicateKeyError(error)) {
        throw new S3AccessLinkError(S3AccessLinkErrCode.duplicateAliasKey, { cause: error });
      }

      throw error;
    }
  },
  touchLeases: async (params) => {
    if (params.length === 0) return;

    await MongoS3DownloadAlias.bulkWrite(
      params.map(({ aliasId, purgeAt, lastIssuedAt }) => ({
        updateOne: {
          filter: { aliasId },
          update: {
            $set: {
              updateTime: lastIssuedAt,
              lastIssuedAt
            },
            $max: {
              purgeAt
            }
          }
        }
      })),
      { ordered: false }
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
