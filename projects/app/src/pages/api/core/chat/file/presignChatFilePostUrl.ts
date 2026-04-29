import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import type { CreatePostPresignedUrlResponseType } from '@fastgpt/global/common/file/s3/type';
import { getS3ChatSource } from '@fastgpt/service/common/s3/sources/chat';
import { getAllowedExtensionsFromFileSelectConfig } from '@fastgpt/service/common/s3/utils/uploadConstraints';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { authFrequencyLimit } from '@fastgpt/service/common/system/frequencyLimit/utils';
import { addSeconds } from 'date-fns';
import { PresignChatFilePostUrlSchema } from '@fastgpt/global/openapi/core/chat/file/api';
import { getTeamPlanStatus } from '@fastgpt/service/support/wallet/sub/utils';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { S3ErrEnum } from '@fastgpt/global/common/error/code/s3';
import { MongoChatSetting } from '@fastgpt/service/core/chat/setting/schema';
import { env } from '@fastgpt/service/env';

async function handler(req: ApiRequestProps): Promise<CreatePostPresignedUrlResponseType> {
  const { filename, appId, chatId, outLinkAuthData, fileSelectConfig } =
    PresignChatFilePostUrlSchema.parse(req.body);

  const { teamId, uid } = await authChatCrud({
    req,
    authToken: true,
    authApiKey: true,
    appId,
    ...outLinkAuthData
  });

  const [planStatus, app] = await Promise.all([
    getTeamPlanStatus({ teamId }),
    MongoApp.findById(appId, 'chatConfig.fileSelectConfig').lean()
  ]);
  const effectiveFileSelectConfig = fileSelectConfig
    ? await (async () => {
        const isHomeApp = await MongoChatSetting.exists({ teamId, appId });

        if (!isHomeApp) {
          await authApp({
            req,
            authToken: true,
            appId,
            per: WritePermissionVal
          });
        }
        return fileSelectConfig;
      })()
    : app?.chatConfig?.fileSelectConfig;
  const allowedExtensions = getAllowedExtensionsFromFileSelectConfig(effectiveFileSelectConfig);

  if (!env.SKIP_FILE_TYPE_CHECK && allowedExtensions.length === 0) {
    return Promise.reject(S3ErrEnum.fileUploadDisabled);
  }

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
    allowedExtensions,
    maxFileSize: planStatus.standard?.maxUploadFileSize ?? global.feConfigs.uploadFileMaxSize
  });
}

export default NextAPI(handler);
