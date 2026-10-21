import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authSkill } from '@fastgpt/service/support/permission/skill/auth';
import {
  ManagePermissionVal,
  PerResourceTypeEnum
} from '@fastgpt/global/support/permission/constant';
import { resumeInheritPermission } from '@fastgpt/service/support/permission/inheritPermission';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { getSkillFolderPath } from '@fastgpt/service/core/ai/skill/manage/folder';
import { AgentSkillTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import {
  ResumeSkillInheritPermissionQuerySchema,
  ResumeSkillInheritPermissionResponseSchema,
  type ResumeSkillInheritPermissionQuery,
  type ResumeSkillInheritPermissionResponse
} from '@fastgpt/global/openapi/core/ai/skill/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';

export type ResumeInheritPermissionQuery = ResumeSkillInheritPermissionQuery;
export type ResumeInheritPermissionBody = Record<string, never>;

// Resume the skill's inherit permission.
async function handler(
  req: ApiRequestProps<ResumeInheritPermissionBody, ResumeInheritPermissionQuery>
): Promise<ResumeSkillInheritPermissionResponse> {
  const { skillId } = parseApiInput({
    req,
    querySchema: ResumeSkillInheritPermissionQuerySchema
  }).query;
  const { teamId, tmbId, skill } = await authSkill({
    skillId,
    req,
    authToken: true,
    per: ManagePermissionVal
  });

  // 复用 Skill 的祖先链查询，确保嵌套资源的审计路径与目录展示一致。
  const parentPaths = skill.parentId ? await getSkillFolderPath(String(skill._id), 'parent') : [];
  const parentResourceNames = parentPaths.map((path) => path.parentName);
  const parentResourceName = parentResourceNames.at(-1);

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

  addAuditLog({
    teamId,
    tmbId,
    event: AuditEventEnum.RESUME_INHERIT_PERMISSION,
    params: {
      targetResource: [...parentResourceNames, skill.name].join('/'),
      parentResource: parentResourceName ?? '-'
    }
  });

  return ResumeSkillInheritPermissionResponseSchema.parse(undefined);
}

export default NextAPI(handler);
