import type { NextApiRequest } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { withDatabaseClient } from '@fastgpt/service/core/dataset/database/clientManager';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { DatabaseErrEnum } from '@fastgpt/global/common/error/code/database';
import type {
  DetectChangesQuery,
  DetectChangesResponse,
  DBTableChange,
  DBTableColumn
} from '@fastgpt/global/core/dataset/database/api.d';
import { StatusEnum } from '@fastgpt/global/core/dataset/database/api.d';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { i18nT } from '@fastgpt/web/i18n/utils';
import { addLog } from '@fastgpt/service/common/system/log';

async function handler(
  req: ApiRequestProps<{}, DetectChangesQuery>
): Promise<DetectChangesResponse> {
  const { datasetId } = req.query;

  // 权限验证
  const { dataset } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId,
    per: ReadPermissionVal
  });

  if (!dataset.databaseConfig) {
    return Promise.reject(DatabaseErrEnum.dbConfigNotFound);
  }

  try {
    const startTime = Date.now();

    return await mongoSessionRun(async (session) => {
      const result = await withDatabaseClient(datasetId, async (dbClient) => {
        const perfMarks: Record<string, number> = {};

        // Step 1: 初始化数据库schema
        await dbClient.init_db_schema();
        perfMarks['init_schema'] = Date.now() - startTime;

        // Step 2: 获取所有表名
        const databaseTableNames = await dbClient.get_all_table_names();
        perfMarks['get_table_names'] = Date.now() - startTime;

        // Step 3: 获取 MongoDB 中的表配置
        const mongoCollections = await MongoDatasetCollection.find({
          datasetId,
          type: DatasetCollectionTypeEnum.table
        }).lean();
        perfMarks['fetch_mongo'] = Date.now() - startTime;

        // 构建已存在表的映射
        const mongoTablesMap = new Map<string, any>();
        mongoCollections.forEach((coll) => {
          if (coll.tableSchema?.tableName) {
            mongoTablesMap.set(coll.tableSchema.tableName, coll.tableSchema);
          }
        });

        const tables: DBTableChange[] = [];
        let addedTables = 0;
        let deletedTables = 0;
        let modifiedTables = 0;
        let addedColumns = 0;
        let deletedColumns = 0;

        // Step 4: 处理已删除的表 (批量更新优化)
        const bulkDeleteOps: any[] = [];
        mongoTablesMap.forEach((mongoTable, tableName) => {
          if (!databaseTableNames.includes(tableName)) {
            tables.push({ ...mongoTable, status: StatusEnum.delete });
            deletedTables++;
            bulkDeleteOps.push({
              updateOne: {
                filter: { 'tableSchema._id': mongoTable._id },
                update: {
                  $set: {
                    'tableSchema.exist': false,
                    'tableSchema.lastUpdated': new Date(),
                    'tableSchema.forbid': true
                  }
                }
              }
            });
          }
        });

        if (bulkDeleteOps.length > 0) {
          await MongoDatasetCollection.bulkWrite(bulkDeleteOps, { session });
        }
        perfMarks['process_deleted'] = Date.now() - startTime;

        const tableInfoResults = await Promise.allSettled(
          databaseTableNames.map(async (tableName) => {
            const isNew = !mongoTablesMap.has(tableName);
            const tableInfo = await dbClient.get_table_info(tableName, isNew);
            return {
              tableName,
              tableInfo,
              isNew,
              mongoTable: mongoTablesMap.get(tableName)
            };
          })
        );
        perfMarks['fetch_table_info'] = Date.now() - startTime;

        // Step 6: 处理获取到的表信息
        const bulkUpdateOps: any[] = [];

        for (const result of tableInfoResults) {
          if (result.status === 'rejected') {
            addLog.error(`[detectChanges] Failed to fetch table info: ${result.reason}`);
            continue;
          }

          const { tableInfo, isNew, mongoTable } = result.value;

          if (isNew) {
            // 新增的表
            const columnsObj: Record<string, DBTableColumn> = {};
            Object.entries(tableInfo.columns).forEach(([key, value]) => {
              columnsObj[key] = {
                ...value,
                status: StatusEnum.add
              };
              addedColumns++;
            });

            tables.push({
              tableName: tableInfo.tableName,
              description: tableInfo.description || '',
              forbid: false,
              columns: columnsObj,
              foreignKeys: tableInfo.foreignKeys || [],
              primaryKeys: tableInfo.primaryKeys || [],
              constraints: tableInfo.constraints || [],
              status: StatusEnum.add
            });
            addedTables++;
          } else {
            // 检查现有表的变更
            const columnsObj: Record<string, DBTableColumn> = {};
            let tableModified = false;

            const mongoColumns = mongoTable.columns || {};
            const databaseColumns = tableInfo.columns;

            // 标记删除的列
            Object.keys(mongoColumns).forEach((columnName) => {
              if (!databaseColumns[columnName]) {
                columnsObj[columnName] = {
                  ...mongoColumns[columnName],
                  status: StatusEnum.delete
                };
                deletedColumns++;
                tableModified = true;
              }
            });

            // 检查新增和现有的列
            Object.entries(databaseColumns).forEach(([columnName, columnInfo]) => {
              const mongoColumn = mongoColumns[columnName];
              if (
                !mongoColumn ||
                mongoColumn.defaultValue !== columnInfo.defaultValue ||
                mongoColumn.isNullable !== columnInfo.isNullable ||
                mongoColumn.isAutoIncrement !== columnInfo.isAutoIncrement ||
                mongoColumn.isPrimaryKey !== columnInfo.isPrimaryKey ||
                mongoColumn.isForeignKey !== columnInfo.isForeignKey
              ) {
                // 新增的列或有变化的列
                columnsObj[columnName] = {
                  ...columnInfo,
                  status: StatusEnum.add
                };
                addedColumns++;
                tableModified = true;
              } else {
                // 现有的列
                columnsObj[columnName] = {
                  ...mongoColumns[columnName],
                  columnType: String(columnInfo.columnType),
                  status: StatusEnum.available
                };
              }
            });

            if (tableModified) {
              tables.push({
                tableName: tableInfo.tableName,
                description: mongoTable.description || '',
                forbid: mongoTable.forbid ?? false,
                columns: columnsObj,
                foreignKeys: tableInfo.foreignKeys || [],
                primaryKeys: tableInfo.primaryKeys || [],
                constraints: tableInfo.constraints || [],
                status: StatusEnum.available
              });
              modifiedTables++;
            } else {
              tables.push({
                tableName: mongoTable.tableName,
                description: mongoTable.description || '',
                forbid: mongoTable.forbid ?? false,
                columns: columnsObj,
                foreignKeys: mongoTable.foreignKeys || [],
                primaryKeys: mongoTable.primaryKeys || [],
                constraints: mongoTable.constraints || [],
                status: StatusEnum.available
              });

              // 标记为已存在的表 (批量更新)
              bulkUpdateOps.push({
                updateOne: {
                  filter: { 'tableSchema._id': mongoTable._id },
                  update: {
                    $set: {
                      'tableSchema.exist': true,
                      'tableSchema.lastUpdated': new Date(),
                      'tableSchema.forbid': false
                    }
                  }
                }
              });
            }
          }
        }

        // Step 7: 批量更新未变更的表
        if (bulkUpdateOps.length > 0) {
          await MongoDatasetCollection.bulkWrite(bulkUpdateOps, { session });
        }
        perfMarks['process_updates'] = Date.now() - startTime;

        const hasChanges = addedTables > 0 || deletedTables > 0 || modifiedTables > 0;

        const totalTime = Date.now() - startTime;

        return {
          tables,
          hasChanges,
          summary: {
            addedTables,
            deletedTables,
            modifiedTables,
            addedColumns,
            deletedColumns
          }
        };
      });

      return Promise.resolve(result);
    });
  } catch (err: any) {
    addLog.error('[detectChanges] Error:', err);
    return Promise.reject(i18nT('common:code_error.error_code.500'));
  }
}

export default NextAPI(handler);
