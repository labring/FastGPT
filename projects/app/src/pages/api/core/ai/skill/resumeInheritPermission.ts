import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authSkill } from '@fastgpt/service/support/permission/skill/auth';
import {
  ManagePermissionVal,
  PerResourceTypeEnum
} from '@fastgpt/global/support/permission/constant';
import { resumeInheritPermission } from '@fastgpt/service/support/permission/inheritPermission';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { AgentSkillTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import {
  ResumeSkillInheritPermissionQuerySchema,
  type ResumeSkillInheritPermissionQuery
} from '@fastgpt/global/core/ai/skill/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

export type ResumeInheritPermissionQuery = ResumeSkillInheritPermissionQuery;
export type ResumeInheritPermissionBody = Record<string, never>;

// Resume the skill's inherit permission.
async function handler(
  req: ApiRequestProps<ResumeInheritPermissionBody, ResumeInheritPermissionQuery>
) {
  const { skillId } = parseApiInput({
    req,
    querySchema: ResumeSkillInheritPermissionQuerySchema
  }).query;
  const { skill } = await authSkill({
    skillId,
    req,
    authToken: true,
    per: ManagePermissionVal
  });

  if (skill.parentId) {
    await resumeInheritPermission({
      resource: skill,
      folderTypeList: [AgentSkillTypeEnum.folder],
      resourceType: PerResourceTypeEnum.agentSkill,
      resourceModel: MongoAgentSkills
    });
  } else {
    await MongoAgentSkills.updateOne(
      {
        _id: skillId
      },
      {
        inheritPermission: true
      }
    );
  }
}

export default NextAPI(handler);
