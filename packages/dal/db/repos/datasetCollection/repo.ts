import { defineRepoToken } from '../../container';
import { DbConfigurationError } from '../../errors';
import type { DatasetCollectionApiSyncRepository } from './repo.type';
import { MongoDatasetCollectionApiSyncRepository } from './mongo/repo';

/** DatasetCollection API 同步仓储 DI Token（按运行时方言路由）。 */
export const DatasetCollectionApiSyncRepoToken =
  defineRepoToken<DatasetCollectionApiSyncRepository>('DatasetCollectionApiSyncRepository', {
    mongo: (runtime) => new MongoDatasetCollectionApiSyncRepository(runtime),
    oceanbase: () => {
      throw new DbConfigurationError(
        'OceanBase DatasetCollectionApiSyncRepository is not yet implemented'
      );
    }
  });
