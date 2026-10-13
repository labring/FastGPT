import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authChatTargetCrud } from '@/service/support/permission/auth/chat';
import { setAgentRuntimeStop } from '@fastgpt/service/core/workflow/dispatch/workflowStatus';
import {
  StopV2ChatSchema,
  StopV2ChatResponseSchema,
  type StopV2ChatResponse
} from '@fastgpt/global/openapi/core/chat/controler/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { ChatGenerateStatusEnum } from '@fastgpt/global/core/chat/constants';

async function handler(req: NextApiRequest, _res: NextApiResponse): Promise<StopV2ChatResponse> {
  const {
    body: { sourceType, sourceId, chatId, outLinkAuthData }
  } = parseApiInput({ req, bodySchema: StopV2ChatSchema });

  const authRes = await authChatTargetCrud({
    req,
    authToken: true,
    authApiKey: true,
    sourceType,
    sourceId,
    chatId,
    outLinkAuthData
  });
  const resolvedSourceId = authRes.sourceId;

  // Stop API 只负责可靠写入停止标记；客户端收到确认后会主动断开当前流。
  await setAgentRuntimeStop({
    sourceType,
    sourceId: resolvedSourceId,
    chatId
  });

  return StopV2ChatResponseSchema.parse({
    success: true,
    // 兼容旧客户端字段：接口不再等待后台收尾，因此不确认 completed。
    completed: false,
    chatGenerateStatus: ChatGenerateStatusEnum.generating
  });
}

export default NextAPI(handler);
