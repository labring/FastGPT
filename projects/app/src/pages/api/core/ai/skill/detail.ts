import { NextAPI } from '@/service/middleware/entry';
import { authSkill } from '@fastgpt/service/support/permission/skill/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import type {
  GetSkillDetailQuery,
  GetSkillDetailResponse
} from '@fastgpt/global/core/ai/skill/api';
import { GetSkillDetailQuerySchema } from '@fastgpt/global/core/ai/skill/api';
import { isValidObjectId } from 'mongoose';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { findTeamAppsByPublishedResource } from '@fastgpt/service/core/app/resourceLookup';

async function handler(
  req: ApiRequestProps<Record<string, never>, GetSkillDetailQuery>
): Promise<GetSkillDetailResponse> {
  const { skillId } = parseApiInput({ req, querySchema: GetSkillDetailQuerySchema }).query;

  if (!skillId || !isValidObjectId(skillId)) {
    return Promise.reject(SkillErrEnum.invalidSkillId);
  }

  const { skill, permission, teamId } = await authSkill({
    req,
    authToken: true,
    authApiKey: true,
    skillId,
    per: ReadPermissionVal
  });

  const { counts } = await findTeamAppsByPublishedResource({
    teamId,
    type: 'skill',
    ids: skill._id.toString()
  });
  const appCount = counts.get(skill._id.toString()) ?? 0;

  return {
    _id: skill._id,
    source: skill.source,
    type: skill.type,
    parentId: skill.parentId,
    inheritPermission: skill.inheritPermission,
    name: skill.name,
    description: skill.description,
    category: skill.category,
    avatar: skill.avatar,
    creationStatus: skill.creationStatus,
    creationError: skill.creationError,
    teamId: skill.teamId,
    tmbId: skill.tmbId,
    currentVersionId: skill.currentVersionId ? String(skill.currentVersionId) : undefined,
    createTime: skill.createTime?.toISOString() || new Date().toISOString(),
    updateTime: skill.updateTime?.toISOString() || new Date().toISOString(),
    permission,
    appCount
  };
}

export default NextAPI(handler);
