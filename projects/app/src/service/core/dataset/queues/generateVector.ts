import { insertDataVector } from '@/service/core/dataset/data/controller';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { pushGenerateVectorUsage } from '@/service/support/wallet/usage/push';
import { checkTeamAiPointsAndLock } from './utils';
import { addMinutes } from 'date-fns';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import {
  deleteDatasetDataVector,
  insertDatasetDataVector
} from '@fastgpt/service/common/vectorDB/controller';
import { getEmbeddingModelById } from '@fastgpt/service/core/ai/model';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { getMaxIndexSize } from '@fastgpt/global/core/dataset/training/utils';
import type {
  DatasetDataSchemaType,
  DatasetTrainingSchemaType
} from '@fastgpt/global/core/dataset/type';
import { retryFn } from '@fastgpt/global/common/system/utils';
import { delay } from '@fastgpt/service/common/bullmq';

const logger = getLogger(LogCategories.MODULE.DATASET.EMBEDDING);

const reduceQueue = () => {
  global.vectorQueueLen = global.vectorQueueLen > 0 ? global.vectorQueueLen - 1 : 0;

  return global.vectorQueueLen === 0;
};

type PopulateType = {
  dataset: { vectorModelId: string };
  collection: { name: string; indexPrefixTitle: boolean; hypeIndexes: boolean };
  data: { _id: string; q: string; a: string; indexes: DatasetDataSchemaType['indexes'] };
};
type TrainingDataType = DatasetTrainingSchemaType & PopulateType;

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
          // ✅ 查询多种训练模式 (chunk, synonymStandardize, synonymRestore)
          // 说明: 这里同时查询三种模式是安全的，因为双向互斥检查保证了：
          // 1. pushDataListToTrainingQueue 会检查并阻止 chunk 与 synonym 任务并发
          // 2. uploadSynonymFile/deleteSynonymFile 会检查并阻止 synonym 与任何训练任务并发
          // 因此同一知识库同一时刻只会有一种类型的任务，不会出现 mode 共存冲突
          const data = await MongoDatasetTraining.findOneAndUpdate(
            {
              mode: {
                $in: [
                  TrainingModeEnum.chunk,
                  TrainingModeEnum.synonymStandardize,
                  TrainingModeEnum.synonymRestore
                ]
              },
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
                select: 'vectorModelId'
              },
              {
                path: 'collection',
                select: 'name indexPrefixTitle hypeIndexes'
              },
              {
                path: 'data',
                select: '_id q a indexes'
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
        } catch (error) {
          logger.error('[generateVector] Fetch training task failed', {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
          });
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
          // Route to different processors based on mode
          // rebuildData: 已有数据向量重建（向量模型变更场景）
          //   条件：data.dataId 存在 + data.data 已有非空的 indexes（旧向量引用）
          // insertData: 其他所有情况（新增 / 手动插入占位 / synthesis 链路后的 chunk）
          if (
            data.mode === TrainingModeEnum.chunk &&
            data.dataId &&
            data.data &&
            data.data.indexes.length > 0
          ) {
            return rebuildData({ trainingData: data });
          } else if (data.mode === TrainingModeEnum.chunk) {
            return insertData({ trainingData: data });
          } else if (data.mode === TrainingModeEnum.synonymStandardize) {
            // Import dynamically to avoid circular dependencies
            const { processSynonymStandardize } = await import('./synonym/standardize');
            return processSynonymStandardize({ trainingData: data });
          } else if (data.mode === TrainingModeEnum.synonymRestore) {
            // Import dynamically to avoid circular dependencies
            const { processSynonymRestore } = await import('./synonym/restore');
            return processSynonymRestore({ trainingData: data });
          } else {
            throw new Error(`Unknown training mode: ${data.mode}`);
          }
        })();

        // push usage
        pushGenerateVectorUsage({
          teamId: data.teamId,
          tmbId: data.tmbId,
          inputTokens: tokens,
          modelId: data.dataset.vectorModelId,
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

/**
 * Check if all training tasks for a collection are complete,
 * and if so, set indexingCompleteTime on the collection.
 * Non-critical: errors are logged but not thrown.
 */
async function checkCollectionIndexingComplete(collectionId: string, source: string) {
  try {
    // Check for any remaining training task, regardless of retry count.
    // A task with retryCount: 0 (exhausted retries with errorMsg) is still
    // an incomplete task — skipping it would mark the collection as done prematurely.
    const anyRemaining = await MongoDatasetTraining.findOne({ collectionId }, { _id: 1 }).lean();
    if (!anyRemaining) {
      await MongoDatasetCollection.updateOne(
        { _id: collectionId },
        { $set: { indexingCompleteTime: new Date() } }
      );
      logger.info('Collection indexing complete', { collectionId, source });
    }
  } catch (err) {
    logger.warn('Failed to check collection completion', { collectionId, source, error: err });
  }
}

const rebuildData = async ({ trainingData }: { trainingData: TrainingDataType }) => {
  if (!trainingData.data) {
    await MongoDatasetTraining.deleteOne({ _id: trainingData._id });
    return Promise.reject(`Not data, dataId: ${trainingData.dataId}`);
  }

  // Old vectorId
  const deleteVectorIdList = trainingData.data.indexes.map((index) => index.dataId);

  // Find next rebuilding data to insert training queue
  try {
    await retryFn(() =>
      mongoSessionRun(async (session) => {
        // get new mongoData insert to training
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
          collectionId: 1
        });

        if (newRebuildingData) {
          await MongoDatasetTraining.create(
            [
              {
                teamId: trainingData.teamId,
                tmbId: trainingData.tmbId,
                datasetId: trainingData.datasetId,
                collectionId: newRebuildingData.collectionId,
                billId: trainingData.billId,
                mode: TrainingModeEnum.chunk,
                dataId: newRebuildingData._id,
                retryCount: 50
              }
            ],
            { session, ordered: true }
          );
        }
      })
    );
  } catch (error) {}

  // update vector, update dataset_data rebuilding status, delete data from training
  // 1. Insert new vector to dataset_data
  const insertResult = await insertDatasetDataVector({
    inputs: trainingData.data.indexes.map((index) => index.text),
    model: getEmbeddingModelById(trainingData.dataset.vectorModelId),
    teamId: trainingData.teamId,
    datasetId: trainingData.datasetId,
    collectionId: trainingData.collectionId
  });

  trainingData.data.indexes.forEach((item, index) => {
    item.dataId = insertResult.insertIds[index];
  });

  await mongoSessionRun(async (session) => {
    // 2. Ensure that the training data is deleted after the Mongo update is successful
    await MongoDatasetData.updateOne(
      { _id: trainingData.data._id },
      {
        $set: {
          indexes: trainingData.data.indexes,
          indexingCompleteTime: new Date()
        }
      },
      { session }
    );
    // 3. Delete the training data
    await MongoDatasetTraining.deleteOne({ _id: trainingData._id }, { session });

    // 4. Delete old vector
    await deleteDatasetDataVector({
      teamId: trainingData.teamId,
      idList: deleteVectorIdList
    });
  });
  await checkCollectionIndexingComplete(String(trainingData.collectionId), 'rebuild');

  return { tokens: insertResult.tokens };
};

const insertData = async ({ trainingData }: { trainingData: TrainingDataType }) => {
  const vectorModel = getEmbeddingModelById(trainingData.dataset.vectorModelId);

  // Data must be pre-created before entering this queue (by datasetParse or API handlers).
  // If dataId is missing, it's either an old training record from before the refactor or an
  // upstream bug. Log at error level and set errorMsg so it shows up in error reporting,
  // rather than silently dropping the record.
  if (!trainingData.dataId) {
    logger.error('[generateVector] Missing dataId — training record will be marked as error', {
      trainingId: trainingData._id,
      mode: trainingData.mode,
      collectionId: trainingData.collectionId,
      datasetId: trainingData.datasetId
    });
    await MongoDatasetTraining.updateOne(
      { _id: trainingData._id },
      {
        $set: { errorMsg: 'Missing dataId: Data draft was not pre-created (may be a stale record)' }
      }
    );
    return { tokens: 0 };
  }

  const dataId = trainingData.dataId;
  const existingData = await MongoDatasetData.findById(dataId).lean();
  if (!existingData) {
    logger.error('[generateVector] Data not found for dataId — training record marked as error', {
      trainingId: trainingData._id,
      dataId,
      collectionId: trainingData.collectionId
    });
    await MongoDatasetTraining.updateOne(
      { _id: trainingData._id },
      { $set: { errorMsg: `Data not found: ${dataId} (may have been deleted)` } }
    );
    return { tokens: 0 };
  }

  let tokens = 0;
  await mongoSessionRun(async (session) => {
    const result = await insertDataVector({
      dataId,
      q: existingData.q,
      a: existingData.a || '',
      indexSize: trainingData.indexSize || getMaxIndexSize(vectorModel),
      indexes: trainingData.indexes,
      indexPrefix: trainingData.collection.indexPrefixTitle
        ? `# ${trainingData.collection.name}`
        : undefined,
      embeddingModelId: vectorModel.id,
      teamId: String(trainingData.teamId),
      datasetId: String(trainingData.datasetId),
      collectionId: String(trainingData.collectionId),
      session
    });
    tokens = result.tokens;

    if (trainingData.collection?.hypeIndexes && global.feConfigs?.isPlus) {
      await MongoDatasetTraining.create(
        [
          {
            teamId: trainingData.teamId,
            tmbId: trainingData.tmbId,
            datasetId: trainingData.datasetId,
            collectionId: trainingData.collectionId,
            mode: TrainingModeEnum.hype,
            q: existingData.q,
            a: existingData.a || '',
            chunkIndex: trainingData.chunkIndex,
            dataId,
            retryCount: 5,
            billId: trainingData.billId
          }
        ],
        { session }
      );
    }

    await MongoDatasetTraining.deleteOne({ _id: trainingData._id }, { session });
  });
  await checkCollectionIndexingComplete(String(trainingData.collectionId), 'insert');
  return { tokens };
};
