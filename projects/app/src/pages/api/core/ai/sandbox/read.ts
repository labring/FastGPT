import type { NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { authSandboxSession } from '@/service/core/sandbox/auth';
import { getSandboxClient } from '@fastgpt/service/core/ai/sandbox/service/runtime';
import { SandboxReadBodySchema } from '@fastgpt/global/openapi/core/ai/sandbox/api';
import { getSandboxFileContent } from '@/service/core/sandbox/fileService';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';

async function handler(req: ApiRequestProps, res: NextApiResponse): Promise<void> {
  const { appId, chatId, path, outLinkAuthData } = parseApiInput({
    req,
    bodySchema: SandboxReadBodySchema
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

  const { content, contentType } = await getSandboxFileContent(sandbox, path, true);

  res.setHeader('Content-Type', contentType);
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self' data: blob:; script-src 'none'; style-src 'unsafe-inline' 'self';"
  );
  res.send(content);
}

export default NextAPI(handler);
