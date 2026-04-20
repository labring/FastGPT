import type { NextApiRequest, NextApiResponse } from 'next';
import type { ParentTreePathItemType } from '@fastgpt/global/common/parentFolder/type';
import { NextAPI } from '@/service/middleware/entry';
import { authSkill } from '@fastgpt/service/support/permission/agentSkill/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { getSkillFolderPath } from '@fastgpt/service/core/agentSkills/controller';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<any>
): Promise<ParentTreePathItemType[]> {
  const { sourceId: skillId, type } = req.query as {
    sourceId?: string;
    type: 'current' | 'parent';
  };

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

  return await getSkillFolderPath(type === 'current' ? skillId : skill.parentId ?? null, type);
}

export default NextAPI(handler);
