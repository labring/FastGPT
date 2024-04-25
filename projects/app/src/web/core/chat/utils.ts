import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/index.d';
import { useSystemStore } from '@/web/common/system/useSystemStore';

export function checkChatSupportSelectFileByChatModels(models: string[] = []) {
  const llmModelList = useSystemStore.getState().llmModelList;

  for (const model of models) {
    const modelData = llmModelList.find((item) => item.model === model || item.name === model);
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
