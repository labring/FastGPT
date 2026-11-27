import { defineRepoToken } from '../../container';
import type { UserLookupRepository } from './repo.type';
import { MongoUserLookupRepository } from './mongo/repo';

/** User 主体解析仓储 DI Token（当前仅提供 MongoDB 实现）。 */
export const UserLookupRepoToken = defineRepoToken<UserLookupRepository>('UserLookupRepository', {
  mongo: (runtime) => new MongoUserLookupRepository(runtime)
});
