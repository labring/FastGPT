import { getModelHandle } from '@fastgpt/service/core/ai/model';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { isWorkflowSystemModelInput } from '@fastgpt/global/core/workflow/utils';

/** 获取一次目录后同步投影模型名称，缺失或停用引用只影响展示，不改变工作流本身。 */
export const getChatModelNameListByModules = async (
  nodes: StoreNodeItemType[]
): Promise<string[]> => {
  const modelHandle = await getModelHandle();
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
        return modelHandle.getLLMModelData({ modelId, model }, { optional: true })?.name ?? '';
      } catch {
        // chatModels 仅用于标题栏展示。动态、缺失或已停用模型不应阻断聊天初始化。
        return '';
      }
    })
    .filter(Boolean);

  return Array.from(new Set(modelList));
};
