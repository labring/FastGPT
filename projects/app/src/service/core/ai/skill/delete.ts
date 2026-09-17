import type { ApiRequestProps } from '@fastgpt/next/type';
import { AgentSkillTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import { OwnerPermissionVal } from '@fastgpt/global/support/permission/constant';
import { authSkill } from '@fastgpt/service/support/permission/skill/auth';
import { markSkillSubtreeDeleted } from '@fastgpt/service/core/ai/skill/manage';
import { findSkillAndAllChildren } from '@fastgpt/service/core/ai/skill/manage/folder';
import { addAgentSkillDeleteJob } from '@fastgpt/service/core/ai/skill/delete';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { addAuditLog, getI18nSkillType } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';

/**
 * 删除单个技能或文件夹及其子树，标记删除并投递异步清理队列，记录审计日志。
 * 返回被删除的技能与文件夹 ID 列表。
 */
export const deleteSkill = async ({
  req,
  skillId
}: {
  req: ApiRequestProps;
  skillId: string;
}): Promise<string[]> => {
  const { teamId, tmbId, skill } = await authSkill({
    req,
    skillId,
    per: OwnerPermissionVal,
    authToken: true,
    authApiKey: true
  });
  let deletedIds = [skillId];
  if (skill.type === AgentSkillTypeEnum.folder) {
    const children = await findSkillAndAllChildren({ teamId, skillId, fields: '_id' });
    deletedIds = children.map((item) => String(item._id));
  }
  await mongoSessionRun(async (session) => markSkillSubtreeDeleted(skillId, session));
  await addAgentSkillDeleteJob({ teamId, skillId });
  addAuditLog({
    tmbId,
    teamId,
    event: AuditEventEnum.DELETE_SKILL,
    params: { skillName: skill.name, skillType: getI18nSkillType(skill.type) }
  });
  return deletedIds;
};
