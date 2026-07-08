import type { S3UploadSessionStore } from '@fastgpt-sdk/storage/access-link';
import type { S3UploadSessionType } from '../type';
import { MongoS3UploadSession } from './schema';

const toUploadSessionRecord = (record: S3UploadSessionType) => record;

export const mongoS3UploadSessionStore: S3UploadSessionStore = {
  create: async (data) => {
    const [created] = await MongoS3UploadSession.create([
      {
        ...data,
        createTime: data.createTime ?? new Date()
      }
    ]);

    return toUploadSessionRecord(created.toObject() as S3UploadSessionType);
  },
  findByTokenHash: async (tokenHash) => {
    const record = await MongoS3UploadSession.findOne({ tokenHash }).lean();
    return record ? toUploadSessionRecord(record) : null;
  },
  markUsed: async ({ tokenHash, usedAt }) => {
    await MongoS3UploadSession.updateOne(
      { tokenHash },
      {
        $set: {
          usedAt
        }
      }
    );
  },
  revoke: async ({ tokenHash, revokedAt }) => {
    await MongoS3UploadSession.updateOne(
      { tokenHash },
      {
        $set: {
          revokedAt
        }
      }
    );
  }
};
