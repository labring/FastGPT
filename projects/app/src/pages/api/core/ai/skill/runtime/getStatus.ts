import { NextAPI } from '@/service/middleware/entry';
import { authSkill } from '@fastgpt/service/support/permission/skill/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { SkillRuntimeBodySchema, type SkillRuntimeBody } from '@fastgpt/global/core/ai/skill/api';
import {
  SandboxRuntimeStatusResponseSchema,
  type SandboxRuntimeStatusResponse
} from '@fastgpt/global/core/ai/sandbox/type';
import { isValidObjectId } from 'mongoose';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';
import { AgentSkillCreationStatusEnum } from '@fastgpt/global/core/ai/skill/constants';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  getSkillEditRuntimeContext,
  getSkillEditRuntimeStatus
} from '@fastgpt/service/core/ai/sandbox/interface/skillEdit';

async function handler(
  req: ApiRequestProps<SkillRuntimeBody>
): Promise<SandboxRuntimeStatusResponse> {
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
  const status = await getSkillEditRuntimeStatus({ context });

  return SandboxRuntimeStatusResponseSchema.parse(status);
}

export default NextAPI(handler);
