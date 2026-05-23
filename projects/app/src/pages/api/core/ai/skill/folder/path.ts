import type { ParentTreePathItemType } from '@fastgpt/global/common/parentFolder/type';
import { NextAPI } from '@/service/middleware/entry';
import { authSkill } from '@fastgpt/service/support/permission/skill/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { getSkillFolderPath } from '@fastgpt/service/core/ai/skill/manage';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import {
  GetSkillFolderPathQuerySchema,
  type GetSkillFolderPathQuery
} from '@fastgpt/global/core/ai/skill/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

async function handler(
  req: ApiRequestProps<Record<string, never>, GetSkillFolderPathQuery>
): Promise<ParentTreePathItemType[]> {
  const { sourceId: skillId, type } = parseApiInput({
    req,
    querySchema: GetSkillFolderPathQuerySchema
  }).query;

  if (!skillId) {
    return [];
  }

  const { skill } = await authSkill({
    req,
    authToken: true,
    authApiKey: true,
    skillId,
    per: ReadPermissionVal
  });

  return await getSkillFolderPath(type === 'current' ? skillId : (skill.parentId ?? null), type);
}

export default NextAPI(handler);
