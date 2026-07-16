import type { ApiRequestProps } from '@fastgpt/next/types';
import { NextAPI } from '@/service/middleware/entry';
import { getS3ChatSource } from '@fastgpt/service/common/s3/sources/chat';
import { authChatTargetCrud } from '@/service/support/permission/auth/chat';
import { PresignChatFileGetUrlSchema } from '@fastgpt/global/openapi/core/chat/file/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { isAuthorizedChatFileS3Key } from '@fastgpt/service/common/s3/sources/chat/key';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';

async function handler(req: ApiRequestProps): Promise<string> {
  const { key, chatId, sourceType, sourceId, mode, outLinkAuthData } = parseApiInput({
    req,
    bodySchema: PresignChatFileGetUrlSchema
  }).body;

  const authRes = await authChatTargetCrud({
    req,
    authToken: true,
    authApiKey: true,
    sourceType,
    sourceId,
    chatId,
    outLinkAuthData
  });
  const resolvedSourceId = authRes.sourceId;

  if (
    !isAuthorizedChatFileS3Key({
      key,
      sourceType,
      sourceId: resolvedSourceId,
      uid: authRes.uid,
      chatId
    })
  ) {
    return Promise.reject(ChatErrEnum.unAuthChat);
  }

  const { url } = await getS3ChatSource().createGetChatFileURL({ key, external: true, mode });

  return url;
}

export default NextAPI(handler);
