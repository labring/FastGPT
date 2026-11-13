import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { withAuthorizedSandboxClient } from '@/service/core/sandbox/client';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { SandboxFsMkdirBodySchema } from '@fastgpt/global/openapi/core/ai/sandbox/api';
import { createSandboxSessionDirectory } from '@fastgpt/service/core/ai/sandbox/application/file';

/** 在当前沙盒会话目录内创建新目录。 */
async function handler(req: ApiRequestProps): Promise<void> {
  const { customUid, authProxy, sourceType, sourceId, chatId, path, outLinkAuthData } =
    parseApiInput({
      req,
      bodySchema: SandboxFsMkdirBodySchema
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
    ({ sandbox }) => createSandboxSessionDirectory(sandbox, path)
  );
}

export default NextAPI(handler);
