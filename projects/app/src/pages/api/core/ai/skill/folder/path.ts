import type { ParentTreePathItemType } from '@fastgpt/global/common/parentFolder/type';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { NextAPI } from '@/service/middleware/entry';
import { authSkill } from '@fastgpt/service/support/permission/skill/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import {
  getAgentSkillFolderAccess,
  getSkillFolderPath
} from '@fastgpt/service/core/ai/skill/manage';

import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import type { ApiRequestProps } from '@fastgpt/next/type';
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

  const {
    teamId,
    tmbId,
    permission: teamPer
  } = await authUserPer({
    req,
    authToken: true,
    authApiKey: true,
    per: ReadPermissionVal
  });

  if (type === 'parent') {
    await authSkill({
      req,
      authToken: true,
      authApiKey: true,
      skillId,
      per: ReadPermissionVal
    });
    return await getSkillFolderPath(skillId, type, teamId);
  }

  const { folder, hasReadPermission, canBrowse } = await getAgentSkillFolderAccess({
    teamId,
    tmbId,
    teamPer,
    folderId: skillId
  });
  if (!folder) {
    await authSkill({
      req,
      authToken: true,
      authApiKey: true,
      skillId,
      per: ReadPermissionVal
    });
    throw CommonErrEnum.invalidParams;
  }

  if (!canBrowse) {
    await authSkill({
      req,
      authToken: true,
      authApiKey: true,
      skillId,
      per: ReadPermissionVal
    });
  }

  const paths = await getSkillFolderPath(skillId, type, teamId);
  return paths.map((path) =>
    path.parentId === skillId
      ? { ...path, folderAccessMode: hasReadPermission ? 'read' : 'navigate' }
      : path
  );
}

export default NextAPI(handler);
