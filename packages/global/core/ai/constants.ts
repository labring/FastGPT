import { i18nT } from '../../../web/i18n/utils';
import type { CompletionUsage } from './type';
import type { LLMModelItemType, EmbeddingModelItemType, STTModelType } from './model';

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

export const defaultQAModels: LLMModelItemType[] = [
  {
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
    datasetProcess: true,
    toolChoice: true,
    functionCall: false,
    defaultSystemChatPrompt: '',
    defaultConfig: {}
  }
];

export const defaultVectorModels: EmbeddingModelItemType[] = [
  {
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
  'User' = 'user',
  'Assistant' = 'assistant',
  'Function' = 'function',
  'Tool' = 'tool'
}

export enum ChatMessageTypeEnum {
  text = 'text',
  image_url = 'image_url'
}

export enum LLMModelTypeEnum {
  all = 'all',
  classify = 'classify',
  extractFields = 'extractFields',
  toolCall = 'toolCall'
}
export const llmModelTypeFilterMap = {
  [LLMModelTypeEnum.all]: 'model',
  [LLMModelTypeEnum.classify]: 'usedInClassify',
  [LLMModelTypeEnum.extractFields]: 'usedInExtractFields',
  [LLMModelTypeEnum.toolCall]: 'usedInToolCall'
};

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
