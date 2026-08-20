import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { isWorkflowSystemModelInput } from '@fastgpt/global/core/workflow/utils';
import { getOptionalLLMModelData } from '@fastgpt/service/core/ai/model';

/** 从工作流主对话节点生成聊天页展示名称，不展示辅助模型资源。 */
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

      try {
        return getOptionalLLMModelData({ modelId, model })?.name ?? '';
      } catch {
        // chatModels 仅用于标题栏展示。动态、缺失或已停用模型不应阻断聊天初始化。
        return '';
      }
    })
    .filter(Boolean);

  return Array.from(new Set(modelList));
};
