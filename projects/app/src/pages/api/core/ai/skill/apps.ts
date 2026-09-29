import { NextAPI } from '@/service/middleware/entry';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { authSkill } from '@fastgpt/service/support/permission/skill/auth';
import type { ListAppsBySkillIdQuery } from '@fastgpt/global/core/ai/skill/api';
import { ListAppsBySkillIdQuerySchema } from '@fastgpt/global/core/ai/skill/api';
import type { ReferencedAppsResponse } from '@fastgpt/global/core/app/type';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { listReadableReferencedApps } from '@/service/core/app/referencedApps';

async function handler(
  req: ApiRequestProps<unknown, ListAppsBySkillIdQuery>
): Promise<ReferencedAppsResponse> {
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
    return Promise.reject(SkillErrEnum.unAuthSkill);
  }

  return listReadableReferencedApps({
    teamId,
    tmbId,
    isTeamOwner: teamPer.isOwner,
    resourceType: 'skill',
    resourceIds: skillId
  });
}

export default NextAPI(handler);
