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
  if (reference.modelId) {
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

/** 解析可用于视觉请求的规范化 LLM 配置。 */
export const getVlmModelData = (reference: ModelReferenceType): LLMSystemModelDataType => {
  const result = getLLMModelData(reference);
  if (!result.config.vision) throw modelNotFound();
  return result;
};

export const getDefaultChatTitleModelData = (): LLMSystemModelDataType | undefined => {
  const model = global?.systemDefaultModel.chatTitleLLM;
  return model?.isActive ? model : undefined;
};

export const isImageEmbeddingModel = (model?: EmbeddingSystemModelDataType) =>
  !!model?.config.vision;

/** 查找并复制规范化模型数据，供需要临时覆盖请求参数的调用方使用。 */
export const findModelData = (reference: ModelReferenceType) =>
  cloneDeep(resolveModelReference(reference));
