import { defineRepoToken } from '../../container';
import { DbConfigurationError } from '../../errors';
import type { DatasetApiSyncRepository } from './repo.type';
import { MongoDatasetApiSyncRepository } from './mongo/repo';

/** Dataset API 同步仓储 DI Token（按运行时方言路由）。 */
export const DatasetApiSyncRepoToken = defineRepoToken<DatasetApiSyncRepository>(
  'DatasetApiSyncRepository',
  {
    mongo: (runtime) => new MongoDatasetApiSyncRepository(runtime),
    oceanbase: () => {
      throw new DbConfigurationError('OceanBase DatasetApiSyncRepository is not yet implemented');
    }
  }
);
