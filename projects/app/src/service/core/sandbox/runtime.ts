import { authSandboxRuntimeSession } from './access';
import type { AuthSandboxSessionParams, SandboxSessionAuthResult } from './auth';
import { buildSandboxClientQueryFromChatSource } from '@fastgpt/service/core/ai/sandbox/interface/runtime';
import {
  getSandboxClient,
  type SandboxClient
} from '@fastgpt/service/core/ai/sandbox/application/runtime/client';

/**
 * 统一完成 Sandbox Session 鉴权、产品可用性校验，并返回目标沙盒客户端与解析后的查询上下文。
 */
export async function getAuthorizedSandboxClient(authParams: AuthSandboxSessionParams): Promise<{
  session: SandboxSessionAuthResult;
  sandboxQuery: ReturnType<typeof buildSandboxClientQueryFromChatSource>;
  sandbox: SandboxClient;
}> {
  const session = await authSandboxRuntimeSession(authParams);
  const sandboxQuery = buildSandboxClientQueryFromChatSource({
    sourceType: session.sourceType,
    sourceId: session.sourceId,
    userId: session.uid,
    chatId: authParams.chatId
  });
  const sandbox = await getSandboxClient(sandboxQuery);

  return { session, sandboxQuery, sandbox };
}
