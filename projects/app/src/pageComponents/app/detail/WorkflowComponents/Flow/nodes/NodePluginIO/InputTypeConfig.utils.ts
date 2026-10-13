import type { MyLLMModelItemType } from '@fastgpt/global/openapi/core/ai/model/api';

/** WorkflowTool 与全局变量的模型选择项统一以稳定 modelId 作为表单值。 */
export const getModelInputOptions = (models: Array<Pick<MyLLMModelItemType, 'modelId' | 'name'>>) =>
  models.map((model) => ({
    value: model.modelId,
    label: model.name
  }));
