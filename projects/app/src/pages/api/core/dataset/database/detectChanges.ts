import type { NextApiRequest } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { withDatabaseClient } from '@fastgpt/service/core/dataset/database/clientManager';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { addLog } from '@fastgpt/service/common/system/log';

export enum ColumnStatusEnum {
  add = 'add',
  delete = 'delete',
  available = 'available'
}

export enum TableStatusEnum {
  add = 'add',
  delete = 'delete',
  available = 'available'
}

export type TableColumn = {
  columnName: string;
  columnType: string;
  description: string;
  examples: string[];
  status: ColumnStatusEnum;
  enabled: boolean;
  valueIndex: boolean;
};

export type DBTableChange = {
  tableName: string;
  description: string;
  enabled: boolean;
  columns: Record<string, TableColumn>;
  status: TableStatusEnum;
};

export type DetectChangesQuery = {
  datasetId: string;
};

export type DetectChangesResponse = {
  tables: DBTableChange[];
  hasChanges: boolean;
  summary: {
    addedTables: number;
    deletedTables: number;
    modifiedTables: number;
    addedColumns: number;
    deletedColumns: number;
  };
};

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
    return Promise.reject('数据库未配置');
  }

  try {
    const result = await withDatabaseClient(datasetId, async (dbClient) => {
      await dbClient.init_db_schema();

      const currentTableNames = await dbClient.get_all_table_names();

      const existingCollections = await MongoDatasetCollection.find({
        datasetId,
        type: DatasetCollectionTypeEnum.table
      }).lean();

      // 构建已存在表的映射
      const existingTablesMap = new Map<string, any>();
      existingCollections.forEach((col) => {
        if (col.metadata?.tableSchema?.tableName) {
          existingTablesMap.set(col.metadata.tableSchema.tableName, col.metadata.tableSchema);
        }
      });

      const tables: DBTableChange[] = [];
      let addedTables = 0;
      let deletedTables = 0;
      let modifiedTables = 0;
      let addedColumns = 0;
      let deletedColumns = 0;

      // 检查删除的表
      existingTablesMap.forEach((existingTable, tableName) => {
        if (!currentTableNames.includes(tableName)) {
          tables.push({
            tableName: existingTable.tableName,
            description: existingTable.description || '',
            enabled: existingTable.enabled ?? true,
            columns: existingTable.columns || {},
            status: TableStatusEnum.delete
          });
          deletedTables++;
        }
      });

      // 检查新增和修改的表
      for (const tableName of currentTableNames) {
        const existingTable = existingTablesMap.get(tableName);

        if (!existingTable) {
          // 新增的表
          try {
            const tableInfo = await dbClient.aget_table_info(tableName, true);

            const columnsObj: Record<string, TableColumn> = {};
            if (tableInfo.columns instanceof Map) {
              tableInfo.columns.forEach((value, key) => {
                columnsObj[key] = {
                  columnName: value.columnName,
                  columnType: String(value.columnType),
                  description: value.description || '',
                  examples: value.examples || [],
                  status: ColumnStatusEnum.add,
                  enabled: value.forbid ?? true,
                  valueIndex: value.value_index ?? true
                };
                addedColumns++;
              });
            }

            tables.push({
              tableName: tableInfo.name,
              description: tableInfo.description || '',
              enabled: true,
              columns: columnsObj,
              status: TableStatusEnum.add
            });
            addedTables++;
          } catch (err) {
            addLog.error(`Failed to get new table info for ${tableName}`, err);
          }
        } else {
          // 检查现有表的变更
          try {
            const currentTableInfo = await dbClient.aget_table_info(tableName, false);

            const columnsObj: Record<string, TableColumn> = {};
            let tableModified = false;

            // 检查删除的列
            const existingColumns = existingTable.columns || {};
            const currentColumnsMap = new Map<string, any>();

            if (currentTableInfo.columns instanceof Map) {
              currentTableInfo.columns.forEach((value, key) => {
                currentColumnsMap.set(key, value);
              });
            }

            // 标记删除的列
            Object.keys(existingColumns).forEach((columnName) => {
              if (!currentColumnsMap.has(columnName)) {
                columnsObj[columnName] = {
                  ...existingColumns[columnName],
                  status: ColumnStatusEnum.delete
                };
                deletedColumns++;
                tableModified = true;
              }
            });

            // 检查新增和现有的列
            currentColumnsMap.forEach((columnInfo, columnName) => {
              if (!existingColumns[columnName]) {
                // 新增的列
                columnsObj[columnName] = {
                  columnName: columnInfo.columnName,
                  columnType: String(columnInfo.columnType),
                  description: columnInfo.description || '',
                  examples: columnInfo.examples || [],
                  status: ColumnStatusEnum.add,
                  enabled: true,
                  valueIndex: true
                };
                addedColumns++;
                tableModified = true;
              } else {
                // 现有的列
                columnsObj[columnName] = {
                  ...existingColumns[columnName],
                  columnType: String(columnInfo.columnType),
                  status: ColumnStatusEnum.available
                };
              }
            });

            if (tableModified) {
              tables.push({
                tableName: existingTable.tableName,
                description: existingTable.description || '',
                enabled: existingTable.enabled ?? true,
                columns: columnsObj,
                status: TableStatusEnum.available
              });
              modifiedTables++;
            }
          } catch (err) {
            addLog.error(`Failed to check changes for table ${tableName}`, err);
          }
        }
      }

      const hasChanges = addedTables > 0 || deletedTables > 0 || modifiedTables > 0;

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
    console.log(`result`, result);
    return result;
  } catch (err: any) {
    addLog.error('Failed to detect database changes', err);
    return Promise.reject(err?.message || '检测数据库变更失败');
  }
}

export default NextAPI(handler);
