import { defineRepoToken } from '../../container';
import type { DatasetCollectionApiSyncRepository } from './repo.type';
import { MongoDatasetCollectionApiSyncRepository } from './mongo/repo';

/** DatasetCollection API 同步仓储 DI Token（当前仅提供 MongoDB 实现）。 */
export const DatasetCollectionApiSyncRepoToken =
  defineRepoToken<DatasetCollectionApiSyncRepository>('DatasetCollectionApiSyncRepository', {
    mongo: (runtime) => new MongoDatasetCollectionApiSyncRepository(runtime)
  });
