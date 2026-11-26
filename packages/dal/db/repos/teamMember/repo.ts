import { defineRepoToken } from '../../container';
import { DbConfigurationError } from '../../errors';
import type { TeamMemberLookupRepository } from './repo.type';
import { MongoTeamMemberLookupRepository } from './mongo/repo';

/** TeamMember 主体解析仓储 DI Token（按运行时方言路由）。 */
export const TeamMemberLookupRepoToken = defineRepoToken<TeamMemberLookupRepository>(
  'TeamMemberLookupRepository',
  {
    mongo: (runtime) => new MongoTeamMemberLookupRepository(runtime),
    oceanbase: () => {
      throw new DbConfigurationError('OceanBase TeamMemberLookupRepository is not yet implemented');
    }
  }
);
