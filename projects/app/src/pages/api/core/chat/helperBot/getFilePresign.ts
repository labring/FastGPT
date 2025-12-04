import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import type { GetHelperBotFilePresignParamsType } from '@fastgpt/global/openapi/core/chat/helperBot/api';
import type { CreatePostPresignedUrlResult } from '@fastgpt/service/common/s3/type';
import { authHelperBotChatCrud } from '@/service/support/permission/auth/chat';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { getS3HelperBotSource } from '../../../../../../../../packages/service/common/s3/sources/helperbot/index';

export type getFilePresignQuery = {};

export type getFilePresignBody = GetHelperBotFilePresignParamsType;

export type getFilePresignResponse = CreatePostPresignedUrlResult;

async function handler(
  req: ApiRequestProps<getFilePresignBody, getFilePresignQuery>,
  res: ApiResponseType<any>
): Promise<getFilePresignResponse> {
  const { type, chatId, filename } = req.body;

  const { userId } = await authCert({
    req,
    authToken: true
  });

  const data = await getS3HelperBotSource().createUploadFileURL({
    type,
    chatId,
    userId,
    filename
  });

  return data;
}

export default NextAPI(handler);
