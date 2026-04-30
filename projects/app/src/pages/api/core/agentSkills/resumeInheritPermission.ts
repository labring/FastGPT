import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authSkill } from '@fastgpt/service/support/permission/agentSkill/auth';
import {
  ManagePermissionVal,
  PerResourceTypeEnum
} from '@fastgpt/global/support/permission/constant';
import { resumeInheritPermission } from '@fastgpt/service/support/permission/inheritPermission';
import { MongoAgentSkills } from '@fastgpt/service/core/agentSkills/schema';
import { AgentSkillTypeEnum } from '@fastgpt/global/core/agentSkills/constants';

export type ResumeInheritPermissionQuery = {
  skillId: string;
};
export type ResumeInheritPermissionBody = {};

// Resume the skill's inherit permission.
async function handler(
  req: ApiRequestProps<ResumeInheritPermissionBody, ResumeInheritPermissionQuery>
) {
  const { skillId } = req.query;
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
