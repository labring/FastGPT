import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import { pushGenerateVectorUsage } from '@/service/support/wallet/usage/push';
import { checkTeamAiPointsAndLock } from './utils';
import { addMinutes } from 'date-fns';
import { addLog } from '@fastgpt/service/common/system/log';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import {
  insertCoulmnDescriptionVector,
  insertTableValueVector,
  deleteDatasetDataVector
} from '@fastgpt/service/common/vectorDB/controller';
import {
  DBDatasetVectorTableName,
  DBDatasetValueVectorTableName
} from '@fastgpt/service/common/vectorDB/constants';
import { getEmbeddingModel } from '@fastgpt/service/core/ai/model';
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

const reduceQueue = () => {
  global.vectorQueueLen = global.vectorQueueLen > 0 ? global.vectorQueueLen - 1 : 0;

  return global.vectorQueueLen === 0;
};

type PopulateType = {
  dataset: { vectorModel: string };
  collection: { tableSchema?: any };
};

type TrainingDataType = DatasetTrainingSchemaType & PopulateType;

/* 数据库结构索引生成队列 */
export async function generateDatabaseSchemaEmbedding(): Promise<any> {
  const max = global.systemEnv?.vectorMaxProcess || 10;
  addLog.debug(`[DB Schema Queue] Queue size: ${global.vectorQueueLen}`);

  if (global.vectorQueueLen >= max) return;
  global.vectorQueueLen++;

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
              select: 'vectorModel'
            },
            {
              path: 'collection',
              select: 'tableSchema'
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
      addLog.error(`[DB Schema Queue] Error`, error);
      await delay(500);
      continue;
    }

    if (!data.dataset || !data.collection) {
      addLog.info(`[DB Schema Queue] Dataset or collection not found`, data);
      // Delete data
      await MongoDatasetTraining.deleteOne({ _id: data._id });
      continue;
    }

    // auth balance
    if (!(await checkTeamAiPointsAndLock(data.teamId))) {
      continue;
    }

    addLog.info(`[DB Schema Queue] Start`);

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
        billId: data.billId
      });

      addLog.info(`[DB Schema Queue] Finish`, {
        time: Date.now() - start
      });
    } catch (err: any) {
      addLog.error(`[DB Schema Queue] Error`, err);
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

  if (reduceQueue()) {
    addLog.info(`[DB Schema Queue] Done`);
  }
  addLog.debug(`[DB Schema Queue] break loop, current queue size: ${global.vectorQueueLen}`);
}

const rebuildData = async ({ trainingData }: { trainingData: TrainingDataType }) => {
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

  return { tokens };
};

const insertData = async ({ trainingData }: { trainingData: TrainingDataType }) => {
  return mongoSessionRun(async (session) => {
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
  const model = getEmbeddingModel(dataset.vectorModel);
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
      addLog.warn(
        `[DB Schema] Failed to delete existing indexes for collection ${collectionId}`,
        error
      );
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
      addLog.warn(`[DB Schema] Invalid column name: ${columnName}, skipping`);
      continue;
    }

    if (!columnInfo || typeof columnInfo !== 'object') {
      addLog.warn(`[DB Schema] Invalid column info for ${columnName}, skipping`);
      continue;
    }

    const columnDescription = `${columnName}:${columnInfo.description || ''}`;
    const columnDesIndex = `${tableName}<sep>${columnName}`;

    try {
      // Insert column description
      const truncatedColumnDescription = truncateText(columnDescription);
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

        const valuePromises = columnInfo.examples
          .slice(0, 3)
          .map(async (example: string, index: number) => {
            const valueIndex = `${tableName}<sep>${columnName}<sep>exam${index}`;
            const valueText = truncateText(`${columnName}:${example}`);

            const valueResult = await insertTableValueVector({
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
                text: truncateText(`${columnName}<sep>${columnInfo.description || ''}`)
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
    } catch (error) {
      addLog.error(`[DB Schema] Failed to process column ${columnName}`, error);
      continue;
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
          text: truncateText(description)
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
      addLog.error(`[DB Schema] Failed to create MongoDB dataset data`, error);
      throw error;
    }
  }

  addLog.info(
    `[DB Schema] Processed table ${tableName} with ${columnDesResults.length} columns and ${valueIndexResults.length} value examples`
  );

  return { tokens: totalTokens };
};
