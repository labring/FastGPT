import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { WORKFLOW_BUILDER_CHAT_CONFIG } from '@fastgpt/global/core/workflow/builder/constants';
import { createChatAgentHelperChatConfig } from '@fastgpt/global/core/ai/auxiliaryGeneration/chatAgentHelper';
import type { AppChatConfigType, AppSchemaType } from '@fastgpt/global/core/app/type';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { getAppLatestVersion } from '../app/version/controller';
import { MongoApp } from '../app/schema';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import type { ChatSourceParams } from './source';

/**
 * 解析聊天来源的基础配置，供初始化和上传授权共同使用。
 * App 读取发布版本；辅助生成使用独立配置，不继承目标工作流的运行前置条件。
 * 会话变量覆盖、文件变量合并及 Home Chat 上传白名单仍由各自操作处理。
 */
export const getChatSourceConfig = async ({
  sourceType,
  sourceId,
  app
}: ChatSourceParams & { app?: AppSchemaType }): Promise<{
  nodes: StoreNodeItemType[];
  chatConfig: AppChatConfigType;
}> => {
  if (sourceType === ChatSourceTypeEnum.app) {
    const sourceApp = app ?? (await MongoApp.findById(sourceId).lean());
    if (!sourceApp) throw AppErrEnum.unExist;
    const { nodes, chatConfig } = await getAppLatestVersion(sourceId, sourceApp);
    return { nodes, chatConfig };
  }

  const chatConfig = (() => {
    if (sourceType === ChatSourceTypeEnum.workflowBuilder) return WORKFLOW_BUILDER_CHAT_CONFIG;
    if (sourceType === ChatSourceTypeEnum.chatAgentHelper) return createChatAgentHelperChatConfig();
    if (sourceType === ChatSourceTypeEnum.skillEdit) {
      return {
        fileSelectConfig: {
          maxFiles: 10,
          canSelectFile: false,
          canSelectImg: false,
          customPdfParse: false,
          canSelectVideo: false,
          canSelectAudio: false,
          canSelectCustomFileExtension: false,
          customFileExtensionList: []
        }
      };
    }
    const exhaustiveCheck: never = sourceType;
    throw new Error(`Unsupported chat source type: ${exhaustiveCheck}`);
  })();
  return { nodes: [], chatConfig };
};
