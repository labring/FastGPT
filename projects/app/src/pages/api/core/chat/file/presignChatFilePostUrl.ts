import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { type CreatePostPresignedUrlResult } from '@fastgpt/service/common/s3/type';
import { getS3ChatSource } from '@fastgpt/service/common/s3/sources/chat';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { authFrequencyLimit } from '@fastgpt/service/common/system/frequencyLimit/utils';
import { addSeconds } from 'date-fns';
import type { PresignChatFilePostUrlParams } from '@fastgpt/global/openapi/core/chat/controler/api';
import { getTeamPlanStatus } from '@fastgpt/service/support/wallet/sub/utils';

async function handler(
  req: ApiRequestProps<PresignChatFilePostUrlParams>
): Promise<CreatePostPresignedUrlResult> {
  const { filename, appId, chatId, outLinkAuthData } = req.body;

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
    maxAmount:
      planStatus.standardConstants?.maxUploadFileCount || global.feConfigs.uploadFileMaxAmount,
    expiredTime: addSeconds(new Date(), 30) // 30s
  });

  return await getS3ChatSource().createUploadChatFileURL({
    appId,
    chatId,
    filename,
    uId: uid,
    maxFileSize:
      planStatus.standardConstants?.maxUploadFileSize || global.feConfigs.uploadFileMaxSize
  });
}

export default NextAPI(handler);
