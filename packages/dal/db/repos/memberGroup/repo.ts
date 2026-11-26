import { defineRepoToken } from '../../container';
import { DbConfigurationError } from '../../errors';
import type { MemberGroupLookupRepository } from './repo.type';
import { MongoMemberGroupLookupRepository } from './mongo/repo';

/** MemberGroup 主体解析仓储 DI Token（按运行时方言路由）。 */
export const MemberGroupLookupRepoToken = defineRepoToken<MemberGroupLookupRepository>(
  'MemberGroupLookupRepository',
  {
    mongo: (runtime) => new MongoMemberGroupLookupRepository(runtime),
    oceanbase: () => {
      throw new DbConfigurationError(
        'OceanBase MemberGroupLookupRepository is not yet implemented'
      );
    }
  }
);
