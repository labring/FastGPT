import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import {
  setAgentRuntimeStop,
  waitForWorkflowComplete
} from '@fastgpt/service/core/workflow/dispatch/workflowStatus';
import { updateChatGenerateStatus } from '@fastgpt/service/core/chat/chatGenerateStatus';
import { ChatGenerateStatusEnum } from '@fastgpt/global/core/chat/constants';
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

  // 停止后标记为已完成，避免页面刷新时 resume 接口继续输出流式数据
  await updateChatGenerateStatus({ appId, chatId, status: ChatGenerateStatusEnum.done });

  return {
    success: true
  };
}

export default NextAPI(handler);
