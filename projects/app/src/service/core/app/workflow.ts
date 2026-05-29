import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { getLLMModelById } from '@fastgpt/service/core/ai/model';

export const getChatModelNameListByModules = (nodes: StoreNodeItemType[]): string[] => {
  const modelList = nodes
    .map((item) => {
      const modelId = item.inputs.find((input) => input.key === NodeInputKeyEnum.aiModelId)?.value;
      return modelId ? getLLMModelById(modelId)?.name : '';
    })
    .filter(Boolean);

  return Array.from(new Set(modelList));
};
