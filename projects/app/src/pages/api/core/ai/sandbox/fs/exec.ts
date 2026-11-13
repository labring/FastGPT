import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { withAuthorizedSandboxClient } from '@/service/core/sandbox/client';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { SandboxFsExecBodySchema } from '@fastgpt/global/openapi/core/ai/sandbox/api';
import type { ExecuteResult } from '@fastgpt/global/core/ai/sandbox/type';

/**
 * 在当前沙盒会话工作目录内执行单条非交互式命令。
 *
 * - 权限边界：要求会话具备 `WritePermissionVal`（普通 App 会话还需具备 App 写权限），与 `upstream/main` 一致；
 * - 超时边界：由 `SandboxFsExecBodySchema` 兜底默认 30s、上限 600s，并向上取整换算为秒传给底层 `sandbox.exec`，
 *   避免未传 `timeoutMs` 时回退到底层无上限等待导致 HTTP 连接长期挂起。
 */
async function handler(req: ApiRequestProps): Promise<ExecuteResult> {
  const {
    customUid,
    authProxy,
    sourceType,
    sourceId,
    chatId,
    command,
    timeoutMs,
    outLinkAuthData
  } = parseApiInput({
    req,
    bodySchema: SandboxFsExecBodySchema
  }).body;

  return withAuthorizedSandboxClient(
    {
      customUid,
      authProxy,
      req,
      sourceType,
      sourceId,
      chatId,
      outLinkAuthData,
      per: WritePermissionVal
    },
    ({ sandbox }) => {
      const timeoutSeconds = Math.ceil(timeoutMs / 1000);
      return sandbox.exec(command, timeoutSeconds);
    }
  );
}

export default NextAPI(handler);
