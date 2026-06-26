import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authChatTargetCrud } from '@/service/support/permission/auth/chat';
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
import { buildChatSourceQuery } from '@fastgpt/service/core/chat/source';

async function handler(req: NextApiRequest, res: NextApiResponse): Promise<StopV2ChatResponse> {
  const {
    body: { sourceType, sourceId, chatId, outLinkAuthData }
  } = parseApiInput({ req, bodySchema: StopV2ChatSchema });

  await authChatTargetCrud({
    req,
    authToken: true,
    authApiKey: true,
    sourceType,
    sourceId,
    chatId,
    ...outLinkAuthData
  });

  // 设置停止状态
  await setAgentRuntimeStop({
    sourceType,
    sourceId,
    chatId
  });

  // 等待工作流完成 (最多等待 5 秒)
  await waitForWorkflowComplete({
    sourceType,
    sourceId,
    chatId,
    timeout: 5000
  });

  const chat = await MongoChat.findOne(
    { ...buildChatSourceQuery({ sourceType, sourceId }), chatId },
    'chatGenerateStatus'
  ).lean();
  const chatGenerateStatus = chat?.chatGenerateStatus ?? ChatGenerateStatusEnum.done;

  return StopV2ChatResponseSchema.parse({
    success: true,
    completed: chatGenerateStatus !== ChatGenerateStatusEnum.generating,
    chatGenerateStatus
  });
}

export default NextAPI(handler);
