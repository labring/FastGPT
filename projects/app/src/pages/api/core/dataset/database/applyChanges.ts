import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import {
  DatasetCollectionDataProcessModeEnum,
  DatasetCollectionTypeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { createTrainingUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { getEmbeddingModel } from '@fastgpt/service/core/ai/model';
import { addLog } from '@fastgpt/service/common/system/log';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { getI18nDatasetType } from '@fastgpt/service/support/user/audit/util';
import {
  createOneCollection,
  delCollection
} from '@fastgpt/service/core/dataset/collection/controller';
import type {
  DBTableChange,
  DBTableColumn,
  ApplyChangesBody,
  ApplyChangesResponse
} from '@fastgpt/global/core/dataset/database/api.d';
import { StatusEnum } from '@fastgpt/global/core/dataset/database/api.d';
import { TableTransformer } from '@fastgpt/service/core/dataset/database/model/dataModel';
import type { ColumnSchemaType, TableSchemaType } from '@fastgpt/global/core/dataset/type';

// Check if column forbid status is inconsistent between database and collection
function hasColumnForbidInconsistency(existingTable: any, newTable: DBTableChange): boolean {
  const existingColumns = existingTable?.tableSchema?.columns || {};
  const newColumns = newTable.columns;

  for (const [colName, newCol] of Object.entries(newColumns) as [string, DBTableColumn][]) {
    const existingCol = existingColumns.get
      ? existingColumns.get(colName)
      : existingColumns[colName];
    if (existingCol && existingCol.forbid !== newCol.forbid) {
      return true;
    }
  }

  return false;
}

async function handler(req: ApiRequestProps<ApplyChangesBody, {}>): Promise<ApplyChangesResponse> {
  const { datasetId, tables }: { datasetId: string; tables: Array<DBTableChange> } = req.body;

  // 权限验证
  const { teamId, tmbId, dataset } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId,
    per: WritePermissionVal
  });

  let deletedTables = 0;
  let updatedTables = 0;
  let addedTables = 0;
  let affectedDataRecords = 0;
  const errors: Array<{
    type: 'table' | 'column' | 'data';
    target: string;
    error: string;
  }> = [];

  try {
    await mongoSessionRun(async (session) => {
      // Get existing collections for this dataset
      const mongoCollections = await MongoDatasetCollection.find({
        datasetId,
        type: DatasetCollectionTypeEnum.table
      }).session(session);

      // Create a map for quick lookup
      const mongoCollectionsMap = new Map<string, any>();
      mongoCollections.forEach((coll) => {
        if (coll.tableSchema?.tableName) {
          mongoCollectionsMap.set(coll.tableSchema.tableName, coll);
        }
      });

      // Delete tables which in mongo but not in tables
      const collectionsToDelete = mongoCollections.filter(
        (mongoCollection) =>
          !tables.some((table) => table.tableName === mongoCollection.tableSchema!.tableName)
      );
      if (collectionsToDelete.length > 0) {
        await delCollection({
          collections: collectionsToDelete,
          delImg: true,
          delFile: true,
          session
        });
        deletedTables = collectionsToDelete.length;
      }
      // 按照每个表的状态进行处理
      for (const table of tables) {
        try {
          switch (table.status) {
            case StatusEnum.add: {
              // Create new collection and training task
              const [collection] = await MongoDatasetCollection.create(
                [
                  {
                    teamId,
                    tmbId,
                    datasetId,
                    parentId: null,
                    type: DatasetCollectionTypeEnum.table,
                    name: table.tableName,
                    forbid: table.forbid,
                    tableSchema: TableTransformer.toPlainObject(
                      TableTransformer.fromPlainObject(table),
                      { exist: true, lastUpdated: new Date() }
                    ) as TableSchemaType
                  }
                ],
                { session }
              );

              // Create training usage record
              const { billId } = await createTrainingUsage({
                teamId,
                tmbId,
                appName: table.tableName,
                billSource: UsageSourceEnum.training,
                vectorModel: getEmbeddingModel(dataset.vectorModel)?.name,
                session
              });

              // Create training task
              await MongoDatasetTraining.create(
                [
                  {
                    teamId,
                    tmbId,
                    datasetId,
                    collectionId: collection._id,
                    billId,
                    mode: TrainingModeEnum.databaseSchema,
                    retryCount: 5
                  }
                ],
                { session }
              );

              addedTables++;
              break;
            }
            case StatusEnum.available: {
              // Check if table needs re-indexing
              const intersectCollection = mongoCollectionsMap.get(table.tableName);
              console.debug('intersectCollection', intersectCollection);
              if (intersectCollection) {
                let needsReindex = false;

                // Check table description change
                if (intersectCollection.tableSchema?.description !== table.description) {
                  console.debug(
                    'table description change',
                    intersectCollection.tableSchema?.description,
                    table.description
                  );
                  needsReindex = true;
                }

                // Check column description changes
                const intersectColumns =
                  (intersectCollection.tableSchema?.columns as Record<string, ColumnSchemaType>) ||
                  {};
                for (const [colName, newCol] of Object.entries(table.columns) as [
                  string,
                  DBTableColumn
                ][]) {
                  const intersectCol = intersectColumns[colName];
                  if (intersectCol && intersectCol.description !== newCol.description) {
                    needsReindex = true;
                    break;
                  } else if (intersectCol && intersectCol.isPrimaryKey !== newCol.isPrimaryKey) {
                    needsReindex = true;
                    break;
                  } else if (intersectCol && intersectCol.isForeignKey !== newCol.isForeignKey) {
                    needsReindex = true;
                    break;
                  }
                }

                // Check for added/deleted columns
                const intersectColNames = new Set(Object.keys(intersectColumns));
                const newColNames = new Set(Object.keys(table.columns));

                if (
                  intersectColNames.size !== newColNames.size ||
                  [...intersectColNames].some((name) => !newColNames.has(name)) ||
                  [...newColNames].some((name) => !intersectColNames.has(name))
                ) {
                  needsReindex = true;
                }

                // Check column forbid status inconsistency
                if (hasColumnForbidInconsistency(intersectCollection, table)) {
                  needsReindex = true;
                }
                console.debug('needsReindex', needsReindex);
                if (needsReindex) {
                  // Delete collection
                  await delCollection({
                    collections: [intersectCollection],
                    delImg: true,
                    delFile: true,
                    session
                  });
                  console.debug('Delete collection', intersectCollection);
                  const collection = await createOneCollection({
                    teamId,
                    tmbId,
                    datasetId,
                    parentId: undefined,
                    type: DatasetCollectionTypeEnum.table,
                    name: table.tableName,
                    trainingType: DatasetCollectionDataProcessModeEnum.databaseSchema,
                    tableSchema: TableTransformer.toPlainObject(
                      TableTransformer.fromPlainObject(table),
                      { exist: true, lastUpdated: new Date() }
                    ) as TableSchemaType,
                    forbid: table.forbid,
                    session
                  });
                  // Create new training task
                  const { billId } = await createTrainingUsage({
                    teamId,
                    tmbId,
                    appName: table.tableName,
                    billSource: UsageSourceEnum.training,
                    vectorModel: getEmbeddingModel(dataset.vectorModel)?.name,
                    session
                  });
                  console.debug('Apply Changed Rebuilding');
                  await MongoDatasetTraining.create(
                    [
                      {
                        teamId,
                        tmbId,
                        datasetId,
                        collectionId: collection._id,
                        billId,
                        mode: TrainingModeEnum.databaseSchema,
                        retryCount: 5
                      }
                    ],
                    { session }
                  );

                  updatedTables++;
                }
              }
              break;
            }
          }
        } catch (tableError: any) {
          addLog.error(`Error processing table ${table.tableName}`, tableError);
          errors.push({
            type: 'table',
            target: table.tableName,
            error: tableError.message || 'Unknown error'
          });
        }
      }
    });

    // Audit log
    (async () => {
      addAuditLog({
        tmbId,
        teamId,
        event: AuditEventEnum.UPDATE_COLLECTION,
        params: {
          collectionName: 'Database Schema Update',
          datasetName: dataset.name,
          datasetType: getI18nDatasetType(dataset.type || '')
        }
      });
    })();

    return {
      success: true,
      processedItems: {
        deletedTables,
        updatedTables,
        addedTables,
        affectedDataRecords
      },
      errors,
      taskId: undefined // Could be populated with a batch task ID if needed
    };
  } catch (err: any) {
    addLog.error('Failed to apply database changes', err);
    return {
      success: false,
      processedItems: {
        deletedTables,
        updatedTables,
        addedTables,
        affectedDataRecords
      },
      errors: [
        {
          type: 'data',
          target: 'dataset',
          error: err.message || 'Failed to apply database changes'
        }
      ],
      taskId: undefined
    };
  }
}

export default NextAPI(handler);
