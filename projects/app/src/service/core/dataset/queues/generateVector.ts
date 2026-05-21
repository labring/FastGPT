import { createDatasetData, updateDatasetDataByIndexes } from '@/service/core/dataset/data/data';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { pushGenerateVectorUsage } from '@/service/support/wallet/usage/push';
import { checkTeamAiPointsAndLock } from './utils';
import { addMinutes } from 'date-fns';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { getEmbeddingModel } from '@fastgpt/service/core/ai/model';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { getMaxIndexSize } from '@fastgpt/global/core/dataset/training/utils';
import type {
  DatasetDataSchemaType,
  DatasetTrainingSchemaType
} from '@fastgpt/global/core/dataset/type';
import { retryFn } from '@fastgpt/global/common/system/utils';
import { delay } from '@fastgpt/service/common/bullmq';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import { isDatasetDataSystemIndexType } from '@fastgpt/global/core/dataset/data/utils';
import {
  getDatasetImageIndexCapability,
  getDatasetImageTrainingMode
} from '@fastgpt/service/core/dataset/utils';
import { uniqueDatasetDataMarkdownImageUrls } from '@fastgpt/service/core/dataset/data/utils';

const logger = getLogger(LogCategories.MODULE.DATASET.EMBEDDING);

const reduceQueue = () => {
  global.vectorQueueLen = global.vectorQueueLen > 0 ? global.vectorQueueLen - 1 : 0;

  return global.vectorQueueLen === 0;
};

type PopulateType = {
  dataset: { vectorModel: string; vlmModel?: string };
  collection: { name: string; indexPrefixTitle: boolean; imageIndex?: boolean };
  data?: {
    _id: string;
    q: string;
    a?: string;
    imageId?: string;
    indexes: DatasetDataSchemaType['indexes'];
  };
};
type TrainingDataType = DatasetTrainingSchemaType & PopulateType;

/**
 * 获取重建时需要从训练任务透传给 data 层的外部索引。
 *
 * `default` 和 `imageEmbedding` 都是系统索引，由 data/dataIndex 根据当前 q/a/imageId
 * 重新生成；这里仅保留 custom/question/summary/image 等外部索引。其中 image 是 VLM
 * 生成的文本描述索引，只有当前集合仍开启图片索引且 VLM 可用时才保留。
 */
export const getRebuildBaseIndexes = (trainingData: TrainingDataType) => {
  const sourceIndexes = trainingData.indexes?.length
    ? trainingData.indexes.map((index) => ({ ...index }))
    : trainingData.data?.indexes || [];
  const { supportVlm } = getDatasetImageIndexCapability({
    vectorModel: trainingData.dataset.vectorModel,
    vlmModel: trainingData.dataset.vlmModel
  });

  return sourceIndexes.filter((index) => {
    if (isDatasetDataSystemIndexType(index.type)) {
      return false;
    }
    if (
      index.type === DatasetDataIndexTypeEnum.image &&
      (!supportVlm || !trainingData.collection.imageIndex)
    ) {
      return false;
    }
    return true;
  });
};

/* 索引生成队列。每导入一次，就是一个单独的线程 */
export async function generateVector(): Promise<any> {
  const max = global.systemEnv?.vectorMaxProcess || 10;
  logger.debug('Vector queue size check', { queueSize: global.vectorQueueLen, max });

  if (global.vectorQueueLen >= max) return;
  global.vectorQueueLen++;

  try {
    while (true) {
      const start = Date.now();

      // get training data
      const {
        data,
        done = false,
        error = false
      } = await (async () => {
        try {
          const data = await MongoDatasetTraining.findOneAndUpdate(
            {
              mode: TrainingModeEnum.chunk,
              retryCount: { $gt: 0 },
              lockTime: { $lte: addMinutes(new Date(), -3) }
            },
            {
              lockTime: new Date(),
              $inc: { retryCount: -1 }
            }
          )
            .populate<PopulateType>([
              {
                path: 'dataset',
                select: 'vectorModel vlmModel'
              },
              {
                path: 'collection',
                select: 'name indexPrefixTitle imageIndex'
              },
              {
                path: 'data',
                select: '_id q a imageId indexes'
              }
            ])
            .lean();

          // task preemption
          if (!data) {
            return {
              done: true
            };
          }
          return {
            data
          };
        } catch {
          return {
            error: true
          };
        }
      })();

      // Break loop
      if (done || !data) {
        break;
      }
      if (error) {
        logger.error('Vector queue fetch task failed', { error });
        await delay(500);
        continue;
      }

      if (!data.dataset || !data.collection) {
        logger.info('Vector queue task skipped: dataset or collection missing', {
          datasetId: data.datasetId,
          collectionId: data.collectionId,
          trainingId: data._id
        });
        // Delete data
        await MongoDatasetTraining.deleteOne({ _id: data._id });
        continue;
      }

      // auth balance
      if (!(await checkTeamAiPointsAndLock(data.teamId))) {
        continue;
      }

      logger.info('Vector queue task started', {
        trainingId: data._id,
        datasetId: data.datasetId,
        collectionId: data.collectionId,
        teamId: data.teamId,
        tmbId: data.tmbId,
        dataId: data.dataId
      });

      try {
        const { tokens } = await (async () => {
          if (data.dataId) {
            return rebuildData({ trainingData: data });
          } else {
            return insertData({ trainingData: data });
          }
        })();

        // push usage
        pushGenerateVectorUsage({
          teamId: data.teamId,
          tmbId: data.tmbId,
          inputTokens: tokens,
          model: data.dataset.vectorModel,
          usageId: data.billId
        });

        logger.info('Vector queue task finished', {
          durationMs: Date.now() - start,
          trainingId: data._id,
          datasetId: data.datasetId,
          collectionId: data.collectionId,
          dataId: data.dataId
        });
      } catch (err: any) {
        logger.error('Vector queue task failed', {
          error: err,
          trainingId: data._id,
          datasetId: data.datasetId,
          collectionId: data.collectionId,
          dataId: data.dataId
        });
        await MongoDatasetTraining.updateOne(
          {
            _id: data._id
          },
          {
            errorMsg: getErrText(err, 'unknown error')
          }
        );
        await delay(100);
      }
    }
  } catch (error) {
    logger.error('Vector queue loop failed', { error });
  }

  if (reduceQueue()) {
    logger.info('Vector queue drained', { queueSize: global.vectorQueueLen });
  }
  logger.debug('Vector queue loop exit', { queueSize: global.vectorQueueLen });
}

const rebuildData = async ({ trainingData }: { trainingData: TrainingDataType }) => {
  if (!trainingData.data) {
    await MongoDatasetTraining.deleteOne({ _id: trainingData._id });
    return Promise.reject('Not data');
  }
  const datasetData = trainingData.data;

  // 批量重建时先挂下一条任务，避免当前任务耗时太长导致后续数据迟迟不入队。
  try {
    await retryFn(() =>
      mongoSessionRun(async (session) => {
        const newRebuildingData = await MongoDatasetData.findOneAndUpdate(
          {
            rebuilding: true,
            teamId: trainingData.teamId,
            datasetId: trainingData.datasetId
          },
          {
            $unset: {
              rebuilding: null
            },
            updateTime: new Date()
          },
          { session }
        ).select({
          _id: 1,
          collectionId: 1,
          q: 1,
          imageId: 1,
          indexes: 1
        });

        if (newRebuildingData) {
          const collection = await MongoDatasetCollection.findById(newRebuildingData.collectionId)
            .select('imageIndex')
            .session(session);
          const hasMarkdownImages =
            !!collection?.imageIndex &&
            uniqueDatasetDataMarkdownImageUrls([newRebuildingData.q]).length > 0;
          const { availableVlmModel, supportVlm, supportImageIndex } =
            getDatasetImageIndexCapability({
              vectorModel: trainingData.dataset.vectorModel,
              vlmModel: trainingData.dataset.vlmModel
            });
          const mode = getDatasetImageTrainingMode({
            supportVlm,
            supportImageIndex,
            imageId: newRebuildingData.imageId,
            hasMarkdownImages
          });

          await MongoDatasetTraining.create(
            [
              {
                teamId: trainingData.teamId,
                tmbId: trainingData.tmbId,
                datasetId: trainingData.datasetId,
                collectionId: newRebuildingData.collectionId,
                billId: trainingData.billId,
                mode,
                model:
                  (mode === TrainingModeEnum.imageParse || mode === TrainingModeEnum.image) &&
                  supportVlm &&
                  availableVlmModel
                    ? availableVlmModel.model
                    : trainingData.dataset.vectorModel,
                dataId: newRebuildingData._id,
                ...(newRebuildingData.imageId && { imageId: newRebuildingData.imageId }),
                ...(mode === TrainingModeEnum.image && {
                  q: newRebuildingData.q,
                  indexes: newRebuildingData.indexes
                }),
                retryCount: 50
              }
            ],
            { session, ordered: true }
          );
        }
      })
    );
  } catch {}

  const embModel = getEmbeddingModel(trainingData.dataset.vectorModel);
  const q = trainingData.q || datasetData.q;
  const a = trainingData.a ?? datasetData.a;
  const rebuildIndexes = getRebuildBaseIndexes(trainingData);

  const { tokens } = await updateDatasetDataByIndexes({
    dataId: String(datasetData._id),
    q,
    a,
    imageId: datasetData.imageId,
    imageIndex: !!trainingData.collection.imageIndex,
    indexes: rebuildIndexes,
    model: trainingData.dataset.vectorModel,
    indexSize: trainingData.indexSize || getMaxIndexSize(embModel),
    indexPrefix: trainingData.collection.indexPrefixTitle
      ? `# ${trainingData.collection.name}`
      : undefined
  });

  await mongoSessionRun(async (session) => {
    if (trainingData.imageDescMap) {
      await MongoDatasetData.updateOne(
        { _id: datasetData._id },
        { $set: { imageDescMap: trainingData.imageDescMap } },
        { session }
      );
    }
    await MongoDatasetTraining.deleteOne({ _id: trainingData._id }, { session });
  });

  return { tokens };
};

const insertData = async ({ trainingData }: { trainingData: TrainingDataType }) => {
  return mongoSessionRun(async (session) => {
    const embModel = getEmbeddingModel(trainingData.dataset.vectorModel);

    // insert new data to dataset
    const { tokens } = await createDatasetData({
      teamId: trainingData.teamId,
      tmbId: trainingData.tmbId,
      datasetId: trainingData.datasetId,
      collectionId: trainingData.collectionId,
      q: trainingData.q,
      a: trainingData.a,
      imageId: trainingData.imageId,
      imageDescMap: trainingData.imageDescMap,
      chunkIndex: trainingData.chunkIndex,
      indexSize: trainingData.indexSize || getMaxIndexSize(embModel),
      indexes: trainingData.indexes || [],
      indexPrefix: trainingData.collection.indexPrefixTitle
        ? `# ${trainingData.collection.name}`
        : undefined,
      embeddingModel: trainingData.dataset.vectorModel,
      imageIndex: !!trainingData.collection.imageIndex,
      session
    });

    // delete data from training
    await MongoDatasetTraining.deleteOne({ _id: trainingData._id }, { session });

    return {
      tokens
    };
  });
};
