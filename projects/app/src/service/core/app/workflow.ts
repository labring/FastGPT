import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node.d';

export const getChatModelNameListByModules = (nodes: StoreNodeItemType[]): string[] => {
  const modelList = nodes
    .map((item) => {
      const model = item.inputs.find((input) => input.key === NodeInputKeyEnum.aiModel)?.value;
      return global.llmModels.find((item) => item.model === model)?.name || '';
    })
    .filter(Boolean);

  return Array.from(new Set(modelList));
};
