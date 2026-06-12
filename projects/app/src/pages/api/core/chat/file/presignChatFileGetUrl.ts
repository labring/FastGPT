import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { getS3ChatSource } from '@fastgpt/service/common/s3/sources/chat';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { PresignChatFileGetUrlSchema } from '@fastgpt/global/openapi/core/chat/file/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { isAuthorizedChatFileS3Key } from '@fastgpt/service/common/s3/sources/chat/key';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';

async function handler(req: ApiRequestProps): Promise<string> {
  const { key, appId, mode, outLinkAuthData } = parseApiInput({
    req,
    bodySchema: PresignChatFileGetUrlSchema
  }).body;

  const authRes = await authChatCrud({
    req,
    authToken: true,
    authApiKey: true,
    appId,
    ...outLinkAuthData
  });

  if (!isAuthorizedChatFileS3Key({ key, appId, uid: authRes.uid })) {
    return Promise.reject(ChatErrEnum.unAuthChat);
  }

  const { url } = await getS3ChatSource().createGetChatFileURL({ key, external: true, mode });

  return url;
}

export default NextAPI(handler);
