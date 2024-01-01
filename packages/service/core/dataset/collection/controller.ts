import {
  DatasetCollectionTrainingModeEnum,
  DatasetCollectionTypeEnum
} from '@fastgpt/global/core/dataset/constant';
import type { CreateDatasetCollectionParams } from '@fastgpt/global/core/dataset/api.d';
import { MongoDatasetCollection } from './schema';

export async function createOneCollection({
  teamId,
  tmbId,
  name,
  parentId,
  datasetId,
  type,
  trainingType = DatasetCollectionTrainingModeEnum.manual,
  chunkSize = 0,
  fileId,
  rawLink,
  qaPrompt,
  hashRawText,
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
    qaPrompt,
    hashRawText,
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

// check same collection
export const getSameRawTextCollection = async ({
  datasetId,
  hashRawText
}: {
  datasetId: string;
  hashRawText?: string;
}) => {
  const collection = await MongoDatasetCollection.findOne({
    datasetId,
    hashRawText
  });

  return collection;
};
