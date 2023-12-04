import {
  DatasetCollectionTrainingModeEnum,
  DatasetCollectionTypeEnum
} from '@fastgpt/global/core/dataset/constant';
import type { CreateDatasetCollectionParams } from '@fastgpt/global/core/dataset/api.d';
import { MongoDatasetCollection } from './schema';

export async function createOneCollection({
  name,
  parentId,
  datasetId,
  type,
  trainingType = DatasetCollectionTrainingModeEnum.manual,
  chunkSize = 0,
  fileId,
  rawLink,
  teamId,
  tmbId,
  metadata = {}
}: CreateDatasetCollectionParams & { teamId: string; tmbId: string }) {
  const { _id } = await MongoDatasetCollection.create({
    name,
    teamId,
    tmbId,
    datasetId,
    parentId: parentId || null,
    type,
    trainingType,
    chunkSize,
    fileId,
    rawLink,
    metadata
  });

  // create default collection
  if (type === DatasetCollectionTypeEnum.folder) {
    await createDefaultCollection({
      datasetId,
      parentId: _id,
      teamId,
      tmbId
    });
  }

  return _id;
}

// create default collection
export function createDefaultCollection({
  name = '手动录入',
  datasetId,
  parentId,
  teamId,
  tmbId
}: {
  name?: '手动录入' | '手动标注';
  datasetId: string;
  parentId?: string;
  teamId: string;
  tmbId: string;
}) {
  return MongoDatasetCollection.create({
    name,
    teamId,
    tmbId,
    datasetId,
    parentId,
    type: DatasetCollectionTypeEnum.virtual,
    trainingType: DatasetCollectionTrainingModeEnum.manual,
    chunkSize: 0,
    updateTime: new Date('2099')
  });
}
