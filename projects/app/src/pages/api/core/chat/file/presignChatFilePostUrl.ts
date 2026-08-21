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
import { NodeInputKeyEnum, VariableInputEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import type { AppFileSelectConfigType } from '@fastgpt/global/core/app/type/config.schema';
import { WORKFLOW_BUILDER_CHAT_CONFIG } from '@fastgpt/global/core/workflow/builder/constants';

/**
 * 合并应用级文件上传配置和文件变量配置。
 * 文件变量可以独立声明允许的文件类型；发布后的上传授权必须同时识别这两种配置，
 * 否则工具运行页虽能渲染文件输入，预签名接口仍会误判为未开启文件上传。
 */
const getPublishedFileSelectConfig = ({
  chatConfig,
  nodes = []
}: {
  chatConfig?: {
    fileSelectConfig?: AppFileSelectConfigType;
    variables?: Array<
      AppFileSelectConfigType & { type?: VariableInputEnum; canLocalUpload?: boolean }
    >;
  };
  nodes?: Array<{
    flowNodeType?: string;
    inputs?: FlowNodeInputItemType[];
  }>;
}): AppFileSelectConfigType | undefined => {
  type FileInputConfig = AppFileSelectConfigType & { canLocalUpload?: boolean };

  const fileVariables: FileInputConfig[] =
    chatConfig?.variables?.filter(
      (item) => item.type === VariableInputEnum.file && item.canLocalUpload !== false
    ) ?? [];
  const pluginFileInputs: FileInputConfig[] = nodes
    .filter((node) => node.flowNodeType === FlowNodeTypeEnum.pluginInput)
    .flatMap((node) => node.inputs ?? [])
    .filter(
      (input) =>
        input.renderTypeList.includes(FlowNodeInputTypeEnum.fileSelect) &&
        input.canLocalUpload !== false
    );
  const formFileInputs: FileInputConfig[] = nodes
    .filter((node) => node.flowNodeType === FlowNodeTypeEnum.formInput)
    .flatMap((node) => node.inputs ?? [])
    .filter((input) => input.key === NodeInputKeyEnum.userInputForms && Array.isArray(input.value))
    .flatMap((input) => input.value as unknown[])
    .filter(
      (input): input is FileInputConfig & { type: FlowNodeInputTypeEnum } =>
        !!input &&
        typeof input === 'object' &&
        (input as { type?: unknown }).type === FlowNodeInputTypeEnum.fileSelect &&
        (input as FileInputConfig).canLocalUpload !== false
    );
  const localFileInputs = [...fileVariables, ...pluginFileInputs, ...formFileInputs];

  if (!localFileInputs.length) return chatConfig?.fileSelectConfig;

  return {
    ...chatConfig?.fileSelectConfig,
    canSelectFile:
      !!chatConfig?.fileSelectConfig?.canSelectFile ||
      localFileInputs.some((item) => item.canSelectFile ?? true),
    canSelectImg:
      !!chatConfig?.fileSelectConfig?.canSelectImg ||
      localFileInputs.some((item) => item.canSelectImg),
    canSelectVideo:
      !!chatConfig?.fileSelectConfig?.canSelectVideo ||
      localFileInputs.some((item) => item.canSelectVideo),
    canSelectAudio:
      !!chatConfig?.fileSelectConfig?.canSelectAudio ||
      localFileInputs.some((item) => item.canSelectAudio),
    canSelectCustomFileExtension:
      !!chatConfig?.fileSelectConfig?.canSelectCustomFileExtension ||
      localFileInputs.some((item) => item.canSelectCustomFileExtension),
    customFileExtensionList: [
      ...(chatConfig?.fileSelectConfig?.customFileExtensionList ?? []),
      ...localFileInputs.flatMap((item) => item.customFileExtensionList ?? [])
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

      const { chatConfig, nodes } = await getAppLatestVersion(authRes.sourceId, app);
      return getPublishedFileSelectConfig({ chatConfig, nodes });
    }

    if (authRes.sourceType === ChatSourceTypeEnum.chatAgentHelper) {
      return chatAgentHelperFileSelectConfig;
    }

    if (authRes.sourceType === ChatSourceTypeEnum.skillEdit) {
      return undefined;
    }

    if (authRes.sourceType === ChatSourceTypeEnum.workflowBuilder) {
      return WORKFLOW_BUILDER_CHAT_CONFIG.fileSelectConfig;
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
