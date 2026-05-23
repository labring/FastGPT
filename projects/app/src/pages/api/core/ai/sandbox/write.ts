import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { authSandboxSession } from '@/service/core/sandbox/auth';
import { getSandboxClient } from '@fastgpt/service/core/ai/sandbox/service/runtime';
import {
  SandboxWriteBodySchema,
  type SandboxWriteResponse
} from '@fastgpt/global/openapi/core/ai/sandbox/api';
import { writeSandboxFile } from '@/service/core/sandbox/fileService';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';

async function handler(req: ApiRequestProps): Promise<SandboxWriteResponse> {
  const { appId, chatId, path, content, outLinkAuthData } = parseApiInput({
    req,
    bodySchema: SandboxWriteBodySchema
  }).body;

  const { uid, teamId } = await authSandboxSession({
    req,
    appId,
    chatId,
    outLinkAuthData,
    per: WritePermissionVal
  });

  const sandbox = await getSandboxClient({ appId, userId: uid, chatId, teamId });
  await sandbox.ensureAvailable();

  await writeSandboxFile(sandbox, path, content);
  return { success: true };
}

export default NextAPI(handler);
