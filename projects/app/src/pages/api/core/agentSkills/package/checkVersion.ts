import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { authSkill } from '@fastgpt/service/support/permission/agentSkill/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { isValidObjectId } from 'mongoose';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/agentSkill';
import { MongoAgentSkills } from '@fastgpt/service/core/agentSkills/schema';
import {
  CheckPackageVersionBodySchema,
  type CheckPackageVersionResponse
} from '@fastgpt/global/openapi/core/agentSkills/package/api';

/**
 * Lightweight polling endpoint — returns whether the skill's packageVersion
 * has changed since the client last checked. Used by the frontend to detect
 * edits made from other replicas/sessions.
 */
async function handler(req: ApiRequestProps): Promise<CheckPackageVersionResponse> {
  const { skillId, knownVersion } = CheckPackageVersionBodySchema.parse(req.body);

  if (!skillId || !isValidObjectId(skillId)) {
    return Promise.reject(SkillErrEnum.invalidSkillId);
  }

  await authSkill({
    req,
    authToken: true,
    authApiKey: true,
    skillId,
    per: ReadPermissionVal
  });

  const skill = await MongoAgentSkills.findById(skillId, 'packageVersion').lean();

  const currentVersion = (skill as any)?.packageVersion ?? 0;

  return {
    currentVersion,
    changed: currentVersion !== knownVersion
  };
}

export default NextAPI(handler);
