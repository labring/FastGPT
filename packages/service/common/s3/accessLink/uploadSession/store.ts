import type { S3UploadSessionStore } from '@fastgpt-sdk/storage';
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
  markMultipartCompleting: async ({
    tokenHash,
    completionAttemptId,
    completingAt,
    reclaimBefore
  }) => {
    const statusFilter = reclaimBefore
      ? {
          $or: [
            { 'multipart.status': 'active' },
            {
              'multipart.status': 'completing',
              $or: [
                { 'multipart.completingAt': { $lte: reclaimBefore } },
                { 'multipart.completingAt': { $exists: false } }
              ]
            }
          ]
        }
      : { 'multipart.status': 'active' };
    const result = await MongoS3UploadSession.updateOne(
      { tokenHash, ...statusFilter },
      {
        $set: {
          'multipart.status': 'completing',
          'multipart.completionAttemptId': completionAttemptId,
          'multipart.completingAt': completingAt
        }
      }
    );
    return result.modifiedCount === 1 ? completionAttemptId : null;
  },
  markMultipartCompleted: async ({ tokenHash, completionAttemptId, completedAt }) => {
    const result = await MongoS3UploadSession.updateOne(
      {
        tokenHash,
        'multipart.status': 'completing',
        'multipart.completionAttemptId': completionAttemptId
      },
      {
        $set: {
          'multipart.status': 'completed',
          'multipart.completedAt': completedAt
        }
      }
    );
    return result.modifiedCount === 1;
  },
  markMultipartCompleteFailed: async ({ tokenHash, completionAttemptId, abortedAt }) => {
    const result = await MongoS3UploadSession.updateOne(
      {
        tokenHash,
        'multipart.status': 'completing',
        'multipart.completionAttemptId': completionAttemptId
      },
      {
        $set: {
          'multipart.status': 'aborted',
          'multipart.abortedAt': abortedAt
        }
      }
    );
    return result.modifiedCount === 1;
  },
  markMultipartAborted: async ({ tokenHash, abortedAt }) => {
    const result = await MongoS3UploadSession.updateOne(
      { tokenHash, 'multipart.status': 'active' },
      {
        $set: {
          'multipart.status': 'aborted',
          'multipart.abortedAt': abortedAt
        }
      }
    );
    return result.modifiedCount === 1;
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
