import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/index.d';

export const getChatModelNameListByModules = (modules: StoreNodeItemType[]): string[] => {
  const chatModules = modules.filter((item) => item.flowNodeType === FlowNodeTypeEnum.chatNode);
  return chatModules
    .map((item) => {
      const model = item.inputs.find((input) => input.key === 'model')?.value;
      return global.llmModels.find((item) => item.model === model)?.name || '';
    })
    .filter(Boolean);
};
