import { i18nT } from '../../../web/i18n/utils';
import type { CompletionUsage } from './type';

export const getLLMDefaultUsage = (): CompletionUsage => {
  return {
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0
  };
};

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
