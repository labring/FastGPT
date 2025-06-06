import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { Types, type ClientSession } from '../../../common/mongo';
import { deleteDatasetImage } from './controller';
import { MongoDatasetImageSchema } from './schema';
import { addMinutes } from 'date-fns';
import jwt from 'jsonwebtoken';

export const removeDatasetImageExpiredTime = async ({
  ids = [],
  collectionId,
  session
}: {
  ids?: string[];
  collectionId: string;
  session?: ClientSession;
}) => {
  if (ids.length === 0) return;
  return MongoDatasetImageSchema.updateMany(
    {
      _id: {
        $in: ids
          .filter((id) => Types.ObjectId.isValid(id))
          .map((id) => (typeof id === 'string' ? new Types.ObjectId(id) : id))
      }
    },
    {
      $unset: { 'metadata.expiredTime': '' },
      $set: {
        'metadata.collectionId': String(collectionId)
      }
    },
    { session }
  );
};

export const getDatasetImagePreviewUrl = ({
  imageId,
  teamId,
  datasetId,
  expiredMinutes
}: {
  imageId: string;
  teamId: string;
  datasetId: string;
  expiredMinutes: number;
}) => {
  const expiredTime = Math.floor(addMinutes(new Date(), expiredMinutes).getTime() / 1000);

  const key = (process.env.FILE_TOKEN_KEY as string) ?? 'filetoken';
  const token = jwt.sign(
    {
      teamId: String(teamId),
      datasetId: String(datasetId),
      exp: expiredTime
    },
    key
  );

  return `/api/core/dataset/image/${imageId}?token=${token}`;
};
export const authDatasetImagePreviewUrl = (token?: string) =>
  new Promise<{
    teamId: string;
    datasetId: string;
  }>((resolve, reject) => {
    if (!token) {
      return reject(ERROR_ENUM.unAuthFile);
    }
    const key = (process.env.FILE_TOKEN_KEY as string) ?? 'filetoken';

    jwt.verify(token, key, (err, decoded: any) => {
      if (err || !decoded?.teamId || !decoded?.datasetId) {
        reject(ERROR_ENUM.unAuthFile);
        return;
      }
      resolve({
        teamId: decoded.teamId,
        datasetId: decoded.datasetId
      });
    });
  });

export const clearDatasetImages = async (datasetIds: string[]) => {
  if (datasetIds.length === 0) return;
  const images = await MongoDatasetImageSchema.find(
    {
      'metadata.datasetId': { $in: datasetIds.map((item) => String(item)) }
    },
    '_id'
  ).lean();
  await Promise.all(images.map((image) => deleteDatasetImage(String(image._id))));
};

export const clearCollectionImages = async (collectionIds: string[]) => {
  if (collectionIds.length === 0) return;
  const images = await MongoDatasetImageSchema.find(
    {
      'metadata.collectionId': { $in: collectionIds.map((item) => String(item)) }
    },
    '_id'
  ).lean();
  await Promise.all(images.map((image) => deleteDatasetImage(String(image._id))));
};
