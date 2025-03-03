import {
  DatasetCollectionTypeEnum,
  DatasetCollectionDataProcessModeEnum
} from '@fastgpt/global/core/dataset/constants';
import type { CreateDatasetCollectionParams } from '@fastgpt/global/core/dataset/api.d';
import { MongoDatasetCollection } from './schema';
import { DatasetCollectionSchemaType, DatasetSchemaType } from '@fastgpt/global/core/dataset/type';
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
import { getLLMModel, getEmbeddingModel, getVlmModel } from '../../ai/model';
import { pushDataListToTrainingQueue } from '../training/controller';
import { MongoImage } from '../../../common/file/image/schema';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { addDays } from 'date-fns';
import { MongoDatasetDataText } from '../data/dataTextSchema';
import { retryFn } from '@fastgpt/global/common/system/utils';
import { getTrainingModeByCollection } from './utils';

export const createCollectionAndInsertData = async ({
  dataset,
  rawText,
  relatedId,
  createCollectionParams,
  isQAImport = false,
  billId,
  session
}: {
  dataset: DatasetSchemaType;
  rawText: string;
  relatedId?: string;
  createCollectionParams: CreateOneCollectionParams;

  isQAImport?: boolean;
  billId?: string;
  session?: ClientSession;
}) => {
  // Adapter 4.9.0
  if (createCollectionParams.trainingType === DatasetCollectionDataProcessModeEnum.auto) {
    createCollectionParams.trainingType = DatasetCollectionDataProcessModeEnum.chunk;
    createCollectionParams.autoIndexes = true;
  }

  const teamId = createCollectionParams.teamId;
  const tmbId = createCollectionParams.tmbId;
  // Chunk split params
  const trainingType =
    createCollectionParams.trainingType || DatasetCollectionDataProcessModeEnum.chunk;
  const chunkSize = createCollectionParams.chunkSize || 512;
  const chunkSplitter = createCollectionParams.chunkSplitter;
  const qaPrompt = createCollectionParams.qaPrompt;
  const usageName = createCollectionParams.name;

  // 1. split chunks
  const chunks = rawText2Chunks({
    rawText,
    chunkLen: chunkSize,
    overlapRatio: trainingType === DatasetCollectionDataProcessModeEnum.chunk ? 0.2 : 0,
    customReg: chunkSplitter ? [chunkSplitter] : [],
    isQAImport
  });

  // 2. auth limit
  await checkDatasetLimit({
    teamId,
    insertLen: predictDataLimitLength(
      getTrainingModeByCollection({
        trainingType,
        autoIndexes: createCollectionParams.autoIndexes,
        imageIndex: createCollectionParams.imageIndex
      }),
      chunks
    )
  });

  const fn = async (session: ClientSession) => {
    // 3. create collection
    const { _id: collectionId } = await createOneCollection({
      ...createCollectionParams,

      hashRawText: hashStr(rawText),
      rawTextLength: rawText.length,
      nextSyncTime: (() => {
        if (!dataset.autoSync) return undefined;
        if (
          [DatasetCollectionTypeEnum.link, DatasetCollectionTypeEnum.apiFile].includes(
            createCollectionParams.type
          )
        ) {
          return addDays(new Date(), 1);
        }
        return undefined;
      })(),
      session
    });

    // 4. create training bill
    const traingBillId = await (async () => {
      if (billId) return billId;
      const { billId: newBillId } = await createTrainingUsage({
        teamId,
        tmbId,
        appName: usageName,
        billSource: UsageSourceEnum.training,
        vectorModel: getEmbeddingModel(dataset.vectorModel)?.name,
        agentModel: getLLMModel(dataset.agentModel)?.name,
        vllmModel: getVlmModel(dataset.vlmModel)?.name,
        session
      });
      return newBillId;
    })();

    // 5. insert to training queue
    const insertResults = await pushDataListToTrainingQueue({
      teamId,
      tmbId,
      datasetId: dataset._id,
      collectionId,
      agentModel: dataset.agentModel,
      vectorModel: dataset.vectorModel,
      vlmModel: dataset.vlmModel,
      mode: getTrainingModeByCollection({
        trainingType,
        autoIndexes: createCollectionParams.autoIndexes,
        imageIndex: createCollectionParams.imageIndex
      }),
      prompt: qaPrompt,
      billId: traingBillId,
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

  createTime,
  updateTime,

  hashRawText,
  rawTextLength,
  metadata = {},
  tags,

  nextSyncTime,

  fileId,
  rawLink,
  externalFileId,
  externalFileUrl,
  apiFileId,

  // Parse settings
  customPdfParse,
  imageIndex,

  // Chunk settings
  trainingType = DatasetCollectionDataProcessModeEnum.chunk,
  autoIndexes,
  chunkSize = 512,
  chunkSplitter,
  qaPrompt,

  session
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

        rawTextLength,
        hashRawText,
        tags: collectionTags,
        metadata,

        createTime,
        updateTime,
        nextSyncTime,

        ...(fileId ? { fileId } : {}),
        ...(rawLink ? { rawLink } : {}),
        ...(externalFileId ? { externalFileId } : {}),
        ...(externalFileUrl ? { externalFileUrl } : {}),
        ...(apiFileId ? { apiFileId } : {}),

        // Parse settings
        customPdfParse,
        imageIndex,

        // Chunk settings
        trainingType,
        autoIndexes,
        chunkSize,
        chunkSplitter,
        qaPrompt
      }
    ],
    { session, ordered: true }
  );

  return collection;
}

/* delete collection related images/files */
export const delCollectionRelatedSource = async ({
  collections,
  session
}: {
  collections: {
    teamId: string;
    fileId?: string;
    metadata?: {
      relatedImgId?: string;
    };
  }[];
  session?: ClientSession;
}) => {
  if (collections.length === 0) return;

  const teamId = collections[0].teamId;

  if (!teamId) return Promise.reject('teamId is not exist');

  const fileIdList = collections.map((item) => item?.fileId || '').filter(Boolean);
  const relatedImageIds = collections
    .map((item) => item?.metadata?.relatedImgId || '')
    .filter(Boolean);

  // Delete files
  await delFileByFileIdList({
    bucketName: BucketNameEnum.dataset,
    fileIdList
  });
  // Delete images
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
  delImg = true,
  delFile = true
}: {
  collections: DatasetCollectionSchemaType[];
  session: ClientSession;
  delImg: boolean;
  delFile: boolean;
}) {
  if (collections.length === 0) return;

  const teamId = collections[0].teamId;

  if (!teamId) return Promise.reject('teamId is not exist');

  const datasetIds = Array.from(new Set(collections.map((item) => String(item.datasetId))));
  const collectionIds = collections.map((item) => String(item._id));

  await retryFn(async () => {
    await Promise.all([
      // Delete training data
      MongoDatasetTraining.deleteMany({
        teamId,
        datasetId: { $in: datasetIds },
        collectionId: { $in: collectionIds }
      }),
      // Delete dataset_data_texts
      MongoDatasetDataText.deleteMany({
        teamId,
        datasetId: { $in: datasetIds },
        collectionId: { $in: collectionIds }
      }),
      // Delete dataset_datas
      MongoDatasetData.deleteMany({
        teamId,
        datasetId: { $in: datasetIds },
        collectionId: { $in: collectionIds }
      }),
      ...(delImg
        ? [
            delImgByRelatedId({
              teamId,
              relateIds: collections
                .map((item) => item?.metadata?.relatedImgId || '')
                .filter(Boolean)
            })
          ]
        : []),
      ...(delFile
        ? [
            delFileByFileIdList({
              bucketName: BucketNameEnum.dataset,
              fileIdList: collections.map((item) => item?.fileId || '').filter(Boolean)
            })
          ]
        : []),
      // Delete vector data
      deleteDatasetDataVector({ teamId, datasetIds, collectionIds })
    ]);

    // delete collections
    await MongoDatasetCollection.deleteMany(
      {
        teamId,
        _id: { $in: collectionIds }
      },
      { session }
    );
  });
}
