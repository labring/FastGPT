import { getModelDetail } from '@/web/core/ai/model/modelData';
import { getModelReferenceValue, isEmptyModelValue } from '@fastgpt/global/core/ai/modelReference';
import { workflowModelKeyMappings } from '@fastgpt/global/core/workflow/utils';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

/** 校验业务只读取实际引用的模型详情；共享 catalog 在 getter 内处理，不由 Context 预加载下发。 */
export const getWorkflowModelDetails = async (nodes: { data: FlowNodeItemType }[]) => {
  const references = new Map<string, { modelId?: string; model?: string }>();
  const add = (modelId: unknown, model: unknown) => {
    const value = getModelReferenceValue({ modelId, model });
    if (typeof value !== 'string' || isEmptyModelValue(value)) return;
    const reference = !isEmptyModelValue(modelId) ? { modelId: value } : { model: value };
    references.set(JSON.stringify(reference), reference);
  };
  /** Agent 内嵌知识库参数仍沿用相同键映射；不把任意文本或动态引用当成模型 ID。 */
  const inspectConfig = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(inspectConfig);
      return;
    }
    const config = value as Record<string, unknown>;
    for (const [legacyKey, modelIdKey] of workflowModelKeyMappings)
      add(config[modelIdKey], config[legacyKey]);
    add(config.modelId, config.model);
    Object.values(config).forEach(inspectConfig);
  };
  for (const { data } of nodes) {
    for (const [legacyKey, modelIdKey] of workflowModelKeyMappings) {
      const canonical = data.inputs.find((input) => input.key === modelIdKey);
      const legacy = data.inputs.find((input) => input.key === legacyKey);
      add(canonical?.value ?? canonical?.defaultValue, legacy?.value ?? legacy?.defaultValue);
    }
    for (const input of data.inputs) {
      if (input.renderTypeList.includes(FlowNodeInputTypeEnum.selectLLMModel)) {
        add(input.value ?? input.defaultValue, undefined);
      }
      inspectConfig(input.value);
    }
  }
  const models = await Promise.all([...references.values()].map(getModelDetail));
  return models.filter((model) => model !== undefined);
};
