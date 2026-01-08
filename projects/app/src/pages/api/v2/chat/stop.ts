import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import {
  setAgentRuntimeStop,
  waitForWorkflowComplete
} from '@fastgpt/service/core/workflow/dispatch/workflowStatus';
import {
  StopV2ChatSchema,
  type StopV2ChatResponse
} from '@fastgpt/global/openapi/core/chat/controler/api';

async function handler(req: NextApiRequest, res: NextApiResponse): Promise<StopV2ChatResponse> {
  const { appId, chatId, outLinkAuthData } = StopV2ChatSchema.parse(req.body);

  await authChatCrud({
    req,
    authToken: true,
    authApiKey: true,
    appId,
    chatId,
    ...outLinkAuthData
  });

  // 设置停止状态
  await setAgentRuntimeStop({
    appId,
    chatId
  });

  // 等待工作流完成 (最多等待 5 秒)
  await waitForWorkflowComplete({ appId, chatId, timeout: 5000 });

  return {
    success: true
  };
}

export default NextAPI(handler);
