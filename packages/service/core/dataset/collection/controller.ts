import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import type { CreateDatasetCollectionParams } from '@fastgpt/global/core/dataset/api.d';
import { MongoDatasetCollection } from './schema';
import {
  CollectionWithDatasetType,
  DatasetCollectionSchemaType,
  DatasetSchemaType
} from '@fastgpt/global/core/dataset/type';
import { MongoDatasetTraining } from '../training/schema';
import { MongoDatasetData } from '../data/schema';
import { delImgByRelatedId } from '../../../common/file/image/controller';
import { deleteDatasetDataVector } from '../../../common/vectorStore/controller';
import { delFileByFileIdList } from '../../../common/file/gridfs/controller';
import { BucketNameEnum } from '@fastgpt/global/common/file/constants';
import { ClientSession } from '../../../common/mongo';
import { createOrGetCollectionTags } from './utils';
import { rawText2Chunks } from '../read';
import { checkDatasetLimit } from '../../../support/permission/teamLimit';
import { predictDataLimitLength } from '../../../../global/core/dataset/utils';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { createTrainingUsage } from '../../../support/wallet/usage/controller';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { getLLMModel, getVectorModel } from '../../ai/model';
import { pushDataListToTrainingQueue } from '../training/controller';
import { MongoImage } from '../../../common/file/image/schema';
import { hashStr } from '@fastgpt/global/common/string/tools';

export const createCollectionAndInsertData = async ({
  dataset,
  rawText,
  relatedId,
  createCollectionParams,
  isQAImport = false,
  session
}: {
  dataset: DatasetSchemaType;
  rawText: string;
  relatedId?: string;
  createCollectionParams: CreateOneCollectionParams;

  isQAImport?: boolean;
  session?: ClientSession;
}) => {
  const teamId = createCollectionParams.teamId;
  const tmbId = createCollectionParams.tmbId;
  // Chunk split params
  const trainingType = createCollectionParams.trainingType || TrainingModeEnum.chunk;
  const chunkSize = createCollectionParams.chunkSize;
  const chunkSplitter = createCollectionParams.chunkSplitter;
  const qaPrompt = createCollectionParams.qaPrompt;
  const usageName = createCollectionParams.name;

  // 1. split chunks
  const chunks = rawText2Chunks({
    rawText,
    chunkLen: chunkSize,
    overlapRatio: trainingType === TrainingModeEnum.chunk ? 0.2 : 0,
    customReg: chunkSplitter ? [chunkSplitter] : [],
    isQAImport
  });

  // 2. auth limit
  await checkDatasetLimit({
    teamId,
    insertLen: predictDataLimitLength(trainingType, chunks)
  });

  const fn = async (session: ClientSession) => {
    // 3. create collection
    const { _id: collectionId } = await createOneCollection({
      ...createCollectionParams,

      hashRawText: hashStr(rawText),
      rawTextLength: rawText.length,
      session
    });

    // 4. create training bill
    const { billId } = await createTrainingUsage({
      teamId,
      tmbId,
      appName: usageName,
      billSource: UsageSourceEnum.training,
      vectorModel: getVectorModel(dataset.vectorModel)?.name,
      agentModel: getLLMModel(dataset.agentModel)?.name,
      session
    });

    // 5. insert to training queue
    const insertResults = await pushDataListToTrainingQueue({
      teamId,
      tmbId,
      datasetId: dataset._id,
      collectionId,
      agentModel: dataset.agentModel,
      vectorModel: dataset.vectorModel,
      trainingMode: trainingType,
      prompt: qaPrompt,
      billId,
      data: chunks.map((item, index) => ({
        ...item,
        chunkIndex: index
      })),
      session
    });

    // 6. remove related image ttl
    if (relatedId) {
      await MongoImage.updateMany(
        {
          teamId,
          'metadata.relatedId': relatedId
        },
        {
          // Remove expiredTime to avoid ttl expiration
          $unset: {
            expiredTime: 1
          }
        },
        {
          session
        }
      );
    }

    return {
      collectionId,
      insertResults
    };
  };

  if (session) {
    return fn(session);
  }
  return mongoSessionRun(fn);
};

export type CreateOneCollectionParams = CreateDatasetCollectionParams & {
  teamId: string;
  tmbId: string;
  session?: ClientSession;
};
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

  apiFileId,

  hashRawText,
  rawTextLength,
  metadata = {},
  session,
  tags,
  createTime
}: CreateOneCollectionParams) {
  // Create collection tags
  const collectionTags = await createOrGetCollectionTags({ tags, teamId, datasetId, session });

  // Create collection
  const [collection] = await MongoDatasetCollection.create(
    [
      {
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
        metadata,

        ...(fileId ? { fileId } : {}),
        ...(rawLink ? { rawLink } : {}),
        ...(externalFileId ? { externalFileId } : {}),
        ...(externalFileUrl ? { externalFileUrl } : {}),
        ...(apiFileId ? { apiFileId } : {}),

        rawTextLength,
        hashRawText,
        tags: collectionTags,
        createTime
      }
    ],
    { session }
  );

  return collection;
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
export async function delCollection({
  collections,
  session,
  delRelatedSource
}: {
  collections: (CollectionWithDatasetType | DatasetCollectionSchemaType)[];
  session: ClientSession;
  delRelatedSource: boolean;
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
  if (delRelatedSource) {
    await delCollectionRelatedSource({ collections, session });
  }

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

/**
 * delete delOnlyCollection
 */
export async function delOnlyCollection({
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
