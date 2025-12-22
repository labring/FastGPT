import type { NextApiRequest } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { withDatabaseClient } from '@fastgpt/service/core/dataset/database/clientManager';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import type { TableSchemaType } from '@fastgpt/global/core/dataset/type';
import { addLog } from '@fastgpt/service/common/system/log';
import type { DatabaseCollectionsBody as GetConfigurationResponse } from '@fastgpt/global/core/dataset/database/api';
import { i18nT } from '@fastgpt/web/i18n/utils';

export type Query = { datasetId: string };

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

  // Fetch database schema using the configured database connection
  const tables = await withDatabaseClient(datasetId, async (dbClient) => {
    const tableNames = await dbClient.get_all_table_names();
    addLog.debug('Fetched table names', { tableNames });
    if (tableNames.length !== new Set(tableNames).size)
      Promise.reject(i18nT('database_client:tableNamesDuplicate'));
    // Fetch detailed info for each table
    const tableList = [];
    for (const tableName of tableNames) {
      const tableInfo: TableSchemaType = await dbClient.get_table_info(tableName, true);

      tableList.push({
        tableName: tableInfo.tableName,
        exist: tableInfo.exist,
        description: tableInfo.description || '',
        forbid: false,
        columns: tableInfo.columns,
        foreignKeys: tableInfo.foreignKeys || [],
        primaryKeys: tableInfo.primaryKeys || [],
        constraints: tableInfo.constraints || []
      });
    }

    return tableList;
  });

  return {
    tables
  };
}

export default NextAPI(handler);
