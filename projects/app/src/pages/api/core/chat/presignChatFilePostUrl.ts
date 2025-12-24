import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { type CreatePostPresignedUrlResult } from '@fastgpt/service/common/s3/type';
import { getS3ChatSource } from '@fastgpt/service/common/s3/sources/chat';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { authFrequencyLimit } from '@/service/common/frequencyLimit/api';
import { addSeconds } from 'date-fns';
import type { PresignChatFilePostUrlParams } from '@fastgpt/global/openapi/core/chat/controler/api';

const authUploadLimit = (tmbId: string) => {
  if (!global.feConfigs.uploadFileMaxAmount) return;
  return authFrequencyLimit({
    eventId: `${tmbId}-uploadfile`,
    maxAmount: global.feConfigs.uploadFileMaxAmount * 2,
    expiredTime: addSeconds(new Date(), 30) // 30s
  });
};

async function handler(
  req: ApiRequestProps<PresignChatFilePostUrlParams>
): Promise<CreatePostPresignedUrlResult> {
  const { filename, appId, chatId, outLinkAuthData } = req.body;

  const { uid } = await authChatCrud({
    req,
    authToken: true,
    authApiKey: true,
    appId,
    ...outLinkAuthData
  });
  await authUploadLimit(uid);

  return await getS3ChatSource().createUploadChatFileURL({ appId, chatId, filename, uId: uid });
}

export default NextAPI(handler);
