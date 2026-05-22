import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { authSandboxSession } from '@/service/core/sandbox/auth';
import { getSandboxClient } from '@fastgpt/service/core/ai/sandbox/service/runtime';
import {
  SandboxListRecursiveBodySchema,
  SandboxListRecursiveResponseSchema,
  type SandboxListRecursiveResponse
} from '@fastgpt/global/openapi/core/ai/sandbox/api';
import { listSandboxDirectoryRecursive } from '@/service/core/sandbox/fileService';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';

async function handler(req: ApiRequestProps): Promise<SandboxListRecursiveResponse> {
  const { appId, chatId, path, outLinkAuthData, excludeNames, maxDepth } = parseApiInput({
    req,
    bodySchema: SandboxListRecursiveBodySchema
  }).body;

  const { uid, teamId } = await authSandboxSession({
    req,
    appId,
    chatId,
    outLinkAuthData,
    per: ReadPermissionVal
  });

  const sandbox = await getSandboxClient({ appId, userId: uid, chatId, teamId });
  await sandbox.ensureAvailable();

  const result = await listSandboxDirectoryRecursive(sandbox, path, {
    excludeNames,
    maxDepth
  });

  return SandboxListRecursiveResponseSchema.parse(result);
}

export default NextAPI(handler);
