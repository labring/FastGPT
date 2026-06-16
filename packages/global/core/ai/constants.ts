import { i18nT } from '../../common/i18n/utils';
import type { CompletionUsage } from './llm/type';
import type { LLMModelItemType, EmbeddingModelItemType, STTModelType } from './model.schema';

export const getLLMDefaultUsage = (): CompletionUsage => {
  return {
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0
  };
};

export enum ModelTypeEnum {
  llm = 'llm',
  embedding = 'embedding',
  tts = 'tts',
  stt = 'stt',
  rerank = 'rerank'
}

// Fallback defaults used only when no models are loaded from plugins or DB
export const defaultQAModels: LLMModelItemType[] = [
  {
    id: 'default-llm-gpt5',
    type: ModelTypeEnum.llm,
    provider: 'OpenAI',
    model: 'gpt-5',
    name: 'gpt-5',
    maxContext: 16000,
    maxResponse: 16000,
    quoteMaxToken: 13000,
    maxTemperature: 1.2,
    charsPointsPrice: 0,
    censor: false,
    vision: true,
    toolChoice: true,
    functionCall: false,
    defaultSystemChatPrompt: '',
    defaultConfig: {}
  }
];

export const defaultVectorModels: EmbeddingModelItemType[] = [
  {
    id: 'default-embedding-3-small',
    type: ModelTypeEnum.embedding,
    provider: 'OpenAI',
    model: 'text-embedding-3-small',
    name: 'Embedding-2',
    charsPointsPrice: 0,
    defaultToken: 500,
    maxToken: 3000,
    weight: 100
  }
];

export const defaultSTTModels: STTModelType[] = [
  {
    id: 'default-stt-whisper',
    type: ModelTypeEnum.stt,
    provider: 'OpenAI',
    model: 'whisper-1',
    name: 'whisper-1',
    charsPointsPrice: 0
  }
];

export const modelTypeList = [
  { label: i18nT('common:model.type.chat'), value: ModelTypeEnum.llm },
  { label: i18nT('common:model.type.embedding'), value: ModelTypeEnum.embedding },
  { label: i18nT('common:model.type.tts'), value: ModelTypeEnum.tts },
  { label: i18nT('common:model.type.stt'), value: ModelTypeEnum.stt },
  { label: i18nT('common:model.type.reRank'), value: ModelTypeEnum.rerank }
];

export enum ChatCompletionRequestMessageRoleEnum {
  'System' = 'system',
  'Developer' = 'developer',
  'User' = 'user',
  'Assistant' = 'assistant',
  'Function' = 'function',
  'Tool' = 'tool'
}

export enum ChatMessageTypeEnum {
  text = 'text',
  image_url = 'image_url'
}

export enum EmbeddingTypeEnm {
  query = 'query',
  db = 'db'
}

export const completionFinishReasonMap = {
  error: i18nT('chat:completion_finish_error'),
  close: i18nT('chat:completion_finish_close'),
  stop: i18nT('chat:completion_finish_stop'),
  length: i18nT('chat:completion_finish_length'),
  tool_calls: i18nT('chat:completion_finish_tool_calls'),
  content_filter: i18nT('chat:completion_finish_content_filter'),
  function_call: i18nT('chat:completion_finish_function_call'),
  null: i18nT('chat:completion_finish_null')
};

// 千问模型内置指令
export const QWEN_EMBEDDING_RERANK_INSTRUCTION = 'Given a web search query, retrieve relevant passages that answer the query';

/**
 * 若模型为 Qwen3 系列的向量或重排模型（前缀匹配 Qwen3-Embedding / Qwen3-Reranker），
 * 返回内置的默认指令，否则返回 undefined。
 * 该指令用于在查询时附加任务描述，提升检索效果。
 */
export function getQwenEmbeddingRerankInstruction(type: ModelTypeEnum, model: string): string | undefined {
  const modelId = model.trim();
  if (type === ModelTypeEnum.embedding && /^Qwen3-Embedding/i.test(modelId)) {
    return QWEN_EMBEDDING_RERANK_INSTRUCTION;
  }
  if (type === ModelTypeEnum.rerank && /^Qwen3-Reranker/i.test(modelId)) {
    return QWEN_EMBEDDING_RERANK_INSTRUCTION;
  }
  return undefined;
}
