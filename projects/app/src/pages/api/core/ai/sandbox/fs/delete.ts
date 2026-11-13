import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { withAuthorizedSandboxClient } from '@/service/core/sandbox/client';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { SandboxFsDeleteBodySchema } from '@fastgpt/global/openapi/core/ai/sandbox/api';
import { deleteSandboxSessionEntry } from '@fastgpt/service/core/ai/sandbox/application/file';

/** 删除当前沙盒会话目录内的文件或目录。 */
async function handler(req: ApiRequestProps): Promise<void> {
  const { customUid, authProxy, sourceType, sourceId, chatId, path, outLinkAuthData } =
    parseApiInput({
      req,
      bodySchema: SandboxFsDeleteBodySchema
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
    ({ sandbox }) => deleteSandboxSessionEntry(sandbox, path)
  );
}

export default NextAPI(handler);
