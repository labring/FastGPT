import type { NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { getSandboxClient } from '@fastgpt/service/core/ai/sandbox/controller';
import {
  SandboxWriteBodySchema,
  type SandboxWriteResponse
} from '@fastgpt/global/openapi/core/ai/sandbox/api';
import { writeSandboxFile } from '@/service/core/sandbox/fileService';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

async function handler(
  req: ApiRequestProps,
  res: NextApiResponse<SandboxWriteResponse>
): Promise<SandboxWriteResponse> {
  const { appId, chatId, path, content, outLinkAuthData } = parseApiInput({
    req,
    bodySchema: SandboxWriteBodySchema
  }).body;

  const { uid } = await authChatCrud({
    req,
    authToken: true,
    authApiKey: true,
    appId,
    chatId,
    ...outLinkAuthData
  });

  const sandbox = await getSandboxClient({ appId, userId: uid, chatId });
  await sandbox.ensureAvailable();

  await writeSandboxFile(sandbox, path, content);
  return { success: true };
}

export default NextAPI(handler);
