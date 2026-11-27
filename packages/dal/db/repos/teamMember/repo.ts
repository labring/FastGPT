import { defineRepoToken } from '../../container';
import type { TeamMemberLookupRepository } from './repo.type';
import { MongoTeamMemberLookupRepository } from './mongo/repo';

/** TeamMember 主体解析仓储 DI Token（当前仅提供 MongoDB 实现）。 */
export const TeamMemberLookupRepoToken = defineRepoToken<TeamMemberLookupRepository>(
  'TeamMemberLookupRepository',
  {
    mongo: (runtime) => new MongoTeamMemberLookupRepository(runtime)
  }
);
