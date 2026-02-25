import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import type { GetHelperBotFilePreviewParamsType } from '@fastgpt/global/openapi/core/chat/helperBot/api';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { getS3HelperBotSource } from '@fastgpt/service/common/s3/sources/helperbot';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';

async function handler(req: ApiRequestProps<GetHelperBotFilePreviewParamsType>): Promise<string> {
  const { key } = req.body;
  const { userId } = await authCert({
    req,
    authToken: true
  });

  const { type, chatId, userId: uid, filename } = getS3HelperBotSource().parseKey(key);

  if (userId !== uid) {
    return Promise.reject(ChatErrEnum.unAuthChat);
  }

  return (await getS3HelperBotSource().createGetFileURL({ key, external: true })).url;
}

export default NextAPI(handler);
