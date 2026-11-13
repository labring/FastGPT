import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { authAgentSandboxProxy } from '@/service/core/sandbox/auth';
import {
  SandboxKeepaliveBodySchema,
  type SandboxKeepaliveBody
} from '@fastgpt/global/openapi/core/ai/sandbox/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { keepaliveSandboxSessionsByIds } from '@fastgpt/service/core/ai/sandbox/interface/session';

/**
 * 面向 `opensandbox-proxy` 的内部批量保活接口。
 * 校验共享密钥后批量刷新运行态沙盒实例的 `lastActiveAt`，不唤醒已停止实例。
 */
async function handler(req: ApiRequestProps<SandboxKeepaliveBody>): Promise<void> {
  authAgentSandboxProxy(req);

  const { sandboxIds } = parseApiInput({
    req,
    bodySchema: SandboxKeepaliveBodySchema
  }).body;

  await keepaliveSandboxSessionsByIds(sandboxIds);
}

export default NextAPI(handler, {
  csrf: false
});
