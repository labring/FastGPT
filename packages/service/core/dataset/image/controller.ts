import { addMinutes } from 'date-fns';
import { MongoDatasetCollectionImage } from './schema';
import type { DatasetImageSchema } from '@fastgpt/global/core/dataset/image/type';
import mongoose from 'mongoose';

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
  // Set TTL to 30min
  const expiredTime = addMinutes(new Date(), 30);

  const image = await MongoDatasetCollectionImage.create({
    teamId: String(teamId),
    datasetId: String(datasetId),
    collectionId: collectionId ? String(collectionId) : null,
    name,
    path,
    contentType,
    size,
    metadata,
    createTime: new Date(),
    expiredTime
  });

  return String(image._id);
}

export async function getDatasetImage(imageId: string): Promise<DatasetImageSchema | null> {
  try {
    if (!imageId || !mongoose.Types.ObjectId.isValid(imageId)) {
      return null;
    }
    const result = await MongoDatasetCollectionImage.findById(imageId).lean();
    return result;
  } catch (error) {
    return null;
  }
}
