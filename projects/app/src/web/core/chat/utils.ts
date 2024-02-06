import { FlowNodeTypeEnum } from '@fastgpt/global/core/module/node/constant';
import { ModuleItemType } from '@fastgpt/global/core/module/type.d';
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

export function checkChatSupportSelectFileByModules(modules: ModuleItemType[] = []) {
  const chatModules = modules.filter((item) => item.flowType === FlowNodeTypeEnum.chatNode);
  const models: string[] = chatModules.map(
    (item) => item.inputs.find((item) => item.key === 'model')?.value || ''
  );
  return checkChatSupportSelectFileByChatModels(models);
}
