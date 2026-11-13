import { authSandboxRuntimeSession } from './access';
import type { AuthSandboxSessionParams, SandboxSessionAuthResult } from './auth';
import { buildSandboxClientQueryFromChatSource } from '@fastgpt/service/core/ai/sandbox/application/runtime';
import {
  getSandboxClient,
  isRecoverableSandboxError,
  type SandboxClient
} from '@fastgpt/service/core/ai/sandbox/application/runtime/client';

type SandboxClientQuery = ReturnType<typeof buildSandboxClientQueryFromChatSource>;

/**
 * 统一完成 Sandbox 会话权限与产品可用性校验、构造归属查询条件、唤醒沙盒客户端，并在回调结束时释放底层连接。
 *
 * 快路径采用乐观直连；若执行期间发现远端容器丢失或 JuiceFS FUSE 断连且当前请求仍可安全重放，则自动自愈重建并重试一次。
 */
export async function withAuthorizedSandboxClient<T>(
  authParams: AuthSandboxSessionParams & {
    chatId: string;
    canRetry?: () => boolean;
  },
  fn: (ctx: {
    sandbox: SandboxClient;
    sandboxQuery: SandboxClientQuery;
    session: SandboxSessionAuthResult;
  }) => Promise<T>
): Promise<T> {
  const session = await authSandboxRuntimeSession(authParams);
  const sandboxQuery = buildSandboxClientQueryFromChatSource({
    sourceType: session.sourceType,
    sourceId: session.sourceId,
    userId: session.uid,
    chatId: authParams.chatId
  });
  const canRetryRequest = () => {
    if (authParams.canRetry && !authParams.canRetry()) {
      return false;
    }
    // Next.js 默认 bodyParser 会提前消费 req 流并置 readableEnded=true，此时 req.body 已就绪，仍可安全重放；
    // 仅关闭 bodyParser 的流式上传（如 upload）在原始请求流已被读取后不可重放。
    const { req } = authParams;
    const isRawBodyStream = req.body === undefined && req.method !== 'GET' && req.method !== 'HEAD';
    return !(isRawBodyStream && (req.readableEnded || req.readableDidRead));
  };
  const sandbox = await getSandboxClient(sandboxQuery);
  try {
    try {
      return await fn({ sandbox, sandboxQuery, session });
    } catch (error) {
      if (!isRecoverableSandboxError(error) || !canRetryRequest()) {
        throw error;
      }
      await sandbox.recover();
      return await fn({ sandbox, sandboxQuery, session });
    }
  } finally {
    await sandbox.close();
  }
}
