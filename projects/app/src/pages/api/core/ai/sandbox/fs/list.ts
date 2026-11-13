import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { withAuthorizedSandboxClient } from '@/service/core/sandbox/client';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  SandboxFsListBodySchema,
  SandboxFsListResponseSchema,
  type SandboxFsListResponse
} from '@fastgpt/global/openapi/core/ai/sandbox/api';
import { getAgentSandboxMaxFileBytes } from '@fastgpt/service/core/ai/sandbox/config';
import { listSandboxSessionDirectory } from '@fastgpt/service/core/ai/sandbox/application/file';

/** 单层（depth=1）列出沙盒当前会话工作目录下的指定目录。 */
async function handler(req: ApiRequestProps): Promise<SandboxFsListResponse> {
  const { customUid, authProxy, sourceType, sourceId, chatId, path, outLinkAuthData } =
    parseApiInput({
      req,
      bodySchema: SandboxFsListBodySchema
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
      per: ReadPermissionVal
    },
    async ({ sandbox }) => {
      const entries = await listSandboxSessionDirectory(sandbox, path);
      const { sessionWorkDirectory } = sandbox.getRuntimePaths();

      return SandboxFsListResponseSchema.parse({
        entries,
        maxFileBytes: getAgentSandboxMaxFileBytes(),
        sessionWorkDirectory
      });
    }
  );
}

export default NextAPI(handler);
