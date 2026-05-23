import { NextAPI } from '@/service/middleware/entry';
import { authSkill } from '@fastgpt/service/support/permission/skill/auth';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { markSkillSubtreeDeleted } from '@fastgpt/service/core/ai/skill/manage';
import { addAgentSkillDeleteJob } from '@fastgpt/service/core/ai/skill/delete';
import {
  DeleteSkillQuerySchema,
  type DeleteSkillQuery
} from '@fastgpt/global/openapi/core/ai/skill/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { OwnerPermissionVal } from '@fastgpt/global/support/permission/constant';
import { addAuditLog, getI18nSkillType } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { isValidObjectId } from 'mongoose';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';

async function handler(req: ApiRequestProps<Record<string, never>, DeleteSkillQuery>) {
  const { skillId } = parseApiInput({ req, querySchema: DeleteSkillQuerySchema }).query;

  if (!skillId || !isValidObjectId(skillId)) {
    return Promise.reject(SkillErrEnum.invalidSkillId);
  }

  const { teamId, tmbId, skill } = await authSkill({
    req,
    skillId,
    per: OwnerPermissionVal,
    authToken: true,
    authApiKey: true
  });

  await mongoSessionRun(async (session) => {
    return markSkillSubtreeDeleted(skillId, session);
  });

  await addAgentSkillDeleteJob({ teamId, skillId });

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
