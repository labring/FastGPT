import { NextAPI } from '@/service/middleware/entry';
import { authSkill } from '@fastgpt/service/support/permission/skill/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import {
  SkillRuntimeBodySchema,
  SkillRuntimeStatusResponseSchema,
  type SkillRuntimeBody,
  type SkillRuntimeStatusResponse
} from '@fastgpt/global/core/ai/skill/api';
import { isValidObjectId } from 'mongoose';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';
import { AgentSkillCreationStatusEnum } from '@fastgpt/global/core/ai/skill/constants';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  getSkillEditRuntimeContext,
  triggerSkillEditRuntimeUpgrade
} from '@fastgpt/service/core/ai/sandbox/interface/skillEdit';

async function handler(
  req: ApiRequestProps<SkillRuntimeBody>
): Promise<SkillRuntimeStatusResponse> {
  const { skillId } = parseApiInput({ req, bodySchema: SkillRuntimeBodySchema }).body;

  if (!skillId || !isValidObjectId(skillId)) {
    return Promise.reject(SkillErrEnum.invalidSkillId);
  }

  const { teamId, tmbId, skill } = await authSkill({
    req,
    authToken: true,
    authApiKey: true,
    skillId,
    per: WritePermissionVal
  });

  if (skill.creationStatus !== AgentSkillCreationStatusEnum.ready || !skill.currentVersionId) {
    return Promise.reject(skill.creationError || SkillErrEnum.noStorage);
  }

  const context = await getSkillEditRuntimeContext({
    skillId,
    teamId,
    tmbId
  });
  const status = await triggerSkillEditRuntimeUpgrade({ context });

  return SkillRuntimeStatusResponseSchema.parse(status);
}

export default NextAPI(handler);
