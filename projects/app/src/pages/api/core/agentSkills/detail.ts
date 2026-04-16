import { NextAPI } from '@/service/middleware/entry';
import { authSkill } from '@fastgpt/service/support/permission/agentSkill/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import type {
  GetSkillDetailQuery,
  GetSkillDetailResponse
} from '@fastgpt/global/core/agentSkills/api';
import { isValidObjectId } from 'mongoose';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/agentSkill';

async function handler(
  req: ApiRequestProps<{}, GetSkillDetailQuery>
): Promise<GetSkillDetailResponse> {
  const { skillId } = req.query;

  if (!skillId || !isValidObjectId(skillId)) {
    return Promise.reject(SkillErrEnum.unExist);
  }

  const { skill, permission } = await authSkill({
    req,
    authToken: true,
    authApiKey: true,
    skillId,
    per: ReadPermissionVal
  });

  const appCount = await MongoApp.countDocuments({
    deleteTime: null,
    modules: {
      $elemMatch: {
        inputs: {
          $elemMatch: {
            key: NodeInputKeyEnum.skills,
            'value.skillId': skill._id.toString()
          }
        }
      }
    }
  });

  return {
    _id: skill._id,
    source: skill.source,
    type: skill.type,
    parentId: skill.parentId,
    inheritPermission: skill.inheritPermission,
    name: skill.name,
    description: skill.description,
    author: skill.author,
    category: skill.category,
    config: skill.config,
    avatar: skill.avatar,
    teamId: skill.teamId,
    tmbId: skill.tmbId,
    createTime: skill.createTime?.toISOString() || new Date().toISOString(),
    updateTime: skill.updateTime?.toISOString() || new Date().toISOString(),
    permission,
    appCount
  };
}

export default NextAPI(handler);
