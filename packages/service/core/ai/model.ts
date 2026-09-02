import { cloneDeep } from 'lodash-es';
import type {
  EmbeddingSystemModelDataType,
  LLMSystemModelDataType,
  ModelReferenceType,
  RerankSystemModelDataType,
  STTSystemModelDataType,
  SystemModelDataType,
  TTSSystemModelDataType
} from '@fastgpt/global/core/ai/model.schema';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { UserError } from '@fastgpt/global/common/error/utils';

const modelNotFound = () => new UserError(ModelErrEnum.unExist);

/**
 * 按稳定 ID 或旧 model 标识解析模型。只要传入 modelId 就禁止降级到 model，避免错误 ID
 * 静默命中另一个模型；不兼容裸字符串或展示名称 name。
 */
const resolveModelReference = (reference: ModelReferenceType): SystemModelDataType | undefined => {
  if (reference.modelId !== undefined) {
    return global.systemModelMap?.get(`id:${reference.modelId}`);
  }
  if (reference.model) {
    return global.systemModelMap?.get(`model:${reference.model}`);
  }
};

const getTypedModelData = <T extends SystemModelDataType>(
  reference: ModelReferenceType,
  type: T['type']
): T => {
  const model = resolveModelReference(reference);
  if (!model || model.type !== type || !model.isActive) throw modelNotFound();
  return model as T;
};

/**
 * 解析允许缺省的模型引用。只有 modelId 与旧 model 同时为空时返回 undefined；一旦提供
 * 任一引用，仍交给严格 getter 校验模型是否存在、启用且类型正确。
 */
const getOptionalModelData = <T extends SystemModelDataType>(
  reference: ModelReferenceType,
  getter: (reference: ModelReferenceType) => T
): T | undefined => {
  if (reference.modelId === undefined && reference.model === undefined) return;
  return getter(reference);
};

export const getLLMModelData = (reference: ModelReferenceType): LLMSystemModelDataType =>
  getTypedModelData(reference, ModelTypeEnum.llm);
export const getEmbeddingModelData = (
  reference: ModelReferenceType
): EmbeddingSystemModelDataType => getTypedModelData(reference, ModelTypeEnum.embedding);
export const getRerankModelData = (reference: ModelReferenceType): RerankSystemModelDataType =>
  getTypedModelData(reference, ModelTypeEnum.rerank);
export const getTTSModelData = (reference: ModelReferenceType): TTSSystemModelDataType =>
  getTypedModelData(reference, ModelTypeEnum.tts);
export const getSTTModelData = (reference: ModelReferenceType): STTSystemModelDataType =>
  getTypedModelData(reference, ModelTypeEnum.stt);

/** 缺省引用返回 undefined；非空引用仍按 LLM 的严格规则解析。 */
export const getOptionalLLMModelData = (
  reference: ModelReferenceType
): LLMSystemModelDataType | undefined => getOptionalModelData(reference, getLLMModelData);
/** 缺省引用返回 undefined；非空引用仍按 Embedding 模型的严格规则解析。 */
export const getOptionalEmbeddingModelData = (
  reference: ModelReferenceType
): EmbeddingSystemModelDataType | undefined =>
  getOptionalModelData(reference, getEmbeddingModelData);

const getDefaultModelData = <T extends SystemModelDataType>(
  model: SystemModelDataType | undefined,
  type: T['type']
): T => {
  if (!model || model.type !== type || !model.isActive) throw modelNotFound();
  return model as T;
};

export const getDefaultLLMModelData = (): LLMSystemModelDataType =>
  getDefaultModelData(global.systemDefaultModel.llm, ModelTypeEnum.llm);
export const getDefaultEmbeddingModelData = (): EmbeddingSystemModelDataType =>
  getDefaultModelData(global.systemDefaultModel.embedding, ModelTypeEnum.embedding);
export const getDefaultRerankModelData = (): RerankSystemModelDataType =>
  getDefaultModelData(global.systemDefaultModel.rerank, ModelTypeEnum.rerank);
export const getDefaultTTSModelData = (): TTSSystemModelDataType =>
  getDefaultModelData(global.systemDefaultModel.tts, ModelTypeEnum.tts);
export const getDefaultSTTModelData = (): STTSystemModelDataType =>
  getDefaultModelData(global.systemDefaultModel.stt, ModelTypeEnum.stt);

export const getDefaultVLMModelData = () => global.systemDefaultModel.datasetImageLLM;

/**
 * 返回按模型类型索引的有效系统默认模型 ID，供 Workflow 写入边界执行默认优先回退。
 * 默认模型已在模型配置加载阶段校验并按同类型 active 模型兜底；调用方仍需结合自己的候选列表复核。
 */
export const getSystemDefaultModelIds = (): Partial<Record<ModelTypeEnum, string>> => ({
  [ModelTypeEnum.llm]: global.systemDefaultModel.llm?.modelId,
  [ModelTypeEnum.embedding]: global.systemDefaultModel.embedding?.modelId,
  [ModelTypeEnum.tts]: global.systemDefaultModel.tts?.modelId,
  [ModelTypeEnum.stt]: global.systemDefaultModel.stt?.modelId,
  [ModelTypeEnum.rerank]: global.systemDefaultModel.rerank?.modelId
});

/** 解析可用于视觉请求的规范化 LLM 配置。 */
export const getVlmModelData = (reference: ModelReferenceType): LLMSystemModelDataType => {
  const result = getLLMModelData(reference);
  if (!result.config.vision) throw modelNotFound();
  return result;
};

/** 缺省引用返回 undefined；非空引用仍校验模型已启用且支持视觉。 */
export const getOptionalVlmModelData = (
  reference: ModelReferenceType
): LLMSystemModelDataType | undefined => getOptionalModelData(reference, getVlmModelData);

export const getDefaultChatTitleModelData = (): LLMSystemModelDataType | undefined => {
  const model = global?.systemDefaultModel.chatTitleLLM;
  return model?.isActive ? model : undefined;
};

export const isImageEmbeddingModel = (model?: EmbeddingSystemModelDataType) =>
  !!model?.config.vision;

/** 查找并复制规范化模型数据，供需要临时覆盖请求参数的调用方使用。 */
export const findModelData = (reference: ModelReferenceType) =>
  cloneDeep(resolveModelReference(reference));
