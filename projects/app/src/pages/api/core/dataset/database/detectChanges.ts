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
import type { TableColumn } from '@fastgpt/service/core/dataset/database/model/dataModel';
import { TableColumnTransformer } from '@fastgpt/service/core/dataset/database/model/dataModel';

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

  const result = await withDatabaseClient(datasetId, async (dbClient) => {
    await dbClient.init_db_schema();

    const databaseTableNames = await dbClient.get_all_table_names();

    const mongoCollections = await MongoDatasetCollection.find({
      datasetId,
      type: DatasetCollectionTypeEnum.table
    }).lean();

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

    await mongoSessionRun(async (session) => {
      const tasks: Promise<any>[] = [];

      mongoTablesMap.forEach((mongoTable, tableName) => {
        if (!databaseTableNames.includes(tableName)) {
          tables.push({ ...mongoTable, status: StatusEnum.delete });
          deletedTables++;
          tasks.push(
            MongoDatasetCollection.updateOne(
              { 'tableSchema._id': mongoTable._id },
              {
                $set: {
                  'tableSchema.exist': false,
                  'tableSchema.lastUpdated': new Date(),
                  'tableSchema.forbid': true
                }
              },
              { session }
            )
          );
        }
      });

      await Promise.all(tasks);
    });

    // 检查新增和修改的表
    for (const tableName of databaseTableNames) {
      const intersectTable = mongoTablesMap.get(tableName);
      console.debug('[detectChanges] intersectTable', intersectTable);
      if (!intersectTable) {
        // 新增的表
        const tableInfo = await dbClient.aget_table_info(tableName, true);

        const columnsObj: Record<string, DBTableColumn> = {};
        if (tableInfo.columns instanceof Map) {
          tableInfo.columns.forEach((value, key) => {
            columnsObj[key] = {
              ...TableColumnTransformer.toPlainObject(value),
              status: StatusEnum.add
            };
            addedColumns++;
          });
        }

        tables.push({
          tableName: tableInfo.tableName,
          description: tableInfo.description || '',
          forbid: tableInfo.forbid ?? false,
          columns: columnsObj,
          foreignKeys: tableInfo.foreignKeys || [],
          primaryKeys: tableInfo.primaryKeys || [],
          constraints: tableInfo.constraints || [],
          status: StatusEnum.add
        });
        addedTables++;
      } else {
        // 检查现有表的变更
        const databaseTableInfo = await dbClient.aget_table_info(tableName, false);

        const columnsObj: Record<string, DBTableColumn> = {};
        let tableModified = false;

        // 检查删除的列
        const mongoColumns = intersectTable.columns || {};
        const databaseColumnsMap = new Map<string, TableColumn>();

        if (databaseTableInfo.columns instanceof Map) {
          databaseTableInfo.columns.forEach((value: TableColumn, key: string) => {
            databaseColumnsMap.set(key, value);
          });
        }

        // 标记删除的列
        Object.keys(mongoColumns).forEach((columnName) => {
          if (!databaseColumnsMap.has(columnName)) {
            columnsObj[columnName] = {
              ...mongoColumns[columnName],
              status: StatusEnum.delete
            };
            deletedColumns++;
            tableModified = true;
          }
        });
        // 检查新增和现有的列
        databaseColumnsMap.forEach((columnInfo, columnName) => {
          const mongoColumn = mongoColumns[columnName];
          if (
            !mongoColumn ||
            mongoColumn.defaultValue !== columnInfo.defaultValue ||
            mongoColumn.isNullable !== columnInfo.isNullable ||
            mongoColumn.isAutoIncrement !== columnInfo.isAutoIncrement ||
            mongoColumn.isPrimaryKey !== columnInfo.isPrimaryKey ||
            mongoColumn.isForeignKey !== columnInfo.isForeignKey
          ) {
            console.debug('[detectChanges] columnInfo', columnInfo);
            // 新增的列
            columnsObj[columnName] = {
              ...TableColumnTransformer.toPlainObject(columnInfo),
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
            tableName: databaseTableInfo.tableName,
            description: intersectTable.description || '',
            forbid: intersectTable.forbid ?? false,
            columns: columnsObj,
            foreignKeys: databaseTableInfo.foreignKeys || [],
            primaryKeys: databaseTableInfo.primaryKeys || [],
            constraints: databaseTableInfo.constraints || [],
            status: StatusEnum.available
          });
          modifiedTables++;
        } else {
          tables.push({
            tableName: intersectTable.tableName,
            description: intersectTable.description || '',
            forbid: intersectTable.forbid ?? false,
            columns: columnsObj,
            foreignKeys: intersectTable.foreignKeys || [],
            primaryKeys: intersectTable.primaryKeys || [],
            constraints: intersectTable.constraints || [],
            status: StatusEnum.available
          });
          // trans to exist table
          mongoSessionRun(async (session) => {
            await MongoDatasetCollection.updateOne(
              { 'tableSchema._id': intersectTable._id },
              {
                $set: {
                  'tableSchema.exist': true,
                  'tableSchema.lastUpdated': new Date(),
                  'tableSchema.forbid': false
                }
              },
              { session }
            );
          });
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
  return result;
}

export default NextAPI(handler);
