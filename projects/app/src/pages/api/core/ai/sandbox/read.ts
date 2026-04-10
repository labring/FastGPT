import type { NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { getSandboxClient } from '@fastgpt/service/core/ai/sandbox/controller';
import { SandboxReadBodySchema } from '@fastgpt/global/openapi/core/ai/sandbox/api';
import { getSandboxFileContent } from '@/service/core/sandbox/fileService';

async function handler(req: ApiRequestProps, res: NextApiResponse): Promise<void> {
  const { appId, chatId, path, outLinkAuthData } = SandboxReadBodySchema.parse(req.body);

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

  const { content, contentType } = await getSandboxFileContent(sandbox, path, true);

  res.setHeader('Content-Type', contentType);
  res.send(content);
}

export default NextAPI(handler);
