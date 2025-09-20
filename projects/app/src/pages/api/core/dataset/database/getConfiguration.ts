import type { NextApiRequest } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { withDatabaseClient } from '@fastgpt/service/core/dataset/database/clientManager';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { DBTable } from '@fastgpt/service/core/dataset/database/model/dataModel';
import { addLog } from '@fastgpt/service/common/system/log';

type Query = {
  id: string;
};

export type GetConfigurationResponse = {
  tables: Array<{
    tableName: string;
    description: string;
    forbid: boolean;
    columns: Record<
      string,
      {
        columnName: string;
        columnType: string;
        description: string;
        examples: string[];
        forbid: boolean;
        valueIndex: boolean;
      }
    >;
    foreignKeys: Array<{
      constrainedColumns: string[];
      referredSchema: string | null;
      referredTable: string;
      referredColumns: string[];
    }>;
    primaryKeys: string[];
  }>;
};

async function handler(req: ApiRequestProps<Query>): Promise<GetConfigurationResponse> {
  const { datasetId } = req.query;

  const { dataset } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId,
    per: ReadPermissionVal
  });

  if (!dataset.databaseConfig) {
    return Promise.reject('Can Not Found Database Config');
  }

  try {
    const tables = await withDatabaseClient(datasetId, async (dbClient) => {
      const tableNames = await dbClient.get_all_table_names();

      // 获取每个表的详细信息
      const tableList = [];
      for (const tableName of tableNames) {
        try {
          const tableInfo = await dbClient.aget_table_info(tableName, true);

          // 转换columns Map为普通对象
          const columnsObj: Record<string, any> = {};
          if (tableInfo.columns instanceof Map) {
            tableInfo.columns.forEach((value, key) => {
              columnsObj[key] = {
                columnName: value.columnName,
                columnType: String(value.columnType),
                description: value.description || '',
                examples: value.examples || [],
                forbid: value.forbid ?? false,
                valueIndex: value.value_index ?? true
              };
            });
          }

          tableList.push({
            tableName: tableInfo.name,
            description: tableInfo.description || '',
            forbid: tableInfo.forbid ?? false,
            columns: columnsObj,
            foreignKeys:
              tableInfo.foreign_keys?.map((fk) => ({
                constrainedColumns: fk.constrained_columns,
                referredSchema: fk.referred_schema,
                referredTable: fk.referred_table,
                referredColumns: fk.referred_columns
              })) || [],
            primaryKeys: tableInfo.primary_keys || []
          });
        } catch (err) {
          addLog.error(`Failed to get table info for ${tableName}`, err);
        }
      }

      return tableList;
    });

    return {
      tables
    };
  } catch (err: any) {
    addLog.error('Failed to get database configuration', err);
    return Promise.reject(err?.message || '获取数据库配置失败');
  }
}

export default NextAPI(handler);
