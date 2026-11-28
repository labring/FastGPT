import { defineRepoToken } from '../../container';
import type { OrgLookupRepository } from './repo.type';
import { MongoOrgLookupRepository } from './mongo/repo';

/** Org 主体解析仓储 DI Token（当前仅提供 MongoDB 实现）。 */
export const OrgLookupRepoToken = defineRepoToken<OrgLookupRepository>('OrgLookupRepository', {
  mongo: (runtime) => new MongoOrgLookupRepository(runtime)
});
