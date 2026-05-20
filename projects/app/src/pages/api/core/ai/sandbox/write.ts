import type { NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { authSandboxAccess } from '@/service/support/permission/auth/chat';
import { getSandboxClientByChat } from '@fastgpt/service/core/ai/sandbox/controller';
import {
  SandboxWriteBodySchema,
  type SandboxWriteResponse
} from '@fastgpt/global/openapi/core/ai/sandbox/api';
import { writeSandboxFile } from '@/service/core/sandbox/fileService';

async function handler(
  req: ApiRequestProps,
  _res: NextApiResponse<SandboxWriteResponse>
): Promise<SandboxWriteResponse> {
  const { appId, chatId, path, content, outLinkAuthData } = SandboxWriteBodySchema.parse(req.body);

  const result = await (async () => {
    try {
      return await authSandboxAccess({
        req,
        authToken: true,
        authApiKey: false,
        appId,
        chatId,
        outLinkAuthData
      });
    } catch (_tokenError) {
      try {
        return await authSandboxAccess({
          req,
          authToken: false,
          authApiKey: true,
          appId,
          chatId,
          outLinkAuthData
        });
      } catch (_apiKeyError) {
        throw new Error('Authentication failed: both token and API key auth rejected');
      }
    }
  })();
  const { uid } = result;

  const sandbox = await getSandboxClientByChat({ appId, userId: uid, chatId });
  await sandbox.ensureAvailable();

  await writeSandboxFile(sandbox, path, content);
  return { success: true };
}

export default NextAPI(handler);
