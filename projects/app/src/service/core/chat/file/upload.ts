import type { CreatePostPresignedUrlResponseType } from '@fastgpt/global/common/file/s3/type';
import { S3ErrEnum } from '@fastgpt/global/common/error/code/s3';
import type { AppFileSelectConfigType } from '@fastgpt/global/core/app/type/config.schema';
import type { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { getS3ChatSource } from '@fastgpt/service/common/s3/sources/chat';
import {
  getAllowedExtensionsFromFileSelectConfig,
  getUploadExtensionRulesFromFileSelectConfig
} from '@fastgpt/service/common/s3/utils/uploadConstraints';
import { authFrequencyLimit } from '@fastgpt/service/common/system/frequencyLimit/utils';
import { getTeamPlanStatus } from '@fastgpt/service/support/wallet/sub/utils';
import { addSeconds } from 'date-fns';

/**
 * 根据已经完成授权的聊天目标和可信文件选择配置签发上传 URL。
 * `fileSelectConfig` 必须由正式配置解析或草稿权限校验产生，不能直接使用未授权请求值。
 */
export const createAuthorizedChatFileUploadUrl = async ({
  sourceType,
  sourceId,
  chatId,
  teamId,
  uid,
  fileSelectConfig,
  filename,
  contentType,
  declaredExtension,
  declaredFilename,
  size
}: {
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  chatId: string;
  teamId: string;
  uid: string;
  fileSelectConfig?: AppFileSelectConfigType;
  filename: string;
  contentType?: string;
  declaredExtension?: string;
  declaredFilename?: string;
  size?: number;
}): Promise<CreatePostPresignedUrlResponseType> => {
  const allowedExtensions = getAllowedExtensionsFromFileSelectConfig(fileSelectConfig);
  const extensionRules = getUploadExtensionRulesFromFileSelectConfig(fileSelectConfig);

  // 上传开关属于授权策略，即使跳过内容类型检测也不能绕过。
  if (allowedExtensions.length === 0) {
    return Promise.reject(S3ErrEnum.fileUploadDisabled);
  }

  const planStatus = await getTeamPlanStatus({ teamId });
  await authFrequencyLimit({
    eventId: `${uid}-uploadfile`,
    maxAmount: planStatus.standard?.maxUploadFileCount || global.feConfigs.uploadFileMaxAmount,
    expiredTime: addSeconds(new Date(), 30)
  });

  return getS3ChatSource().createUploadChatFileURL({
    sourceType,
    sourceId,
    chatId,
    filename,
    contentType,
    declaredExtension,
    declaredFilename,
    size,
    uId: uid,
    allowedExtensions,
    extensionRules,
    maxFileSize: planStatus.standard?.maxUploadFileSize ?? global.feConfigs.uploadFileMaxSize
  });
};
