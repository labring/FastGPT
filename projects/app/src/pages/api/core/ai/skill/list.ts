import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { authSkill } from '@fastgpt/service/support/permission/skill/auth';
import { ListSkillsQuerySchema, type ListSkillsQuery } from '@fastgpt/global/core/ai/skill/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { listReadableAgentSkills } from '@fastgpt/service/core/ai/skill/manage';

export type GetSkillListBody = ListSkillsQuery;

async function handler(req: ApiRequestProps<GetSkillListBody>) {
  const { parentId, source, searchKey, category, type, skillIds, page, pageSize, withAppCount } =
    parseApiInput({ req, bodySchema: ListSkillsQuerySchema }).body;
  const selectedSkillIds = skillIds?.filter(Boolean) ?? [];
  const isSkillIdsQuery = selectedSkillIds.length > 0;

  // Auth user permission
  const [{ tmbId, teamId, permission: teamPer }] = await Promise.all([
    authUserPer({
      req,
      authToken: true,
      authApiKey: true,
      per: ReadPermissionVal
    }),
    ...(parentId && !isSkillIdsQuery
      ? [
          authSkill({
            req,
            authToken: true,
            authApiKey: true,
            per: ReadPermissionVal,
            skillId: parentId
          })
        ]
      : [])
  ]);

  return listReadableAgentSkills({
    teamId,
    tmbId,
    teamPer,
    parentId,
    source,
    searchKey,
    category,
    type,
    skillIds: selectedSkillIds,
    page,
    pageSize,
    withAppCount
  });
}

export default NextAPI(handler);
