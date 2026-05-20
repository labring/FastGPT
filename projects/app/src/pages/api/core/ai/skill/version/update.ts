import { NextAPI } from '@/service/middleware/entry';
import { authSkill } from '@fastgpt/service/support/permission/skill/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { MongoAgentSkillsVersion } from '@fastgpt/service/core/ai/skill/version/schema';
import {
  UpdateSkillVersionBodySchema,
  type UpdateSkillVersionBody,
  type UpdateSkillVersionResponse
} from '@fastgpt/global/openapi/core/ai/skill/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';

export type { UpdateSkillVersionBody, UpdateSkillVersionResponse };

async function handler(
  req: ApiRequestProps<UpdateSkillVersionBody>
): Promise<UpdateSkillVersionResponse> {
  const { skillId, versionId, versionName } = parseApiInput({
    req,
    bodySchema: UpdateSkillVersionBodySchema
  }).body;
  await authSkill({ skillId, req, per: WritePermissionVal, authToken: true, authApiKey: true });

  const result = await MongoAgentSkillsVersion.updateOne(
    { _id: versionId, skillId },
    { $set: { versionName } }
  );
  if (result.matchedCount === 0) {
    return Promise.reject(SkillErrEnum.invalidSkillId);
  }

  return;
}

export default NextAPI(handler);
