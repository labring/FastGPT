import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
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
import type { ColumnStatusEnum } from './detectChanges';
import { TableStatusEnum } from './detectChanges';
import {
  createOneCollection,
  delCollection
} from '@fastgpt/service/core/dataset/collection/controller';

export type TableColumn = {
  columnName: string;
  columnType: string;
  description: string;
  examples: string[];
  status: ColumnStatusEnum;
  forbid: boolean;
  valueIndex: boolean;
};

export type DBTableProp = {
  tableName: string;
  description: string;
  forbid: boolean;
  columns: Record<string, TableColumn>;
  foreignKeys?: Array<{
    constrainedColumns: string[];
    referredSchema: string | null;
    referredTable: string;
    referredColumns: string[];
  }>;
  primaryKeys?: string[];
  status: TableStatusEnum;
};

export type ApplyChangesQuery = {
  datasetId: string;
};

export type ApplyChangesBody = {
  tables: Array<DBTableProp>;
};

export type ApplyChangesResponse = {
  success: boolean;
  processedItems: {
    deletedTables: number;
    updatedTables: number;
    addedTables: number;
    affectedDataRecords: number;
  };
  errors: Array<{
    type: 'table' | 'column' | 'data';
    target: string;
    error: string;
  }>;
  taskId?: string;
};

// Check if column forbid status is inconsistent between database and collection
function hasColumnForbidInconsistency(existingTable: any, newTable: DBTableProp): boolean {
  const existingColumns = existingTable?.tableSchema?.columns || {};
  const newColumns = newTable.columns;

  for (const [colName, newCol] of Object.entries(newColumns)) {
    const existingCol = existingColumns.get
      ? existingColumns.get(colName)
      : existingColumns[colName];
    if (existingCol && existingCol.forbid !== newCol.forbid) {
      return true;
    }
  }

  return false;
}

async function handler(
  req: ApiRequestProps<ApplyChangesBody, ApplyChangesQuery>
): Promise<ApplyChangesResponse> {
  const { datasetId } = req.query;
  const { tables } = req.body;

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
      const existingCollections = await MongoDatasetCollection.find({
        datasetId,
        type: DatasetCollectionTypeEnum.table
      }).session(session);

      // Create a map for quick lookup
      const existingCollectionsMap = new Map<string, any>();
      existingCollections.forEach((coll) => {
        if (coll.tableSchema?.tableName) {
          existingCollectionsMap.set(coll.tableSchema.tableName, coll);
        }
      });

      // Process each table according to its status
      for (const table of tables) {
        try {
          switch (table.status) {
            case TableStatusEnum.add: {
              // Create new collection and training task
              if (table.forbid) continue; // Skip forbidden tables

              const collection = await MongoDatasetCollection.create(
                [
                  {
                    teamId,
                    tmbId,
                    datasetId,
                    parentId: null,
                    type: DatasetCollectionTypeEnum.table,
                    name: table.tableName,
                    forbid: table.forbid,
                    tableSchema: {
                      tableName: table.tableName,
                      description: table.description,
                      columns: new Map(
                        Object.entries(table.columns).map(([name, col]) => [
                          name,
                          {
                            columnName: col.columnName,
                            columnType: col.columnType,
                            description: col.description,
                            examples: col.examples,
                            forbid: col.forbid,
                            valueIndex: col.valueIndex,
                            isNullable: true,
                            isAutoIncrement: false,
                            isPrimaryKey: false,
                            isForeignKey: false,
                            relatedColumns: [],
                            metadata: {}
                          }
                        ])
                      ),
                      foreignKeys: [],
                      primaryKeys: [],
                      indexes: [],
                      constraints: [],
                      lastUpdated: new Date()
                    }
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
                    collectionId: collection[0]._id,
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

            case TableStatusEnum.delete: {
              // Delete collection and related data
              const existingCollection = existingCollectionsMap.get(table.tableName);
              if (existingCollection) {
                // Delete collection
                await mongoSessionRun((session) =>
                  delCollection({
                    collections: [existingCollection],
                    delImg: true,
                    delFile: true,
                    session
                  })
                );
                // Delete related training data
                await MongoDatasetTraining.deleteMany(
                  { collectionId: existingCollection._id },
                  { session }
                );
                deletedTables++;
              }
              break;
            }

            case TableStatusEnum.available: {
              // Check if table needs re-indexing
              const existingCollection = existingCollectionsMap.get(table.tableName);
              if (existingCollection) {
                let needsReindex = false;

                // Check table description change
                if (existingCollection.tableSchema?.description !== table.description) {
                  needsReindex = true;
                }

                // Check column description changes
                const existingColumns = existingCollection.tableSchema?.columns || {};
                for (const [colName, newCol] of Object.entries(table.columns)) {
                  const existingCol = existingColumns.get
                    ? existingColumns.get(colName)
                    : existingColumns[colName];
                  if (existingCol && existingCol.description !== newCol.description) {
                    needsReindex = true;
                    break;
                  }
                }

                // Check for added/deleted columns
                const existingColNames = new Set(Object.keys(existingColumns));
                const newColNames = new Set(Object.keys(table.columns));

                if (
                  existingColNames.size !== newColNames.size ||
                  [...existingColNames].some((name) => !newColNames.has(name)) ||
                  [...newColNames].some((name) => !existingColNames.has(name))
                ) {
                  needsReindex = true;
                }

                // Check column forbid status inconsistency
                if (hasColumnForbidInconsistency(existingCollection, table)) {
                  needsReindex = true;
                }

                if (needsReindex) {
                  // Delete collection
                  await mongoSessionRun((session) =>
                    delCollection({
                      collections: [existingCollection],
                      delImg: true,
                      delFile: true,
                      session
                    })
                  );

                  const collection = await createOneCollection({
                    teamId,
                    tmbId,
                    datasetId,
                    parentId: undefined,
                    type: DatasetCollectionTypeEnum.table,
                    name: table.tableName,
                    trainingType: DatasetCollectionDataProcessModeEnum.databaseSchema,
                    tableSchema: {
                      tableName: table.tableName,
                      description: table.description,
                      columns: Object.fromEntries(
                        Object.entries(table.columns).map(([name, col]) => [
                          name,
                          {
                            columnName: col.columnName,
                            columnType: col.columnType,
                            description: col.description,
                            examples: col.examples,
                            forbid: col.forbid,
                            valueIndex: col.valueIndex,
                            isPrimaryKey: table.primaryKeys?.includes(name) || false,
                            isForeignKey:
                              table.foreignKeys?.some((fk) =>
                                fk.constrainedColumns.includes(name)
                              ) || false,
                            relatedColumns: [],
                            metadata: {}
                          }
                        ])
                      ),
                      foreignKeys: table.foreignKeys || [],
                      primaryKeys: table.primaryKeys || [],
                      indexes: [],
                      constraints: [],
                      lastUpdated: new Date()
                    },
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

    addLog.info(
      `Successfully processed database changes for dataset ${datasetId}: ${addedTables} added, ${deletedTables} deleted, ${updatedTables} updated`
    );

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
