import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { authSkill } from '@fastgpt/service/support/permission/skill/auth';
import { normalizeParentId } from '@fastgpt/global/common/parentFolder/depth';
import { getAgentSkillFolderAccess } from '@fastgpt/service/core/ai/skill/manage';
import {
  ListSkillsResponseSchema,
  ListSkillsV2QuerySchema,
  type ListSkillsResponse,
  type ListSkillsV2Query
} from '@fastgpt/global/openapi/core/ai/skill/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { listReadableAgentSkills } from '@fastgpt/service/core/ai/skill/manage';

/** 分页或按 ID 列出可读技能；解析时优先保留 ID 查询字段，并约束 ID 数量。 */
async function handler(req: ApiRequestProps<ListSkillsV2Query>): Promise<ListSkillsResponse> {
  // Schema 仅为选中的分页分支补默认值，ID 查询保持无分页参数。
  const query = parseApiInput({ req, bodySchema: ListSkillsV2QuerySchema }).body;
  const parentId = query.skillIds === undefined ? query.parentId : undefined;
  const currentFolderId = normalizeParentId(parentId);
  const {
    tmbId,
    teamId,
    permission: teamPer
  } = await authUserPer({
    req,
    authToken: true,
    authApiKey: true,
    per: ReadPermissionVal
  });

  if (currentFolderId) {
    const folderAccess =
      query.source === 'store'
        ? undefined
        : await getAgentSkillFolderAccess({
            teamId,
            tmbId,
            teamPer,
            folderId: currentFolderId
          });
    if (!folderAccess?.canBrowse) {
      await authSkill({
        req,
        authToken: true,
        authApiKey: true,
        per: ReadPermissionVal,
        skillId: currentFolderId
      });
    }
  }

  const response = await listReadableAgentSkills({
    ...query,
    teamId,
    tmbId,
    teamPer,
    browseDescendants: true
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
