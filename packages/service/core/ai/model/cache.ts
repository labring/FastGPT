import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { isObjectId } from '@fastgpt/global/common/string/utils';
import { type SystemModelItemType } from './type';
import type {
  EmbeddingModelItemType,
  LLMModelItemType,
  RerankModelItemType,
  STTModelType,
  TTSModelType
} from '@fastgpt/global/core/ai/model/type';

// ═══ Legacy-name fallback (hot-upgrade window, @deprecated) ═══
/**
 * @deprecated — legacy provider model 名/别名 → modelData 兼容解析（热升级窗口期，
 * contract release 移除）。
 *
 * Getters 没有 teamId/权限上下文，按 provider name 解析私有模型有跨团队泄露风险
 * （热升级分析 §4 行 210：无 teamId 时仅系统模型）——因此 name 兼容范围限定在
 * **系统模型**：私有模型必须用 id 引用。参数已是合法 ObjectId 时不做名称解析
 * （避免把 modelId 当名字查）。
 */
const resolveByLegacyName = <T extends { isSystem?: boolean }>(
  input: string,
  nameMap?: Map<string, T>
): T | undefined => {
  if (isObjectId(input)) return undefined;
  const model = nameMap?.get(input);
  return model?.isSystem ? model : undefined;
};

// ═══ Generic lookup: get any model type from systemModelIdMap by modelId ═══
export const getModelById = (modelIdOrName: string): SystemModelItemType | undefined => {
  const byId = global.systemModelIdMap.get(modelIdOrName);
  if (byId) return byId;
  // ⚠️ 热升级兼容：name 输入回退（仅系统模型，type 无关）
  return (
    resolveByLegacyName(modelIdOrName, global.llmModelNameMap) ??
    resolveByLegacyName(modelIdOrName, global.embeddingModelNameMap) ??
    resolveByLegacyName(modelIdOrName, global.ttsModelNameMap) ??
    resolveByLegacyName(modelIdOrName, global.sttModelNameMap) ??
    resolveByLegacyName(modelIdOrName, global.reRankModelNameMap)
  );
};

// ═══ Type-specific lookups (modelId → model data) ═══
/**
 * modelId → LLM model config. Includes disabled models (isActive === false) —
 * billing/management/history reads need them; call assertModelActive before
 * making external model calls (F2-S3-TC06).
 *
 * ⚠️ 热升级兼容：参数非 ObjectId 且 id map 未命中时，按 provider model 名/别名查
 * name 兼容索引（仅系统模型）；仍未命中返回 undefined。
 */
export const getLLMModel = (modelIdOrName: string): LLMModelItemType | undefined => {
  return (
    global.llmModelIdMap.get(modelIdOrName) ??
    resolveByLegacyName(modelIdOrName, global.llmModelNameMap)
  );
};

/**
 * modelId → Embedding model config. Includes disabled models (isActive === false) —
 * billing/management/history reads need them; call assertModelActive before
 * making external model calls (F2-S3-TC06).
 */
export const getEmbeddingModel = (modelIdOrName: string): EmbeddingModelItemType | undefined => {
  return (
    global.embeddingModelIdMap.get(modelIdOrName) ??
    resolveByLegacyName(modelIdOrName, global.embeddingModelNameMap)
  );
};

/**
 * modelId → TTS model config. Includes disabled models (isActive === false) —
 * billing/management/history reads need them; call assertModelActive before
 * making external model calls (F2-S3-TC06).
 */
export const getTTSModel = (modelIdOrName: string): TTSModelType | undefined => {
  return (
    global.ttsModelIdMap.get(modelIdOrName) ??
    resolveByLegacyName(modelIdOrName, global.ttsModelNameMap)
  );
};

/**
 * modelId → STT model config. Includes disabled models (isActive === false) —
 * billing/management/history reads need them; call assertModelActive before
 * making external model calls (F2-S3-TC06).
 */
export const getSTTModel = (modelIdOrName: string): STTModelType | undefined => {
  return (
    global.sttModelIdMap.get(modelIdOrName) ??
    resolveByLegacyName(modelIdOrName, global.sttModelNameMap)
  );
};

/**
 * modelId → Rerank model config. Includes disabled models (isActive === false) —
 * billing/management/history reads need them; call assertModelActive before
 * making external model calls (F2-S3-TC06).
 */
export const getRerankModel = (modelIdOrName: string): RerankModelItemType | undefined => {
  return (
    global.reRankModelIdMap.get(modelIdOrName) ??
    resolveByLegacyName(modelIdOrName, global.reRankModelNameMap)
  );
};

// ═══ Runtime guard: disabled models must never be called ═══
/**
 * Runtime guard (F2-S3-TC06): disabled models must not be called externally.
 * Invoke right after getXXXModel, before the external call; throws
 * ModelErrEnum.modelDisabled on disabled models (throwing inside an async
 * function is equivalent to reject).
 *
 * Note: getters deliberately return disabled models (billing/management/history
 * reads need them) — only the "effect boundary" (call site) must be guarded;
 * pure config reads must not call this. Endpoint-level existence + active
 * validation in one step uses assertModelUsable instead.
 */
export const assertModelActive = (modelData?: { isActive?: boolean }): void => {
  if (modelData?.isActive === false) {
    throw ModelErrEnum.modelDisabled;
  }
};

// ═══ Endpoint-level guard: fail fast at parameter validation ═══
/**
 * Endpoint/call-layer parameter validation (F2-S3-TC06): the model must exist
 * and be active, in one step. Use after getXXXModel — missing model throws
 * ModelErrEnum.unExist (overridable), disabled throws ModelErrEnum.modelDisabled
 * (overridable); on success returns the model with a narrowed non-null type.
 *
 * Division of labor vs assertModelActive: this validates existence + active in
 * one shot; assertModelActive guards the "effect boundary" where the caller
 * already handled not-found and only checks active (undefined passes, e.g. the
 * graceful degradation when no rerank is configured).
 */
export const assertModelUsable = <T extends { isActive?: boolean }>(
  modelData?: T,
  errorCode?: { notExist?: ModelErrEnum; disabled?: ModelErrEnum }
): T => {
  if (!modelData) {
    throw errorCode?.notExist ?? ModelErrEnum.unExist;
  }
  if (modelData.isActive === false) {
    throw errorCode?.disabled ?? ModelErrEnum.modelDisabled;
  }
  return modelData;
};

// ═══ VLM model lookup (LLM models with vision capability) ═══
export const getVlmModel = (modelIdOrName: string): LLMModelItemType | undefined => {
  const model = getLLMModel(modelIdOrName);
  if (model?.vision) return model;
  return undefined;
};

// ═══ Image embedding check ═══
export const isImageEmbeddingModel = (modelIdOrName: string): boolean => {
  const model = getEmbeddingModel(modelIdOrName);
  return !!model?.vision;
};

// ═══ Default model getters ═══
export const getDefaultLLMModel = (): LLMModelItemType | undefined => {
  return global?.systemDefaultModel.llm;
};

export const getDefaultEmbeddingModel = (): EmbeddingModelItemType | undefined => {
  return global?.systemDefaultModel.embedding;
};

export const getDefaultTTSModel = (): TTSModelType | undefined => {
  return global?.systemDefaultModel.tts;
};

export const getDefaultSTTModel = (): STTModelType | undefined => {
  return global?.systemDefaultModel.stt;
};

export const getDefaultRerankModel = (): RerankModelItemType | undefined => {
  return global?.systemDefaultModel.rerank;
};

export const getDefaultVLMModel = (): LLMModelItemType | undefined => {
  return global?.systemDefaultModel.datasetImageLLM;
};

export const getDefaultDatasetTextLLMModel = (): LLMModelItemType | undefined => {
  return global?.systemDefaultModel.datasetTextLLM;
};

export const getDefaultChatTitleModel = (): LLMModelItemType | undefined => {
  return global?.systemDefaultModel.chatTitleLLM;
};

export const getDefaultHelperBotModel = (): LLMModelItemType | undefined => {
  return global?.systemDefaultModel.helperBotLLM;
};
