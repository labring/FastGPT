import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import type { GetHelperBotFilePresignParamsType } from '@fastgpt/global/openapi/core/chat/helperBot/api';
import type { CreatePostPresignedUrlResult } from '@fastgpt/service/common/s3/type';
import { authHelperBotChatCrud } from '@/service/support/permission/auth/chat';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { getS3HelperBotSource } from '../../../../../../../../packages/service/common/s3/sources/helperbot/index';
import { authFrequencyLimit } from '@fastgpt/service/common/system/frequencyLimit/utils';
import { addSeconds } from 'date-fns';

export type getFilePresignQuery = {};

export type getFilePresignBody = GetHelperBotFilePresignParamsType;

export type getFilePresignResponse = CreatePostPresignedUrlResult;

const authUploadLimit = (tmbId: string) => {
  if (!global.feConfigs.uploadFileMaxAmount) return;
  return authFrequencyLimit({
    eventId: `${tmbId}-uploadfile`,
    maxAmount: global.feConfigs.uploadFileMaxAmount * 2,
    expiredTime: addSeconds(new Date(), 30) // 30s
  });
};

async function handler(
  req: ApiRequestProps<getFilePresignBody, getFilePresignQuery>,
  res: ApiResponseType<any>
): Promise<getFilePresignResponse> {
  const { type, chatId, filename } = req.body;

  const { userId } = await authCert({
    req,
    authToken: true
  });

  await authUploadLimit(userId);

  const data = await getS3HelperBotSource().createUploadFileURL({
    type,
    chatId,
    userId,
    filename
  });

  return data;
}

export default NextAPI(handler);
