import { NextAPI } from '@/service/middleware/entry';
import { authSkill } from '@fastgpt/service/support/permission/agentSkill/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import {
  setAgentRuntimeStop,
  waitForWorkflowComplete
} from '@fastgpt/service/core/workflow/dispatch/workflowStatus';
import {
  SkillDebugSessionControlBodySchema,
  SkillDebugSessionStopResponseSchema,
  type SkillDebugSessionStopResponse
} from '@fastgpt/global/openapi/core/agentSkills/api';

async function handler(req: ApiRequestProps): Promise<SkillDebugSessionStopResponse> {
  const { skillId, chatId } = SkillDebugSessionControlBodySchema.parse(req.body);

  await authSkill({
    req,
    authToken: true,
    authApiKey: true,
    skillId,
    per: ReadPermissionVal
  });

  await setAgentRuntimeStop({
    appId: skillId,
    chatId
  });

  await waitForWorkflowComplete({ appId: skillId, chatId, timeout: 5000 });

  return SkillDebugSessionStopResponseSchema.parse({
    success: true
  });
}

export default NextAPI(handler);
