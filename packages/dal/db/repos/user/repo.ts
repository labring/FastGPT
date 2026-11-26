import { defineRepoToken } from '../../container';
import { DbConfigurationError } from '../../errors';
import type { UserLookupRepository } from './repo.type';
import { MongoUserLookupRepository } from './mongo/repo';

/** User 主体解析仓储 DI Token（按运行时方言路由）。 */
export const UserLookupRepoToken = defineRepoToken<UserLookupRepository>('UserLookupRepository', {
  mongo: (runtime) => new MongoUserLookupRepository(runtime),
  oceanbase: () => {
    throw new DbConfigurationError('OceanBase UserLookupRepository is not yet implemented');
  }
});
