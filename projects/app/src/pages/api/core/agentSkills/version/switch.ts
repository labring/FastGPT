import { NextAPI } from '@/service/middleware/entry';
import { authSkill } from '@fastgpt/service/support/permission/agentSkill/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { MongoAgentSkillsVersion } from '@fastgpt/service/core/agentSkills/version/schema';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import {
  type SwitchSkillVersionBody,
  type SwitchSkillVersionResponse
} from '@fastgpt/global/openapi/core/agentSkills/api';

export type { SwitchSkillVersionBody, SwitchSkillVersionResponse };

async function handler(
  req: ApiRequestProps<SwitchSkillVersionBody>
): Promise<SwitchSkillVersionResponse> {
  const { skillId, versionId } = req.body;
  await authSkill({ skillId, req, per: WritePermissionVal, authToken: true, authApiKey: true });

  await mongoSessionRun(async (session) => {
    await MongoAgentSkillsVersion.updateMany(
      { skillId, isActive: true },
      { isActive: false },
      { session }
    );

    await MongoAgentSkillsVersion.findByIdAndUpdate(versionId, { isActive: true }, { session });
  });

  return;
}

export default NextAPI(handler);
