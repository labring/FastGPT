import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { isWorkflowSystemModelInput } from '@fastgpt/global/core/workflow/utils';
import { getOptionalLLMModelData } from '@fastgpt/service/core/ai/model';

export const getChatModelNameListByModules = (nodes: StoreNodeItemType[]): string[] => {
  const modelList = nodes
    .map((item) => {
      const modelIdInput = item.inputs.find(
        (input) =>
          input.key === NodeInputKeyEnum.aiModelId &&
          isWorkflowSystemModelInput({ node: item, input })
      );
      const modelInput = item.inputs.find(
        (input) =>
          input.key === NodeInputKeyEnum.aiModel &&
          isWorkflowSystemModelInput({ node: item, input })
      );
      const modelId = modelIdInput?.value;
      const model = modelInput?.value;
      return getOptionalLLMModelData({ modelId, model })?.name ?? '';
    })
    .filter(Boolean);

  return Array.from(new Set(modelList));
};
