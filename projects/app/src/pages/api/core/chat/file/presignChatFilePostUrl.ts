import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import type { CreatePostPresignedUrlResonseType } from '@fastgpt/global/common/file/s3/type';
import { getS3ChatSource } from '@fastgpt/service/common/s3/sources/chat';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { authFrequencyLimit } from '@fastgpt/service/common/system/frequencyLimit/utils';
import { addSeconds } from 'date-fns';
import { PresignChatFilePostUrlSchema } from '@fastgpt/global/openapi/core/chat/file/api';
import { getTeamPlanStatus } from '@fastgpt/service/support/wallet/sub/utils';

async function handler(req: ApiRequestProps): Promise<CreatePostPresignedUrlResonseType> {
  const { filename, appId, chatId, outLinkAuthData } = PresignChatFilePostUrlSchema.parse(req.body);

  const { teamId, uid } = await authChatCrud({
    req,
    authToken: true,
    authApiKey: true,
    appId,
    ...outLinkAuthData
  });

  const planStatus = await getTeamPlanStatus({ teamId });
  await authFrequencyLimit({
    eventId: `${uid}-uploadfile`,
    maxAmount: planStatus.standard?.maxUploadFileCount || global.feConfigs.uploadFileMaxAmount,
    expiredTime: addSeconds(new Date(), 30) // 30s
  });

  return await getS3ChatSource().createUploadChatFileURL({
    appId,
    chatId,
    filename,
    uId: uid,
    maxFileSize: planStatus.standard?.maxUploadFileSize || global.feConfigs.uploadFileMaxSize
  });
}

export default NextAPI(handler);
