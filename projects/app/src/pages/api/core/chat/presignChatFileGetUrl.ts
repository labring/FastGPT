import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { getS3ChatSource } from '@fastgpt/service/common/s3/sources/chat';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import type { PresignChatFileGetUrlParams } from '@fastgpt/global/openapi/core/chat/controler/api';

async function handler(req: ApiRequestProps<PresignChatFileGetUrlParams>): Promise<string> {
  const { key, appId, outLinkAuthData } = req.body;

  await authChatCrud({
    req,
    authToken: true,
    authApiKey: true,
    appId,
    ...outLinkAuthData
  });

  return await getS3ChatSource().createGetChatFileURL({ key, external: true });
}

export default NextAPI(handler);
