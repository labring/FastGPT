import { MongoS3UploadSession } from './schema';
import type { S3UploadSessionType } from '../type';

type CreateS3UploadSessionData = Omit<S3UploadSessionType, 'createTime'> & {
  createTime?: Date;
};

export const createS3UploadSession = async (data: CreateS3UploadSessionData) => {
  const [created] = await MongoS3UploadSession.create([
    {
      ...data,
      createTime: data.createTime ?? new Date()
    }
  ]);

  return created.toObject() as S3UploadSessionType;
};

export const findS3UploadSessionByTokenHash = (tokenHash: string) => {
  return MongoS3UploadSession.findOne({ tokenHash }).lean();
};

export const markS3UploadSessionUsed = (tokenHash: string) => {
  return MongoS3UploadSession.updateOne(
    { tokenHash },
    {
      $set: {
        usedAt: new Date()
      }
    }
  );
};

export const revokeS3UploadSessionByTokenHash = (tokenHash: string) => {
  return MongoS3UploadSession.updateOne(
    { tokenHash },
    {
      $set: {
        revokedAt: new Date()
      }
    }
  );
};
