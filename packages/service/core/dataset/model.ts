import type { DatasetSchemaType } from '@fastgpt/global/core/dataset/type';
import { getEmbeddingModelData, getLLMModelData, getOptionalVlmModelData } from '../ai/model';

type DatasetModelFields = Pick<
  DatasetSchemaType,
  'vectorModelId' | 'vectorModel' | 'agentModelId' | 'agentModel' | 'vlmModelId' | 'vlmModel'
>;

const normalizeModelId = (modelId: unknown) =>
  modelId === undefined || modelId === null ? undefined : String(modelId);

/** 使用新 ID 字段优先解析知识库向量模型，并兼容历史 model 字段。 */
export const getDatasetEmbeddingModel = (dataset: Partial<DatasetModelFields>) =>
  getEmbeddingModelData({
    modelId: normalizeModelId(dataset.vectorModelId),
    model: dataset.vectorModel
  });

/** 使用新 ID 字段优先解析知识库处理模型，并兼容历史 model 字段。 */
export const getDatasetAgentModel = (dataset: Partial<DatasetModelFields>) =>
  getLLMModelData({
    modelId: normalizeModelId(dataset.agentModelId),
    model: dataset.agentModel
  });

/** VLM 允许不配置；一旦配置但无法解析，统一抛出“模型不存在”。 */
export const getDatasetVlmModel = (dataset: Partial<DatasetModelFields>) =>
  getOptionalVlmModelData({
    modelId: normalizeModelId(dataset.vlmModelId),
    model: dataset.vlmModel
  });
