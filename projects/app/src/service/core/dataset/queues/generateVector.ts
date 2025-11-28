import { insertData2Dataset } from '@/service/core/dataset/data/controller';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { pushGenerateVectorUsage } from '@/service/support/wallet/usage/push';
import { checkTeamAiPointsAndLock } from './utils';
import { addMinutes } from 'date-fns';
import { addLog } from '@fastgpt/service/common/system/log';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import {
  deleteDatasetDataVector,
  insertDatasetDataVector
} from '@fastgpt/service/common/vectorDB/controller';
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

const reduceQueue = () => {
  global.vectorQueueLen = global.vectorQueueLen > 0 ? global.vectorQueueLen - 1 : 0;

  return global.vectorQueueLen === 0;
};

type PopulateType = {
  dataset: { vectorModel: string };
  collection: { name: string; indexPrefixTitle: boolean; hypeIndexes: boolean };
  data: { _id: string; q: string; a: string; indexes: DatasetDataSchemaType['indexes'] };
};
type TrainingDataType = DatasetTrainingSchemaType & PopulateType;

/* 索引生成队列。每导入一次，就是一个单独的线程 */
export async function generateVector(): Promise<any> {
  const max = global.systemEnv?.vectorMaxProcess || 10;
  addLog.debug(`[Vector Queue] Queue size: ${global.vectorQueueLen}`);

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
                select: 'vectorModel'
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
        addLog.error(`[Vector Queue] Error`, error);
        await delay(500);
        continue;
      }

      if (!data.dataset || !data.collection) {
        addLog.info(`[Vector Queue] Dataset or collection not found`, data);
        // Delete data
        await MongoDatasetTraining.deleteOne({ _id: data._id });
        continue;
      }

      // auth balance
      if (!(await checkTeamAiPointsAndLock(data.teamId))) {
        continue;
      }

      addLog.info(`[Vector Queue] Start`);

      try {
        const { tokens } = await (async () => {
          // Route to different processors based on mode
          if (data.mode === TrainingModeEnum.chunk && data.dataId && data.data) {
            return rebuildData({ trainingData: data });
          } else if (data.mode === TrainingModeEnum.chunk && !data.dataId) {
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
          model: data.dataset.vectorModel,
          billId: data.billId
        });

        addLog.info(`[Vector Queue] Finish`, {
          time: Date.now() - start
        });
      } catch (err: any) {
        addLog.error(`[Vector Queue] Error`, err);
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
    addLog.error(`[Vector Queue] Error`, error);
  }

  if (reduceQueue()) {
    addLog.info(`[Vector Queue] Done`);
  }
  addLog.debug(`[Vector Queue] break loop, current queue size: ${global.vectorQueueLen}`);
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
    model: getEmbeddingModel(trainingData.dataset.vectorModel),
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
          indexes: trainingData.data.indexes
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

  return { tokens: insertResult.tokens };
};

const insertData = async ({ trainingData }: { trainingData: TrainingDataType }) => {
  return mongoSessionRun(async (session) => {
    // insert new data to dataset
    const { tokens, insertId } = await insertData2Dataset({
      id: trainingData.dataId,
      teamId: trainingData.teamId,
      tmbId: trainingData.tmbId,
      datasetId: trainingData.datasetId,
      collectionId: trainingData.collectionId,
      q: trainingData.q,
      a: trainingData.a,
      imageId: trainingData.imageId,
      imageDescMap: trainingData.imageDescMap,
      chunkIndex: trainingData.chunkIndex,
      indexSize:
        trainingData.indexSize ||
        getMaxIndexSize(getEmbeddingModel(trainingData.dataset.vectorModel)),
      indexes: trainingData.indexes,
      metadata: trainingData.dataMetadata,
      indexPrefix: trainingData.collection.indexPrefixTitle
        ? `# ${trainingData.collection.name}`
        : undefined,
      embeddingModel: trainingData.dataset.vectorModel,
      session
    });

    // ========== Check if Hype index enhancement is needed ==========
    if (trainingData.collection?.hypeIndexes && global.feConfigs?.isPlus) {
      // Vector is completed, now we can safely push Hype task
      addLog.info(`[Vector Queue] Pushing Hype task for data: ${insertId}`);
      await MongoDatasetTraining.create(
        [
          {
            teamId: trainingData.teamId,
            tmbId: trainingData.tmbId,
            datasetId: trainingData.datasetId,
            collectionId: trainingData.collectionId,
            mode: TrainingModeEnum.hype,
            q: trainingData.q,
            a: trainingData.a || '',
            chunkIndex: trainingData.chunkIndex,
            dataId: insertId, // MongoDatasetData._id for later appending indexes
            retryCount: 5,
            billId: trainingData.billId
          }
        ],
        { session }
      );
    }

    // delete data from training
    await MongoDatasetTraining.deleteOne({ _id: trainingData._id }, { session });

    return {
      tokens
    };
  });
};
