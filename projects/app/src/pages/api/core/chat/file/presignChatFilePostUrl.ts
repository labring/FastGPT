import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import type { CreatePostPresignedUrlResponseType } from '@fastgpt/global/common/file/s3/type';
import { authChatTargetCrud } from '@/service/support/permission/auth/chat';
import { PresignChatFilePostUrlSchema } from '@fastgpt/global/openapi/core/chat/file/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { getAppLatestVersion } from '@fastgpt/service/core/app/version/controller';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { chatAgentHelperFileSelectConfig } from '@fastgpt/global/core/ai/auxiliaryGeneration/chatAgentHelper';
import { createAuthorizedChatFileUploadUrl } from '@/service/core/chat/file/upload';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { homeChatFileSelectConfig } from '@fastgpt/global/core/chat/setting/constants';
import { MongoChatSetting } from '@fastgpt/service/core/chat/setting/schema';
import { VariableInputEnum } from '@fastgpt/global/core/workflow/constants';
import type { AppFileSelectConfigType } from '@fastgpt/global/core/app/type/config.schema';

/**
 * 合并应用级文件上传配置和文件变量配置。
 * 文件变量可以独立声明允许的文件类型；发布后的上传授权必须同时识别这两种配置，
 * 否则工具运行页虽能渲染文件输入，预签名接口仍会误判为未开启文件上传。
 */
const getPublishedFileSelectConfig = ({
  chatConfig
}: {
  chatConfig?: {
    fileSelectConfig?: AppFileSelectConfigType;
    variables?: Array<
      AppFileSelectConfigType & { type?: VariableInputEnum; canLocalUpload?: boolean }
    >;
  };
}): AppFileSelectConfigType | undefined => {
  const fileVariables = chatConfig?.variables?.filter(
    (item) => item.type === VariableInputEnum.file && item.canLocalUpload !== false
  );
  if (!fileVariables?.length) return chatConfig?.fileSelectConfig;

  return {
    ...chatConfig?.fileSelectConfig,
    canSelectFile:
      !!chatConfig?.fileSelectConfig?.canSelectFile ||
      fileVariables.some((item) => item.canSelectFile),
    canSelectImg:
      !!chatConfig?.fileSelectConfig?.canSelectImg ||
      fileVariables.some((item) => item.canSelectImg),
    canSelectVideo:
      !!chatConfig?.fileSelectConfig?.canSelectVideo ||
      fileVariables.some((item) => item.canSelectVideo),
    canSelectAudio:
      !!chatConfig?.fileSelectConfig?.canSelectAudio ||
      fileVariables.some((item) => item.canSelectAudio),
    canSelectCustomFileExtension:
      !!chatConfig?.fileSelectConfig?.canSelectCustomFileExtension ||
      fileVariables.some((item) => item.canSelectCustomFileExtension),
    customFileExtensionList: [
      ...(chatConfig?.fileSelectConfig?.customFileExtensionList ?? []),
      ...fileVariables.flatMap((item) => item.customFileExtensionList ?? [])
    ]
  };
};

async function handler(req: ApiRequestProps): Promise<CreatePostPresignedUrlResponseType> {
  const {
    filename,
    contentType,
    declaredExtension,
    declaredFilename,
    size,
    sourceType,
    sourceId,
    chatId,
    outLinkAuthData
  } = parseApiInput({
    req,
    bodySchema: PresignChatFilePostUrlSchema
  }).body;

  const authRes = await authChatTargetCrud({
    req,
    authToken: true,
    authApiKey: true,
    sourceType,
    sourceId,
    chatId,
    outLinkAuthData
  });

  const fileSelectConfig = await (async () => {
    if (authRes.sourceType === ChatSourceTypeEnum.app) {
      const app = await MongoApp.findById(authRes.sourceId).lean();
      if (!app) return Promise.reject(AppErrEnum.unExist);

      if (app.type === AppTypeEnum.hidden) {
        const isHomeApp = await MongoChatSetting.exists({
          teamId: authRes.teamId,
          appId: authRes.sourceId
        });
        if (isHomeApp) return homeChatFileSelectConfig;
      }

      const { chatConfig } = await getAppLatestVersion(authRes.sourceId, app);
      return getPublishedFileSelectConfig({ chatConfig });
    }

    if (authRes.sourceType === ChatSourceTypeEnum.chatAgentHelper) {
      return chatAgentHelperFileSelectConfig;
    }

    if (authRes.sourceType === ChatSourceTypeEnum.skillEdit) {
      return undefined;
    }

    const exhaustiveCheck: never = authRes.sourceType;
    throw new Error(`Unsupported chat source type: ${exhaustiveCheck}`);
  })();

  return createAuthorizedChatFileUploadUrl({
    sourceType: authRes.sourceType,
    sourceId: authRes.sourceId,
    chatId,
    teamId: authRes.teamId,
    uid: authRes.uid,
    fileSelectConfig,
    filename,
    contentType,
    declaredExtension,
    declaredFilename,
    size
  });
}

export default NextAPI(handler);
