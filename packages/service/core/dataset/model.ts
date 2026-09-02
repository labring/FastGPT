import type { DatasetSchemaType } from '@fastgpt/global/core/dataset/type';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import {
  findModelData,
  getEmbeddingModelData,
  getLLMModelData,
  getOptionalVlmModelData
} from '../ai/model';

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

/**
 * 解析知识库向量模型的展示数据。展示态允许返回已停用模型，模型缺失或类型不匹配时返回 undefined；
 * 训练和检索链路仍必须使用 getDatasetEmbeddingModel 做严格校验。
 */
export const findDatasetEmbeddingModel = (dataset: Partial<DatasetModelFields>) => {
  const model = findModelData({
    modelId: normalizeModelId(dataset.vectorModelId),
    model: dataset.vectorModel
  });
  return model?.type === ModelTypeEnum.embedding ? model : undefined;
};

/** 展示态解析知识库处理模型；允许展示已停用模型，但不接受错误模型类型。 */
export const findDatasetAgentModel = (dataset: Partial<DatasetModelFields>) => {
  const model = findModelData({
    modelId: normalizeModelId(dataset.agentModelId),
    model: dataset.agentModel
  });
  return model?.type === ModelTypeEnum.llm ? model : undefined;
};

/** 展示态解析知识库图片理解模型；已停用模型可展示，非视觉模型按不可用处理。 */
export const findDatasetVlmModel = (dataset: Partial<DatasetModelFields>) => {
  const model = findModelData({
    modelId: normalizeModelId(dataset.vlmModelId),
    model: dataset.vlmModel
  });
  return model?.type === ModelTypeEnum.llm && model.config.vision ? model : undefined;
};
