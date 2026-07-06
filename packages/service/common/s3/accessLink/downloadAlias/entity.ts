import { MongoS3DownloadAlias } from './schema';
import type { S3DownloadAliasType } from '../type';

type CreateS3DownloadAliasData = Omit<S3DownloadAliasType, 'createTime' | 'updateTime'> & {
  createTime?: Date;
  updateTime?: Date;
};

const isMongoDuplicateKeyError = (error: unknown) =>
  !!error && typeof error === 'object' && 'code' in error && error.code === 11000;

export const findS3DownloadAliasByAliasKey = (aliasKey: string) => {
  return MongoS3DownloadAlias.findOne({ aliasKey }).lean();
};

export const findS3DownloadAliasByAliasId = (aliasId: string) => {
  return MongoS3DownloadAlias.findOne({ aliasId }).lean();
};

export const createS3DownloadAlias = async (data: CreateS3DownloadAliasData) => {
  try {
    const now = new Date();
    const [created] = await MongoS3DownloadAlias.create([
      {
        ...data,
        createTime: data.createTime ?? now,
        updateTime: data.updateTime ?? now
      }
    ]);

    return created.toObject() as S3DownloadAliasType;
  } catch (error) {
    if (isMongoDuplicateKeyError(error)) {
      return findS3DownloadAliasByAliasKey(data.aliasKey);
    }

    throw error;
  }
};

export const touchS3DownloadAliasPurgeAt = ({
  aliasKey,
  purgeAt,
  now = new Date()
}: {
  aliasKey: string;
  purgeAt: Date;
  now?: Date;
}) => {
  return MongoS3DownloadAlias.updateOne(
    { aliasKey },
    {
      $set: {
        updateTime: now,
        lastIssuedAt: now
      },
      $max: {
        purgeAt
      }
    }
  );
};

export const disableS3DownloadAliasByAliasId = (aliasId: string) => {
  return MongoS3DownloadAlias.updateOne(
    { aliasId },
    {
      $set: {
        disabledAt: new Date(),
        updateTime: new Date()
      }
    }
  );
};

export const deleteS3DownloadAliasByObject = ({
  bucketName,
  objectKey
}: {
  bucketName: string;
  objectKey: string;
}) => {
  return MongoS3DownloadAlias.deleteMany({
    bucketName,
    objectKey
  });
};

export const deleteS3DownloadAliasByObjects = ({
  bucketName,
  objectKeys
}: {
  bucketName: string;
  objectKeys: string[];
}) => {
  if (objectKeys.length === 0) return Promise.resolve();

  return MongoS3DownloadAlias.deleteMany({
    bucketName,
    objectKey: { $in: objectKeys }
  });
};
