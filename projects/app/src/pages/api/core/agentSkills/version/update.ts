import { NextAPI } from '@/service/middleware/entry';
import { authSkill } from '@fastgpt/service/support/permission/agentSkill/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { MongoAgentSkillsVersion } from '@fastgpt/service/core/agentSkills/version/schema';
import {
  type UpdateSkillVersionBody,
  type UpdateSkillVersionResponse
} from '@fastgpt/global/openapi/core/agentSkills/api';

export type { UpdateSkillVersionBody, UpdateSkillVersionResponse };

async function handler(
  req: ApiRequestProps<UpdateSkillVersionBody>
): Promise<UpdateSkillVersionResponse> {
  const { skillId, versionId, versionName } = req.body;
  await authSkill({ skillId, req, per: WritePermissionVal, authToken: true, authApiKey: true });

  await MongoAgentSkillsVersion.findByIdAndUpdate(versionId, { versionName });

  return;
}

export default NextAPI(handler);
