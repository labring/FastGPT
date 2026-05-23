import { NextAPI } from '@/service/middleware/entry';
import { authSkill } from '@fastgpt/service/support/permission/skill/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import {
  setAgentRuntimeStop,
  shouldWorkflowStop,
  waitForWorkflowComplete
} from '@fastgpt/service/core/workflow/dispatch/workflowStatus';
import {
  SkillDebugSessionControlBodySchema,
  SkillDebugSessionStopResponseSchema,
  type SkillDebugSessionStopResponse
} from '@fastgpt/global/openapi/core/ai/skill/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { EDIT_DEBUG_SANDBOX_CHAT_ID } from '@fastgpt/service/core/ai/skill/edit/config';
import { ChatGenerateStatusEnum } from '@fastgpt/global/core/chat/constants';

async function handler(req: ApiRequestProps): Promise<SkillDebugSessionStopResponse> {
  const { skillId } = parseApiInput({
    req,
    bodySchema: SkillDebugSessionControlBodySchema
  }).body;

  await authSkill({
    req,
    authToken: true,
    authApiKey: true,
    skillId,
    per: ReadPermissionVal
  });

  const runtimeStatusParams = {
    appId: skillId,
    chatId: EDIT_DEBUG_SANDBOX_CHAT_ID
  };

  await setAgentRuntimeStop(runtimeStatusParams);

  await waitForWorkflowComplete({
    ...runtimeStatusParams,
    timeout: 5000
  });
  const completed = !(await shouldWorkflowStop(runtimeStatusParams));

  return SkillDebugSessionStopResponseSchema.parse({
    success: true,
    completed,
    chatGenerateStatus: completed ? ChatGenerateStatusEnum.done : ChatGenerateStatusEnum.generating
  });
}

export default NextAPI(handler);
