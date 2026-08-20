import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { getLLMModel } from '@fastgpt/service/core/ai/model';

/** 从工作流主对话节点生成聊天页展示名称，不展示辅助模型资源。 */
export const getChatModelNameListByModules = (nodes: StoreNodeItemType[]): string[] => {
  const modelList = nodes
    .map((node) => {
      const model = node.inputs.find((input) => input.key === NodeInputKeyEnum.aiModel)?.value;
      return model ? getLLMModel(model)?.name : '';
    })
    .filter(Boolean);

  return Array.from(new Set(modelList));
};
