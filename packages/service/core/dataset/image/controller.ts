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
    teamId: teamId,
    datasetId: datasetId,
    collectionId: collectionId,
    name,
    path,
    contentType,
    size,
    metadata,
    expiredTime
  });

  return String(image._id);
}

export async function getDatasetImage(imageId: string): Promise<DatasetImageSchema | null> {
  return MongoDatasetCollectionImage.findById(imageId).lean();
}
