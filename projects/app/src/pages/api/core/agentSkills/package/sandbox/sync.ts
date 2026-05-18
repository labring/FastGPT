import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { authSkill } from '@fastgpt/service/support/permission/agentSkill/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { isValidObjectId } from 'mongoose';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/agentSkill';
import { syncEditDebugSandbox } from '@fastgpt/service/core/agentSkills/sandboxSync';
import {
  SyncSkillSandboxBodySchema,
  type SyncSkillSandboxResponse
} from '@fastgpt/global/openapi/core/agentSkills/package/api';

async function handler(req: ApiRequestProps): Promise<SyncSkillSandboxResponse> {
  const { skillId } = SyncSkillSandboxBodySchema.parse(req.body);

  if (!skillId || !isValidObjectId(skillId)) {
    return Promise.reject(SkillErrEnum.invalidSkillId);
  }

  const { teamId } = await authSkill({
    req,
    authToken: true,
    authApiKey: true,
    skillId,
    per: ReadPermissionVal
  });

  return syncEditDebugSandbox({ skillId, teamId });
}

export default NextAPI(handler);
