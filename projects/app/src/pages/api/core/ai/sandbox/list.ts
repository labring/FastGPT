import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { authSandboxSession } from '@/service/core/sandbox/auth';
import { getSandboxClient } from '@fastgpt/service/core/ai/sandbox/service/runtime';
import {
  SandboxListBodySchema,
  type SandboxListResponse
} from '@fastgpt/global/openapi/core/ai/sandbox/api';
import { listSandboxDirectory } from '@/service/core/sandbox/fileService';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';

async function handler(req: ApiRequestProps): Promise<SandboxListResponse> {
  const { appId, chatId, path, outLinkAuthData } = parseApiInput({
    req,
    bodySchema: SandboxListBodySchema
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
  const files = await listSandboxDirectory(sandbox, path);
  return { files };
}

export default NextAPI(handler);
