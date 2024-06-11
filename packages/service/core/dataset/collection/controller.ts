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
import { MongoDatasetData } from '../data/schema';
import { delImgByRelatedId } from '../../../common/file/image/controller';
import { deleteDatasetDataVector } from '../../../common/vectorStore/controller';
import { delFileByFileIdList } from '../../../common/file/gridfs/controller';
import { BucketNameEnum } from '@fastgpt/global/common/file/constants';
import { ClientSession } from '../../../common/mongo';

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

  externalFileId,
  externalFileUrl,

  hashRawText,
  rawTextLength,
  metadata = {},
  session,
  ...props
}: CreateDatasetCollectionParams & {
  teamId: string;
  tmbId: string;
  [key: string]: any;
  session?: ClientSession;
}) {
  const [collection] = await MongoDatasetCollection.create(
    [
      {
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
        externalFileId,
        externalFileUrl,

        rawTextLength,
        hashRawText,
        metadata
      }
    ],
    { session }
  );

  // create default collection
  if (type === DatasetCollectionTypeEnum.folder) {
    await createDefaultCollection({
      datasetId,
      parentId: collection._id,
      teamId,
      tmbId,
      session
    });
  }

  return collection;
}

// create default collection
export function createDefaultCollection({
  name = '手动录入',
  datasetId,
  parentId,
  teamId,
  tmbId,
  session
}: {
  name?: '手动录入' | '手动标注';
  datasetId: string;
  parentId?: string;
  teamId: string;
  tmbId: string;
  session?: ClientSession;
}) {
  return MongoDatasetCollection.create(
    [
      {
        name,
        teamId,
        tmbId,
        datasetId,
        parentId,
        type: DatasetCollectionTypeEnum.virtual,
        trainingType: TrainingModeEnum.chunk,
        chunkSize: 0,
        updateTime: new Date('2099')
      }
    ],
    { session }
  );
}

/* delete collection related images/files */
export const delCollectionRelatedSource = async ({
  collections,
  session
}: {
  collections: (CollectionWithDatasetType | DatasetCollectionSchemaType)[];
  session: ClientSession;
}) => {
  if (collections.length === 0) return;

  const teamId = collections[0].teamId;

  if (!teamId) return Promise.reject('teamId is not exist');

  const fileIdList = collections.map((item) => item?.fileId || '').filter(Boolean);
  const relatedImageIds = collections
    .map((item) => item?.metadata?.relatedImgId || '')
    .filter(Boolean);

  // delete files
  await delFileByFileIdList({
    bucketName: BucketNameEnum.dataset,
    fileIdList
  });
  // delete images
  await delImgByRelatedId({
    teamId,
    relateIds: relatedImageIds,
    session
  });
};
/**
 * delete collection and it related data
 */
export async function delCollectionAndRelatedSources({
  collections,
  session
}: {
  collections: (CollectionWithDatasetType | DatasetCollectionSchemaType)[];
  session: ClientSession;
}) {
  if (collections.length === 0) return;

  const teamId = collections[0].teamId;

  if (!teamId) return Promise.reject('teamId is not exist');

  const datasetIds = Array.from(
    new Set(
      collections.map((item) => {
        if (typeof item.datasetId === 'string') {
          return String(item.datasetId);
        }
        return String(item.datasetId._id);
      })
    )
  );
  const collectionIds = collections.map((item) => String(item._id));

  // delete training data
  await MongoDatasetTraining.deleteMany({
    teamId,
    datasetIds: { $in: datasetIds },
    collectionId: { $in: collectionIds }
  });

  /* file and imgs */
  await delCollectionRelatedSource({ collections, session });

  // delete dataset.datas
  await MongoDatasetData.deleteMany(
    { teamId, datasetIds: { $in: datasetIds }, collectionId: { $in: collectionIds } },
    { session }
  );

  // delete collections
  await MongoDatasetCollection.deleteMany(
    {
      teamId,
      _id: { $in: collectionIds }
    },
    { session }
  );

  // no session delete: delete files, vector data
  await deleteDatasetDataVector({ teamId, datasetIds, collectionIds });
}
