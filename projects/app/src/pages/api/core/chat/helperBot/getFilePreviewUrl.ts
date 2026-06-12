import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import {
  GetHelperBotFilePreviewParamsSchema,
  type GetHelperBotFilePreviewParamsType
} from '@fastgpt/global/openapi/core/chat/helperBot/api';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { getS3HelperBotSource } from '@fastgpt/service/common/s3/sources/helperbot';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { isAuthorizedHelperBotFileS3Key } from '@fastgpt/service/common/s3/sources/helperbot/key';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

async function handler(req: ApiRequestProps<GetHelperBotFilePreviewParamsType>): Promise<string> {
  const { key, mode } = parseApiInput({
    req,
    bodySchema: GetHelperBotFilePreviewParamsSchema
  }).body;

  const { userId } = await authCert({
    req,
    authToken: true
  });

  if (!isAuthorizedHelperBotFileS3Key({ key, userId })) {
    return Promise.reject(ChatErrEnum.unAuthChat);
  }

  return (await getS3HelperBotSource().createGetFileURL({ key, external: true, mode })).url;
}

export default NextAPI(handler);
