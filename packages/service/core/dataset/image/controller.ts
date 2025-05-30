import { addMinutes } from 'date-fns';
import { MongoDatasetCollectionImage } from './schema';
import type { DatasetImageSchema } from '@fastgpt/global/core/dataset/image/type';
import { Types } from '../../../common/mongo';
import { getGridBucket } from '../../../common/file/gridfs/controller';
import { BucketNameEnum } from '@fastgpt/global/common/file/constants';
import fs from 'fs';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';

/* ============= dataset images ========== */

export async function createDatasetImage({
  teamId,
  datasetId,
  collectionId,
  name,
  path,
  contentType,
  size,
  metadata = {}
}: {
  teamId: string;
  datasetId: string;
  collectionId?: string;
  name: string;
  path: string;
  contentType: string;
  size: number;
  metadata?: Record<string, any>;
}): Promise<string> {
  try {
    const fileId = new Types.ObjectId();

    const bucket = getGridBucket(BucketNameEnum.dataset);
    const uploadStream = bucket.openUploadStreamWithId(fileId, name, {
      contentType,
      metadata: {
        ...metadata,
        teamId,
        datasetId
      }
    });

    const readStream = fs.createReadStream(path);
    await new Promise((resolve, reject) => {
      readStream.pipe(uploadStream).on('finish', resolve).on('error', reject);
    });

    // Set TTL to 30min
    const expiredTime = addMinutes(new Date(), 30);

    const image = await MongoDatasetCollectionImage.create({
      _id: fileId,
      teamId,
      datasetId,
      collectionId,
      name,
      contentType,
      size,
      metadata,
      expiredTime
    });

    return String(image._id);
  } catch (error) {
    fs.unlink(path, () => {});
    throw error;
  }
}

export async function getDatasetImage(imageId: string): Promise<DatasetImageSchema | null> {
  return MongoDatasetCollectionImage.findById(imageId).lean();
}

export async function getDatasetImageStream(imageId: string) {
  const bucket = getGridBucket(BucketNameEnum.dataset);
  return bucket.openDownloadStream(new Types.ObjectId(imageId));
}

export async function deleteDatasetImage(imageId: string) {
  return mongoSessionRun(async (session) => {
    try {
      const bucket = getGridBucket(BucketNameEnum.dataset);

      await Promise.all([
        bucket.delete(new Types.ObjectId(imageId)),
        MongoDatasetCollectionImage.findByIdAndDelete(imageId).session(session)
      ]);
    } catch (error) {
      console.error('Failed to delete image:', error);
      throw error;
    }
  });
}
