import { defineRepoToken } from '../../container';
import type { MemberGroupLookupRepository } from './repo.type';
import { MongoMemberGroupLookupRepository } from './mongo/repo';

/** MemberGroup 主体解析仓储 DI Token（当前仅提供 MongoDB 实现）。 */
export const MemberGroupLookupRepoToken = defineRepoToken<MemberGroupLookupRepository>(
  'MemberGroupLookupRepository',
  {
    mongo: (runtime) => new MongoMemberGroupLookupRepository(runtime)
  }
);
