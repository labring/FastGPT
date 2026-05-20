import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { getS3ChatSource } from '@fastgpt/service/common/s3/sources/chat';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { PresignChatFileGetUrlSchema } from '@fastgpt/global/openapi/core/chat/file/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

async function handler(req: ApiRequestProps): Promise<string> {
  const { key, appId, mode, outLinkAuthData } = parseApiInput({
    req,
    bodySchema: PresignChatFileGetUrlSchema
  }).body;

  await authChatCrud({
    req,
    authToken: true,
    authApiKey: true,
    appId,
    ...outLinkAuthData
  });

  const { url } = await getS3ChatSource().createGetChatFileURL({ key, external: true, mode });

  return url;
}

export default NextAPI(handler);
