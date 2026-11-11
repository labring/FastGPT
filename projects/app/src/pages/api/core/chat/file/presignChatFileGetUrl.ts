import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { getS3ChatSource } from '@fastgpt/service/common/s3/sources/chat';
import { authChatTargetCrud } from '@fastgpt/service/core/chat/auth';
import { PresignChatFileGetUrlSchema } from '@fastgpt/global/openapi/core/chat/file/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { isAuthorizedChatFileS3Key } from '@fastgpt/service/common/s3/sources/chat/key';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';

async function handler(req: ApiRequestProps): Promise<string> {
  const { customUid, authProxy, key, chatId, sourceType, sourceId, outLinkAuthData } =
    parseApiInput({
      req,
      bodySchema: PresignChatFileGetUrlSchema
    }).body;

  // 首次发消息前也可预览文件；后续 key 校验仍严格绑定应用、UID 和 chatId。
  const authRes = await authChatTargetCrud({
    allowMissingChat: true,
    customUid,
    authProxy,
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

  const { url } = await getS3ChatSource().createGetChatFileURL({ key, external: true });

  return url;
}

export default NextAPI(handler);
