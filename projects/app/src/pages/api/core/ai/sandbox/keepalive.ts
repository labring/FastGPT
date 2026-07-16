import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { keepaliveSandboxSession } from '@fastgpt/service/core/ai/sandbox/interface/session';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { z } from 'zod';
import {
  authAgentSandboxProxy,
  buildSandboxClientQueryFromChatSource
} from '@/service/core/sandbox/auth';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';

const KeepAliveBaseBodySchema = z.object({
  userId: z.string(),
  chatId: z.string()
});
const KeepAliveBodySchema = KeepAliveBaseBodySchema.extend({
  sourceType: z.enum(ChatSourceTypeEnum),
  sourceId: z.string()
});

/**
 * 虚拟机沙盒 Proxy 专属内网保活 API
 *
 * 职责：
 * 1. 仅限内部 Proxy（agent-sandbox-proxy）持有正确的秘钥签名时调用。
 * 2. 校验通过后，直接对指定的应用和会话沙盒实例执行 ensureAvailable()，从而刷新实例的活跃时间。
 * 3. 避免暴露给外网客户端，提供极高安全性。
 */
async function handler(req: ApiRequestProps): Promise<void> {
  authAgentSandboxProxy(req);

  const { sourceType, sourceId, userId, chatId } = parseApiInput({
    req,
    bodySchema: KeepAliveBodySchema
  }).body;

  await keepaliveSandboxSession(
    buildSandboxClientQueryFromChatSource({
      sourceType,
      sourceId,
      userId,
      chatId
    })
  );
}

export default NextAPI(handler);
