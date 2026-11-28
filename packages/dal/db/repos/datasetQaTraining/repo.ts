import { defineRepoToken } from '../../container';
import type { DatasetQaTrainingRepository } from './repo.type';
import { MongoDatasetQaTrainingRepository } from './mongo/repo';

/** DatasetQaTraining 仓储 DI Token（Phase 1A Mongo-first，Phase 1B 补齐 OceanBase 实现）。 */
export const DatasetQaTrainingRepoToken = defineRepoToken<DatasetQaTrainingRepository>(
  'DatasetQaTrainingRepository',
  {
    mongo: (runtime) => new MongoDatasetQaTrainingRepository(runtime)
  }
);
