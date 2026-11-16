import { i18nT } from '../../common/i18n/utils';
import type { I18nStringType } from '../../common/i18n/type';
import type { CompletionUsage, ReasoningEffort } from './llm/type';
import type { EmbeddingModelDataType, LLMModelDataType, STTModelDataType } from './model/schema';

/** 工具参数可能被输出上限截断时，回填给模型的未执行说明及重试指引。 */
export const LLM_TOOL_CALL_ARGUMENTS_TRUNCATED_RESPONSE: I18nStringType = {
  en: 'Tool not executed: the model reached its output token limit, so the tool arguments may be incomplete. No tools from this response were executed. Retry with shorter, complete arguments or split the task into smaller steps.',
  'zh-CN':
    '工具未执行：模型达到输出 token 上限，工具参数可能不完整。本次响应中的工具调用均未执行。请使用更短且完整的参数重试，或将任务拆分为更小的步骤。',
  'zh-Hant':
    '工具未執行：模型達到輸出 token 上限，工具參數可能不完整。本次回應中的工具呼叫均未執行。請使用更短且完整的參數重試，或將任務拆分為更小的步驟。',
  'ko-KR':
    '도구가 실행되지 않았습니다. 모델이 출력 토큰 한도에 도달하여 도구 인수가 불완전할 수 있습니다. 이 응답의 도구 호출은 모두 실행되지 않았습니다. 더 짧고 완전한 인수로 다시 시도하거나 작업을 더 작은 단계로 나누세요.'
};

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

/** 已安装模型实例的归属作用域；插件模板不属于模型实例，不使用该枚举。 */
export enum ModelScopeEnum {
  system = 'system',
  team = 'team'
}

export const defaultQAModels: LLMModelDataType[] = [
  {
    type: ModelTypeEnum.llm,
    provider: 'OpenAI',
    model: 'gpt-5',
    name: 'gpt-5',
    modelId: '',
    scope: ModelScopeEnum.system,
    pricing: { tiers: [] },
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

export const defaultVectorModels: EmbeddingModelDataType[] = [
  {
    type: ModelTypeEnum.embedding,
    provider: 'OpenAI',
    model: 'text-embedding-3-small',
    name: 'Embedding-2',
    modelId: '',
    scope: ModelScopeEnum.system,
    pricing: { unitPrice: 0 },
    config: {
      defaultToken: 500,
      maxToken: 3000,
      weight: 100
    }
  }
];

export const defaultSTTModels: STTModelDataType[] = [
  {
    type: ModelTypeEnum.stt,
    provider: 'OpenAI',
    model: 'gpt-transcribe',
    name: 'gpt-transcribe',
    modelId: '',
    scope: ModelScopeEnum.system,
    pricing: { unitPrice: 0 },
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
