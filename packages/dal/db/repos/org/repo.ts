import { defineRepoToken } from '../../container';
import { DbConfigurationError } from '../../errors';
import type { OrgLookupRepository } from './repo.type';
import { MongoOrgLookupRepository } from './mongo/repo';

/** Org 主体解析仓储 DI Token（按运行时方言路由）。 */
export const OrgLookupRepoToken = defineRepoToken<OrgLookupRepository>('OrgLookupRepository', {
  mongo: (runtime) => new MongoOrgLookupRepository(runtime),
  oceanbase: () => {
    throw new DbConfigurationError('OceanBase OrgLookupRepository is not yet implemented');
  }
});
