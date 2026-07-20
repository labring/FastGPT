import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { getLLMModel } from '@fastgpt/service/core/ai/model/cache';

export const getChatModelNameListByModules = (nodes: StoreNodeItemType[]): string[] => {
  const modelList = nodes
    .map((item) => {
      // ⚠️ 热升级兼容：legacy-only 节点 input key 为 `model`（provider 模型名），
      // getter 兼容 name/id 输入（热升级技术分析 §6.3）
      const modelId =
        item.inputs.find((input) => input.key === NodeInputKeyEnum.aiModelId)?.value ??
        item.inputs.find((input) => input.key === 'model')?.value;
      return modelId ? getLLMModel(modelId)?.name : '';
    })
    .filter(Boolean);

  return Array.from(new Set(modelList)) as string[];
};
