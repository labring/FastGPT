import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import {
  setAgentRuntimeStop,
  waitForWorkflowComplete
} from '@fastgpt/service/core/workflow/dispatch/workflowStatus';
import {
  StopV2ChatSchema,
  StopV2ChatResponseSchema,
  type StopV2ChatResponse
} from '@fastgpt/global/openapi/core/chat/controler/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { ChatGenerateStatusEnum } from '@fastgpt/global/core/chat/constants';

async function handler(req: NextApiRequest, res: NextApiResponse): Promise<StopV2ChatResponse> {
  const {
    body: { appId, chatId, outLinkAuthData }
  } = parseApiInput({ req, bodySchema: StopV2ChatSchema });

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

  const chat = await MongoChat.findOne({ appId, chatId }, 'chatGenerateStatus').lean();
  const chatGenerateStatus = chat?.chatGenerateStatus ?? ChatGenerateStatusEnum.done;

  return StopV2ChatResponseSchema.parse({
    success: true,
    completed: chatGenerateStatus !== ChatGenerateStatusEnum.generating,
    chatGenerateStatus
  });
}

export default NextAPI(handler);
