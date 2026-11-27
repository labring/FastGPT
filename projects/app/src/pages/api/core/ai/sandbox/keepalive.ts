import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { keepaliveSandboxSession } from '@fastgpt/service/core/ai/sandbox/interface/session';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authAgentSandboxProxy } from '@/service/core/sandbox/auth';
import { buildSandboxClientQueryFromChatSource } from '@fastgpt/service/core/ai/sandbox/interface/runtime';
import {
  SandboxKeepaliveBodySchema,
  type SandboxKeepaliveBody
} from '@fastgpt/global/openapi/core/ai/sandbox/api';

/**
 * 虚拟机沙盒 Proxy 专属内网保活 API
 *
 * 职责：
 * 1. 仅限内部 Proxy（agent-sandbox-proxy）持有正确的秘钥签名时调用。
 * 2. 校验通过后，仅对已运行的沙盒实例刷新活跃时间，不唤醒已停止或冷归档的实例。
 * 3. 避免暴露给外网客户端，提供极高安全性。
 */
async function handler(req: ApiRequestProps<SandboxKeepaliveBody>): Promise<void> {
  authAgentSandboxProxy(req);

  const { sourceType, sourceId, userId, chatId } = parseApiInput({
    req,
    bodySchema: SandboxKeepaliveBodySchema
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
