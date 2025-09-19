import type { DatabaseConfig } from '@fastgpt/global/core/dataset/type';
import { DatabaseErrEnum } from '@fastgpt/global/common/error/code/database';
import { addLog } from '../../../common/system/log';
import { MysqlClient } from './model/mysql';
import type { AsyncDB } from './model/asyncDB';
import { MongoDataset } from '../schema';

export async function createDatabaseClient(config: DatabaseConfig): Promise<AsyncDB> {
  switch (config.client) {
    case 'mysql':
      return MysqlClient.fromConfig(config);
    default:
      return Promise.reject(DatabaseErrEnum.notSupportType);
  }
}

export async function checkDatabaseConnection(config: DatabaseConfig): Promise<boolean> {
  let dbClient: AsyncDB | undefined;
  try {
    dbClient = await createDatabaseClient(config);
    const result = await dbClient.checkConnection();
    return result;
  } catch (err: any) {
    return Promise.reject(err);
  } finally {
    if (dbClient) {
      try {
        await dbClient.destroy();
      } catch (destroyErr: any) {
        addLog.warn(`Failed to destroy client after connection test`, destroyErr.message);
      }
    }
  }
}

export async function withDatabaseClient<T>(
  datasetId: string,
  operation: (client: AsyncDB) => Promise<T>
): Promise<T> {
  let dbClient: AsyncDB | undefined;
  try {
    const dataset = await MongoDataset.findById(datasetId);
    if (!dataset?.databaseConfig) {
      return Promise.reject(DatabaseErrEnum.dbConfigNotFound);
    }

    dbClient = await createDatabaseClient(dataset.databaseConfig);
    await dbClient.checkConnection();
    const result = await operation(dbClient);

    return result;
  } finally {
    if (dbClient) {
      try {
        await dbClient.destroy();
      } catch (destroyErr: any) {
        addLog.warn(`Failed to destroy database client for dataset ${datasetId}`, {
          error: destroyErr.message
        });
      }
    }
  }
}
export async function withDatabaseClientByConfig<T>(
  config: DatabaseConfig,
  operation: (client: AsyncDB) => Promise<T>
): Promise<T> {
  let dbClient: AsyncDB | undefined;

  try {
    dbClient = await createDatabaseClient(config);

    await dbClient.checkConnection();
    const result = await operation(dbClient);

    return result;
  } catch (err) {
    addLog.error(`Database operation failed`, err);
    throw err;
  } finally {
    if (dbClient) {
      try {
        await dbClient.destroy();
      } catch (destroyErr: any) {
        addLog.warn(`Failed to destroy database client`, {
          error: destroyErr.message
        });
      }
    }
  }
}
