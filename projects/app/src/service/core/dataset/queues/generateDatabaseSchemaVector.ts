import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import { pushGenerateVectorUsage } from '@/service/support/wallet/usage/push';
import { checkTeamAiPointsAndLock } from './utils';
import {
  markIndexingStart,
  markDataTrainingPhaseTrace
} from '@fastgpt/service/core/dataset/training/utils';
import { addMinutes } from 'date-fns';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import {
  insertCoulmnDescriptionVector,
  insertColumnValueVector,
  deleteDatasetDataVector
} from '@fastgpt/service/common/vectorDB/controller';
import {
  DBDatasetVectorTableName,
  DBDatasetValueVectorTableName
} from '@fastgpt/service/common/vectorDB/constants';
import { getEmbeddingModelById } from '@fastgpt/service/core/ai/model';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { getErrText } from '@fastgpt/global/common/error/utils';
import type {
  ColumnSchemaType,
  DatasetTrainingSchemaType,
  DatasetDataSchemaType
} from '@fastgpt/global/core/dataset/type';
import { retryFn } from '@fastgpt/global/common/system/utils';
import { delay } from '@fastgpt/service/common/bullmq';

import { truncateText } from '@fastgpt/service/core/dataset/database/model/utils';
import { pushCollectionUpdateJob } from '@fastgpt/service/core/dataset/collection/mq';

const MAX_EMBEDDING_STRING_LENGTH = 1024;

const logger = getLogger(LogCategories.MODULE.DATASET.DATABASE_SCHEMA);

const reduceQueue = () => {
  global.vectorQueueLen = global.vectorQueueLen > 0 ? global.vectorQueueLen - 1 : 0;

  return global.vectorQueueLen === 0;
};

type PopulateType = {
  dataset: { vectorModelId: string };
  collection: { tableSchema?: any; indexingStartTime?: Date };
};

type TrainingDataType = DatasetTrainingSchemaType & PopulateType;

/* 数据库结构索引生成队列 */
export async function generateDatabaseSchemaEmbedding(): Promise<any> {
  const max = global.systemEnv?.vectorMaxProcess || 10;
  logger.debug('DB Schema queue size check', { queueSize: global.vectorQueueLen });

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
              mode: TrainingModeEnum.databaseSchema,
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
                select: 'tableSchema indexingStartTime'
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
        logger.error('DB Schema queue fetch task failed', { error });
        await delay(500);
        continue;
      }

      if (!data.dataset || !data.collection) {
        logger.info('DB Schema queue task skipped: dataset or collection missing', {
          datasetId: data.datasetId,
          collectionId: data.collectionId,
          trainingId: data._id
        });
        await MongoDatasetTraining.deleteOne({ _id: data._id });
        pushCollectionUpdateJob({
          collectionId: String(data.collectionId),
          datasetId: String(data.datasetId),
          teamId: String(data.teamId)
        });
        continue;
      }

      if (!(await checkTeamAiPointsAndLock(data.teamId))) {
        await MongoDatasetTraining.updateOne(
          { _id: data._id },
          { $set: { retryCount: 0, errorMsg: getErrText(DatasetErrEnum.insufficientQuota) } }
        );
        pushCollectionUpdateJob({
          collectionId: String(data.collectionId),
          datasetId: String(data.datasetId),
          teamId: String(data.teamId)
        });
        continue;
      }

      logger.info('DB Schema queue task started', {
        trainingId: data._id,
        datasetId: data.datasetId,
        collectionId: data.collectionId,
        teamId: data.teamId,
        tmbId: data.tmbId
      });

      const phaseStartTime = data.collection?.indexingStartTime || new Date();
      await markIndexingStart({
        collectionId: String(data.collectionId),
        startTime: phaseStartTime
      });

      try {
        const { tokens } = await (async () => {
          if (data.dataId) {
            return rebuildData({ trainingData: data, phaseStartTime });
          } else {
            return insertData({ trainingData: data, phaseStartTime });
          }
        })();

        pushCollectionUpdateJob({
          collectionId: String(data.collectionId),
          datasetId: String(data.datasetId),
          teamId: String(data.teamId)
        });

        // push usage
        pushGenerateVectorUsage({
          teamId: data.teamId,
          tmbId: data.tmbId,
          inputTokens: tokens,
          modelId: data.dataset.vectorModelId,
          usageId: data.billId
        });

        logger.info('DB Schema queue task finished', {
          durationMs: Date.now() - start
        });
      } catch (err: any) {
        logger.error('DB Schema queue task failed', {
          error: err,
          trainingId: data._id,
          datasetId: data.datasetId,
          collectionId: data.collectionId
        });
        await MongoDatasetTraining.updateOne(
          {
            _id: data._id
          },
          {
            errorMsg: getErrText(err, 'unknown error')
          }
        );
        if (data.retryCount <= 1) {
          pushCollectionUpdateJob({
            collectionId: String(data.collectionId),
            datasetId: String(data.datasetId),
            teamId: String(data.teamId)
          });
        }
        await delay(100);
      }
    }
  } catch (error) {
    logger.error('DB Schema queue loop failed', { error });
  }
  if (reduceQueue()) {
    logger.info('DB Schema queue drained', { queueSize: global.vectorQueueLen });
  }
  logger.debug('DB Schema queue loop exit', { queueSize: global.vectorQueueLen });
}

const rebuildData = async ({
  trainingData,
  phaseStartTime
}: {
  trainingData: TrainingDataType;
  phaseStartTime: Date;
}) => {
  if (!trainingData.collection?.tableSchema) {
    await MongoDatasetTraining.deleteOne({ _id: trainingData._id });
    return Promise.reject('No table schema data');
  }

  await enqueueNextRebuildTraining(trainingData);

  const result = await mongoSessionRun(async (session) => {
    const { tokens } = await processDatabaseSchema({
      trainingData,
      session,
      isRebuild: true
    });

    await MongoDatasetTraining.deleteOne({ _id: trainingData._id }, { session });
    return { tokens };
  });

  if (trainingData.dataId) {
    await markDataTrainingPhaseTrace({
      dataId: String(trainingData.dataId),
      mode: TrainingModeEnum.databaseSchema,
      startTime: phaseStartTime
    });
  }

  return result;
};

const enqueueNextRebuildTraining = async (trainingData: TrainingDataType) => {
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
                mode: TrainingModeEnum.databaseSchema,
                dataId: newRebuildingData._id,
                retryCount: 50
              }
            ],
            { session, ordered: true }
          );
        }
      })
    );
  } catch (error) {
    logger.warn('DB Schema failed to enqueue next rebuild data', {
      datasetId: trainingData.datasetId,
      error
    });
  }
};

const insertData = async ({
  trainingData,
  phaseStartTime
}: {
  trainingData: TrainingDataType;
  phaseStartTime: Date;
}) => {
  const result = await mongoSessionRun(async (session) => {
    // Process database schema embedding
    const { tokens } = await processDatabaseSchema({
      trainingData,
      session,
      isRebuild: false
    });

    // delete data from training
    await MongoDatasetTraining.deleteOne({ _id: trainingData._id }, { session });

    return {
      tokens
    };
  });

  if (trainingData.dataId) {
    await markDataTrainingPhaseTrace({
      dataId: String(trainingData.dataId),
      mode: TrainingModeEnum.databaseSchema,
      startTime: phaseStartTime
    });
  }

  return result;
};

const processDatabaseSchema = async ({
  trainingData,
  session,
  isRebuild
}: {
  trainingData: TrainingDataType;
  session?: any;
  isRebuild: boolean;
}) => {
  const { collection, dataset, teamId, tmbId, datasetId, collectionId } = trainingData;

  if (!collection.tableSchema) {
    return Promise.reject('No table schema found');
  }

  const { tableName, columns } = collection.tableSchema;
  const model = getEmbeddingModelById(dataset.vectorModelId);
  let totalTokens = 0;

  if (isRebuild) {
    try {
      await Promise.all([
        deleteDatasetDataVector({
          teamId,
          datasetIds: [datasetId],
          collectionIds: [collectionId],
          tableName: DBDatasetVectorTableName
        }),
        deleteDatasetDataVector({
          teamId,
          datasetIds: [datasetId],
          collectionIds: [collectionId],
          tableName: DBDatasetValueVectorTableName
        })
      ]);
    } catch (error: any) {
      logger.warn('DB Schema failed to delete existing indexes', {
        collectionId,
        error
      });
    }

    await MongoDatasetData.deleteMany({ teamId, datasetId, collectionId }, { session });
  }

  const tableIndexes: DatasetDataSchemaType['indexes'] = [];
  let valueExampleCount = 0;
  const now = new Date();

  for (const [columnName, columnInfo] of Object.entries(
    columns as Record<string, ColumnSchemaType>
  )) {
    if (!columnInfo || typeof columnInfo !== 'object') {
      logger.warn('DB Schema invalid column info, skipping', { columnName });
      continue;
    }

    const columnDescription = `${columnName}:${columnInfo.description || ''}`;

    try {
      const columnDesResult = await insertCoulmnDescriptionVector({
        query: truncateText(columnDescription, MAX_EMBEDDING_STRING_LENGTH),
        model,
        teamId,
        datasetId,
        collectionId,
        column_des_index: `${tableName}<sep>${columnName}`
      });
      totalTokens += columnDesResult.tokens;

      const columnDesIndex = {
        type: DatasetDataIndexTypeEnum.column_des_index,
        dataId: columnDesResult.insertIds[0],
        text: truncateText(columnDescription, MAX_EMBEDDING_STRING_LENGTH)
      };
      tableIndexes.push(columnDesIndex);

      const valueIndexes =
        columnInfo.valueIndex && !columnInfo.forbid && Array.isArray(columnInfo.examples)
          ? await Promise.all(
              columnInfo.examples.map(async (example: string, index: number) => {
                const valueText = truncateText(
                  `${columnName}:${example}`,
                  MAX_EMBEDDING_STRING_LENGTH
                );
                const valueResult = await insertColumnValueVector({
                  query: valueText,
                  model,
                  teamId,
                  datasetId,
                  collectionId,
                  column_val_index: `${tableName}<sep>${columnName}<sep>example${index}`
                });
                totalTokens += valueResult.tokens;
                valueExampleCount++;
                return {
                  type: DatasetDataIndexTypeEnum.column_val_index,
                  dataId: valueResult.insertIds[0],
                  text: valueText
                };
              })
            )
          : [];

      await MongoDatasetData.create(
        [
          {
            teamId,
            tmbId,
            datasetId,
            collectionId,
            q: `${tableName}<sep>${columnName}`,
            a: `${columnName}<sep>${columnInfo.description || ''}`,
            indexes: [columnDesIndex, ...valueIndexes],
            chunkIndex: 0,
            history: [],
            updateTime: now,
            indexingCompleteTime: now
          }
        ],
        { session }
      );
    } catch (error: any) {
      const originalMsg = error?.message || 'Unknown error';
      logger.error('DB Schema column processing failed', {
        tableName,
        columnName,
        error
      });
      throw new Error(originalMsg);
    }
  }

  await MongoDatasetData.create(
    [
      {
        teamId,
        tmbId,
        datasetId,
        collectionId,
        q: tableName,
        a: collection.tableSchema.description
          ? `${tableName}<sep>${collection.tableSchema.description}`
          : tableName,
        indexes: tableIndexes,
        chunkIndex: 0,
        history: [],
        updateTime: now,
        indexingCompleteTime: now
      }
    ],
    { session }
  );

  logger.info('DB Schema table processed', {
    tableName,
    columnCount: tableIndexes.length,
    valueExampleCount
  });

  return { tokens: totalTokens };
};
