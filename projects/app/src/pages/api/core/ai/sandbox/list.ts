import type { NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { getSandboxClient } from '@fastgpt/service/core/ai/sandbox/controller';
import {
  SandboxListBodySchema,
  type SandboxListResponse
} from '@fastgpt/global/openapi/core/ai/sandbox/api';
import { listSandboxDirectory } from '@/service/core/sandbox/fileService';

async function handler(
  req: ApiRequestProps,
  res: NextApiResponse<SandboxListResponse>
): Promise<SandboxListResponse> {
  const { appId, chatId, path, outLinkAuthData } = SandboxListBodySchema.parse(req.body);

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

  const files = await listSandboxDirectory(sandbox, path);
  return { files };
}

export default NextAPI(handler);
