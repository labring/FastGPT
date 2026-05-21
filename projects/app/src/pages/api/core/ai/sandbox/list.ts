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
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

import { authSkill } from '@fastgpt/service/support/permission/skill/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';

async function handler(
  req: ApiRequestProps,
  res: NextApiResponse<SandboxListResponse>
): Promise<SandboxListResponse> {
  const { appId, chatId, path, outLinkAuthData } = parseApiInput({
    req,
    bodySchema: SandboxListBodySchema
  }).body;

  let uid: string;
  if (chatId === 'edit-debug') {
    const authResult = await authSkill({
      req,
      authToken: true,
      authApiKey: true,
      skillId: appId,
      per: ReadPermissionVal
    });
    uid = authResult.tmbId;
  } else {
    const authResult = await authChatCrud({
      req,
      authToken: true,
      authApiKey: true,
      appId,
      chatId,
      ...outLinkAuthData
    });
    uid = authResult.uid;
  }

  const sandbox = await getSandboxClient({ appId, userId: uid, chatId });
  await sandbox.ensureAvailable();
  const files = await listSandboxDirectory(sandbox, path);
  return { files };
}

export default NextAPI(handler);
