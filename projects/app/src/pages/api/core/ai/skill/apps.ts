import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { authSkill } from '@fastgpt/service/support/permission/skill/auth';
import type {
  ListAppsBySkillIdQuery,
  ListAppsBySkillIdResponse
} from '@fastgpt/global/core/ai/skill/api';
import { ListAppsBySkillIdQuerySchema } from '@fastgpt/global/core/ai/skill/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { findTeamAppsByPublishedResource } from '@fastgpt/service/core/app/resourceLookup';
import { formatReadableReferencedApps } from '@/service/core/app/referencedApps';

async function handler(
  req: ApiRequestProps<unknown, ListAppsBySkillIdQuery>
): Promise<ListAppsBySkillIdResponse> {
  const { skillId } = parseApiInput({ req, querySchema: ListAppsBySkillIdQuerySchema }).query;

  const [{ tmbId, teamId, permission: teamPer }, { permission: skillPer }] = await Promise.all([
    authUserPer({
      req,
      authToken: true,
      authApiKey: true,
      per: ReadPermissionVal
    }),
    authSkill({
      req,
      authToken: true,
      authApiKey: true,
      skillId,
      per: ReadPermissionVal
    })
  ]);
  if (!skillPer.isOwner) {
    return { list: [], hiddenCount: 0, hiddenOwnerGroups: [] };
  }

  const { apps } = await findTeamAppsByPublishedResource({
    teamId,
    type: 'skill',
    ids: skillId
  });
  apps.sort((a, b) => +new Date(b.updateTime) - +new Date(a.updateTime));

  return formatReadableReferencedApps({
    apps,
    teamId,
    tmbId,
    isTeamOwner: teamPer.isOwner
  });
}

export default NextAPI(handler);
