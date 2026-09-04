import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { authSkill } from '@fastgpt/service/support/permission/skill/auth';
import {
  ListSkillsResponseSchema,
  ListSkillsV2QuerySchema,
  type ListSkillsResponse,
  type ListSkillsV2Query
} from '@fastgpt/global/openapi/core/ai/skill/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { listReadableAgentSkills } from '@fastgpt/service/core/ai/skill/manage';

async function handler(req: ApiRequestProps<ListSkillsV2Query>): Promise<ListSkillsResponse> {
  const {
    parentId,
    source,
    searchKey,
    category,
    type,
    skillIds,
    offset,
    page,
    pageSize,
    withAppCount
  } = parseApiInput({ req, bodySchema: ListSkillsV2QuerySchema }).body;
  const selectedSkillIds = skillIds?.filter(Boolean) ?? [];
  const isSkillIdsQuery = selectedSkillIds.length > 0;
  const [{ tmbId, teamId, permission: teamPer }] = await Promise.all([
    authUserPer({ req, authToken: true, authApiKey: true, per: ReadPermissionVal }),
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
  const response = await listReadableAgentSkills({
    teamId,
    tmbId,
    teamPer,
    parentId,
    source,
    searchKey,
    category,
    type,
    skillIds: selectedSkillIds,
    offset: isSkillIdsQuery ? undefined : offset,
    page: isSkillIdsQuery ? undefined : (page ?? 1),
    pageSize: isSkillIdsQuery ? undefined : (pageSize ?? 50),
    withAppCount
  });

  return ListSkillsResponseSchema.parse({
    ...response,
    list: response.list.map((skill) => ({
      ...skill,
      createTime: new Date(skill.createTime).toISOString(),
      updateTime: new Date(skill.updateTime).toISOString()
    }))
  });
}

export default NextAPI(handler);
