import {
  TrainingModeEnum,
  DatasetCollectionTypeEnum
} from '@fastgpt/global/core/dataset/constants';
import type { CreateDatasetCollectionParams } from '@fastgpt/global/core/dataset/api.d';
import { MongoDatasetCollection } from './schema';
import {
  CollectionWithDatasetType,
  DatasetCollectionSchemaType
} from '@fastgpt/global/core/dataset/type';
import { MongoDatasetTraining } from '../training/schema';
import { delay } from '@fastgpt/global/common/system/utils';
import { MongoDatasetData } from '../data/schema';
import { delImgByRelatedId } from '../../../common/file/image/controller';
import { deleteDatasetDataVector } from '../../../common/vectorStore/controller';
import { delFileByFileIdList } from '../../../common/file/gridfs/controller';
import { BucketNameEnum } from '@fastgpt/global/common/file/constants';

export async function createOneCollection({
  teamId,
  tmbId,
  name,
  parentId,
  datasetId,
  type,

  trainingType = TrainingModeEnum.chunk,
  chunkSize = 512,
  chunkSplitter,
  qaPrompt,

  fileId,
  rawLink,

  hashRawText,
  rawTextLength,
  metadata = {},
  ...props
}: CreateDatasetCollectionParams & { teamId: string; tmbId: string; [key: string]: any }) {
  const { _id } = await MongoDatasetCollection.create({
    ...props,
    teamId,
    tmbId,
    parentId: parentId || null,
    datasetId,
    name,
    type,

    trainingType,
    chunkSize,
    chunkSplitter,
    qaPrompt,

    fileId,
    rawLink,

    rawTextLength,
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
    trainingType: TrainingModeEnum.chunk,
    chunkSize: 0,
    updateTime: new Date('2099')
  });
}

/**
 * delete collection and it related data
 */
export async function delCollectionAndRelatedSources({
  collections
}: {
  collections: (CollectionWithDatasetType | DatasetCollectionSchemaType)[];
}) {
  if (collections.length === 0) return;

  const teamId = collections[0].teamId;

  if (!teamId) return Promise.reject('teamId is not exist');

  const collectionIds = collections.map((item) => String(item._id));
  const fileIdList = collections.map((item) => item?.fileId || '').filter(Boolean);
  const relatedImageIds = collections
    .map((item) => item?.metadata?.relatedImgId || '')
    .filter(Boolean);

  // delete training data
  await MongoDatasetTraining.deleteMany({
    teamId,
    collectionId: { $in: collectionIds }
  });

  await delay(2000);

  // delete dataset.datas
  await MongoDatasetData.deleteMany({ teamId, collectionId: { $in: collectionIds } });
  // delete pg data
  await deleteDatasetDataVector({ teamId, collectionIds });

  // delete file and imgs
  await Promise.all([
    delImgByRelatedId({
      teamId,
      relateIds: relatedImageIds
    }),
    delFileByFileIdList({
      bucketName: BucketNameEnum.dataset,
      fileIdList
    })
  ]);

  // delete collections
  await MongoDatasetCollection.deleteMany({
    _id: { $in: collectionIds }
  });
}
