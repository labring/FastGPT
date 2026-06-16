import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import { pushGenerateVectorUsage } from '@/service/support/wallet/usage/push';
import { checkTeamAiPointsAndLock } from './utils';
import {
  markIndexingStart,
  markDataTrainingPhaseTrace
} from '@fastgpt/service/core/dataset/training/utils';
import { addMinutes } from 'date-fns';
import { pushCollectionUpdateJob } from '@fastgpt/service/core/dataset/collection/mq';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
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
  DatasetTrainingSchemaType
} from '@fastgpt/global/core/dataset/type';
import { retryFn } from '@fastgpt/global/common/system/utils';
import { delay } from '@fastgpt/service/common/bullmq';

import { truncateText } from '@fastgpt/service/core/dataset/database/model/utils';
// Database schema specific constants
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
        // Delete data
        await MongoDatasetTraining.deleteOne({ _id: data._id });
        continue;
      }

      // auth balance
      // NOTE: findOneAndUpdate has already locked this record. If balance check
      // fails we MUST delete it immediately, otherwise it stays locked for 3 min.
      if (!(await checkTeamAiPointsAndLock(data.teamId))) {
        await MongoDatasetTraining.deleteOne({ _id: data._id });
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

        // Directly set statsUpdatedAt so frontend immediately shows "ready" instead of "queued".
        // Must be synchronous (not via BullMQ) because the queue may not be available
        // in all deployments. The async pushCollectionUpdateJob below handles comprehensive stats.
        await MongoDatasetCollection.updateOne(
          { _id: data.collectionId },
          { $set: { statsUpdatedAt: new Date() } }
        );

        // Also trigger full stats recalculation via BullMQ
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
  // Note: For database schema mode, we don't need to check trainingData.data
  // as the data comes from collection.tableSchema
  if (!trainingData.collection?.tableSchema) {
    await MongoDatasetTraining.deleteOne({ _id: trainingData._id });
    return Promise.reject('No table schema data');
  }

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
  } catch (error) {}

  // Process database schema embedding
  const { tokens } = await processDatabaseSchema({
    trainingData,
    isRebuild: true
  });

  if (trainingData.dataId) {
    await markDataTrainingPhaseTrace({
      dataId: String(trainingData.dataId),
      mode: TrainingModeEnum.databaseSchema,
      startTime: phaseStartTime
    });
  }

  return { tokens };
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

  // If rebuilding, delete existing indexes first
  if (isRebuild) {
    try {
      // Delete table description indexes
      await deleteDatasetDataVector({
        teamId,
        datasetIds: [datasetId],
        collectionIds: [collectionId],
        tableName: DBDatasetVectorTableName
      });

      // Delete table value indexes
      await deleteDatasetDataVector({
        teamId,
        datasetIds: [datasetId],
        collectionIds: [collectionId],
        tableName: DBDatasetValueVectorTableName
      });
    } catch (error: any) {
      logger.warn('DB Schema failed to delete existing indexes', {
        collectionId,
        error
      });
    }
  }

  // Note: Table description embedding is not implemented yet per design requirements
  // Track column description results
  const columnDesResults: any[] = [];
  const valueIndexResults: any[] = [];

  // Process column descriptions and values (only for columns with valueIndex: true)
  for (const [columnName, columnInfo] of Object.entries(
    columns as Record<string, ColumnSchemaType>
  )) {
    // Validate column data
    if (!columnName || typeof columnName !== 'string') {
      logger.warn('DB Schema invalid column name, skipping', { columnName });
      continue;
    }

    if (!columnInfo || typeof columnInfo !== 'object') {
      logger.warn('DB Schema invalid column info, skipping', { columnName });
      continue;
    }

    const columnDescription = `${columnName}:${columnInfo.description || ''}`;
    const columnDesIndex = `${tableName}<sep>${columnName}`;

    try {
      // Insert column description
      const truncatedColumnDescription = truncateText(
        columnDescription,
        MAX_EMBEDDING_STRING_LENGTH
      );
      const columnDesResult = await insertCoulmnDescriptionVector({
        query: truncatedColumnDescription,
        model,
        teamId,
        datasetId,
        collectionId,
        column_des_index: columnDesIndex
      });
      columnDesResults.push({
        columnName,
        result: columnDesResult,
        desIndex: columnDesIndex,
        description: columnDescription
      });
      totalTokens += columnDesResult.tokens;

      // Insert column value examples (up to 3 examples)
      if (columnInfo.examples && Array.isArray(columnInfo.examples)) {
        if (!columnInfo.valueIndex || columnInfo.forbid) continue; // Skip if valueIndex is not true

        const valuePromises = columnInfo.examples.map(async (example: string, index: number) => {
          const valueIndex = `${tableName}<sep>${columnName}<sep>example${index}`;
          const valueText = truncateText(`${columnName}:${example}`, MAX_EMBEDDING_STRING_LENGTH);

          const valueResult = await insertColumnValueVector({
            query: valueText,
            model,
            teamId,
            datasetId,
            collectionId,
            column_val_index: valueIndex
          });

          return {
            columnName,
            index,
            result: valueResult,
            valIndex: valueIndex,
            text: valueText
          };
        });

        const valueResults = await Promise.all(valuePromises);
        valueIndexResults.push(...valueResults);
        const valueTokens = valueResults.reduce(
          (sum: number, result: any) => sum + (result.result.tokens || 0),
          0
        );
        totalTokens += valueTokens;
      }

      await MongoDatasetData.create(
        [
          {
            teamId,
            tmbId,
            datasetId,
            collectionId,
            q: `${tableName}<sep>${columnName}`,
            a: `${columnName}<sep>${columnInfo.description || ''}`,
            indexes: [
              {
                type: DatasetDataIndexTypeEnum.column_des_index,
                dataId: columnDesResult.insertIds[0],
                text: truncateText(
                  `${columnName}<sep>${columnInfo.description || ''}`,
                  MAX_EMBEDDING_STRING_LENGTH
                )
              },
              ...valueIndexResults.map(({ result, text }) => ({
                type: DatasetDataIndexTypeEnum.column_val_index,
                dataId: result.insertIds[0],
                text: text
              }))
            ],
            chunkIndex: 0,
            history: [],
            updateTime: new Date()
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

  // Update MongoDB data
  if (session && !isRebuild) {
    try {
      const indexes: any[] = [];

      // Note: Table description index is not implemented yet
      // indexes.push({
      //   type: DatasetDataIndexTypeEnum.column_des_index,
      //   dataId: tableDesResult.insertId,
      //   text: tableDescription
      // });

      // Column description indexes
      columnDesResults.forEach(({ result, desIndex, description }) => {
        indexes.push({
          type: DatasetDataIndexTypeEnum.column_des_index,
          dataId: result.insertIds[0],
          text: truncateText(description, MAX_EMBEDDING_STRING_LENGTH)
        });
      });

      // Create dataset_data record
      const q = `${tableName}`;
      const a = collection.tableSchema.description
        ? `${tableName}<sep>${collection.tableSchema.description}`
        : tableName;

      await MongoDatasetData.create(
        [
          {
            teamId,
            tmbId,
            datasetId,
            collectionId,
            q,
            a,
            indexes,
            chunkIndex: 0,
            history: [],
            updateTime: new Date()
          }
        ],
        { session }
      );
    } catch (error) {
      logger.error('DB Schema failed to create MongoDB dataset data', { error });
      throw error;
    }
  }

  logger.info('DB Schema table processed', {
    tableName,
    columnCount: columnDesResults.length,
    valueExampleCount: valueIndexResults.length
  });

  return { tokens: totalTokens };
};
