import { NextAPI } from '@/service/middleware/entry';
import { authSkill } from '@fastgpt/service/support/permission/agentSkill/auth';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { deleteSkill } from '@fastgpt/service/core/agentSkills/controller';
import type { DeleteSkillQuery } from '@fastgpt/global/core/agentSkills/api';
import { OwnerPermissionVal } from '@fastgpt/global/support/permission/constant';
import { addAuditLog, getI18nSkillType } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { isValidObjectId } from 'mongoose';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/agentSkill';

async function handler(req: ApiRequestProps<{}, DeleteSkillQuery>) {
  const { skillId } = req.query;

  if (!skillId || !isValidObjectId(skillId)) {
    return Promise.reject(SkillErrEnum.unExist);
  }

  const { teamId, tmbId, skill } = await authSkill({
    req,
    skillId,
    per: OwnerPermissionVal,
    authToken: true,
    authApiKey: true
  });

  await mongoSessionRun(async (session) => {
    return deleteSkill(skillId, session);
  });

  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.DELETE_SKILL,
      params: { skillName: skill.name, skillType: getI18nSkillType(skill.type) }
    });
  })();
}

export default NextAPI(handler);
