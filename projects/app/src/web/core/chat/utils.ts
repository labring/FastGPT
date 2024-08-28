import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node.d';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { getWebLLMModel } from '@/web/common/system/utils';

export function checkChatSupportSelectFileByChatModels(models: string[] = []) {
  for (const model of models) {
    const modelData = getWebLLMModel(model);
    if (modelData?.vision) {
      return true;
    }
  }
  return false;
}

export function checkChatSupportSelectFileByModules(modules: StoreNodeItemType[] = []) {
  const chatModules = modules.filter(
    (item) =>
      item.flowNodeType === FlowNodeTypeEnum.chatNode ||
      item.flowNodeType === FlowNodeTypeEnum.tools
  );
  const models: string[] = chatModules.map(
    (item) => item.inputs.find((item) => item.key === 'model')?.value || ''
  );
  return checkChatSupportSelectFileByChatModels(models);
}

export function getAppQuestionGuidesByModules(modules: StoreNodeItemType[] = []) {
  const systemModule = modules.find((item) => item.flowNodeType === FlowNodeTypeEnum.systemConfig);
  const chatInputGuide = systemModule?.inputs.find(
    (item) => item.key === NodeInputKeyEnum.chatInputGuide
  )?.value;

  return chatInputGuide?.open ? chatInputGuide?.textList : [];
}

export function getAppQuestionGuidesByUserGuideModule(
  module: StoreNodeItemType,
  qGuideText: string[] = []
) {
  const chatInputGuide = module?.inputs.find(
    (item) => item.key === NodeInputKeyEnum.chatInputGuide
  )?.value;

  return chatInputGuide?.open ? qGuideText : [];
}
