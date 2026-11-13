import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { withAuthorizedSandboxClient } from '@/service/core/sandbox/client';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { SandboxFsMoveBodySchema } from '@fastgpt/global/openapi/core/ai/sandbox/api';
import { moveSandboxSessionEntry } from '@fastgpt/service/core/ai/sandbox/application/file';

/** 在当前沙盒会话目录内移动或重命名文件/目录。 */
async function handler(req: ApiRequestProps): Promise<void> {
  const { customUid, authProxy, sourceType, sourceId, chatId, from, to, outLinkAuthData } =
    parseApiInput({
      req,
      bodySchema: SandboxFsMoveBodySchema
    }).body;

  await withAuthorizedSandboxClient(
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
    ({ sandbox }) => moveSandboxSessionEntry(sandbox, { from, to })
  );
}

export default NextAPI(handler);
