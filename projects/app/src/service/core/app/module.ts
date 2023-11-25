import { FlowNodeTypeEnum } from '@fastgpt/global/core/module/node/constant';
import type { ModuleItemType } from '@fastgpt/global/core/module/type.d';

export const getChatModelNameListByModules = (modules: ModuleItemType[]): string[] => {
  const chatModules = modules.filter((item) => item.flowType === FlowNodeTypeEnum.chatNode);
  return chatModules
    .map((item) => {
      const model = item.inputs.find((input) => input.key === 'model')?.value;
      return global.chatModels.find((item) => item.model === model)?.name || '';
    })
    .filter(Boolean);
};
