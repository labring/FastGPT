import { i18nT } from '../../common/i18n/utils';
import type { CompletionUsage, ReasoningEffort } from './llm/type';
import type {
  EmbeddingSystemModelDataType,
  LLMSystemModelDataType,
  STTSystemModelDataType
} from './model.schema';

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

export const defaultQAModels: LLMSystemModelDataType[] = [
  {
    type: ModelTypeEnum.llm,
    provider: 'OpenAI',
    model: 'gpt-5',
    name: 'gpt-5',
    modelId: '',
    isSystem: true,
    isCustom: false,
    charsPointsPrice: 0,
    config: {
      maxContext: 16000,
      maxResponse: 16000,
      quoteMaxToken: 13000,
      maxTemperature: 1.2,
      censor: false,
      vision: true,
      toolChoice: true,
      functionCall: false,
      defaultSystemChatPrompt: '',
      defaultConfig: {}
    }
  }
];

export const defaultVectorModels: EmbeddingSystemModelDataType[] = [
  {
    type: ModelTypeEnum.embedding,
    provider: 'OpenAI',
    model: 'text-embedding-3-small',
    name: 'Embedding-2',
    modelId: '',
    isSystem: true,
    isCustom: false,
    charsPointsPrice: 0,
    config: {
      defaultToken: 500,
      maxToken: 3000,
      weight: 100
    }
  }
];

export const defaultSTTModels: STTSystemModelDataType[] = [
  {
    type: ModelTypeEnum.stt,
    provider: 'OpenAI',
    model: 'whisper-1',
    name: 'whisper-1',
    modelId: '',
    isSystem: true,
    isCustom: false,
    charsPointsPrice: 0,
    config: {}
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

export const reasoningEffortList: { label: string; value: ReasoningEffort }[] = [
  { label: i18nT('common:reasoning_effort.default'), value: null },
  { label: i18nT('common:reasoning_effort.none'), value: 'none' },
  { label: i18nT('common:reasoning_effort.minimal'), value: 'minimal' },
  { label: i18nT('common:reasoning_effort.low'), value: 'low' },
  { label: i18nT('common:reasoning_effort.medium'), value: 'medium' },
  { label: i18nT('common:reasoning_effort.high'), value: 'high' },
  { label: i18nT('common:reasoning_effort.xhigh'), value: 'xhigh' }
];

export const completionFinishReasonMap = {
  error: i18nT('chat:completion_finish_error'),
  close: i18nT('chat:completion_finish_close'),
  abnormal_close: i18nT('chat:completion_finish_abnormal_close'),
  stop: i18nT('chat:completion_finish_stop'),
  length: i18nT('chat:completion_finish_length'),
  tool_calls: i18nT('chat:completion_finish_tool_calls'),
  content_filter: i18nT('chat:completion_finish_content_filter'),
  function_call: i18nT('chat:completion_finish_function_call'),
  null: i18nT('chat:completion_finish_null')
};
