import { defineRepoToken } from '../../container';
import type { DatasetApiSyncRepository } from './repo.type';
import { MongoDatasetApiSyncRepository } from './mongo/repo';

/** Dataset API 同步仓储 DI Token（当前仅提供 MongoDB 实现）。 */
export const DatasetApiSyncRepoToken = defineRepoToken<DatasetApiSyncRepository>(
  'DatasetApiSyncRepository',
  {
    mongo: (runtime) => new MongoDatasetApiSyncRepository(runtime)
  }
);
