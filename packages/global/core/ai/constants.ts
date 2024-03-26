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
  toolCall = 'toolCall',
  queryExtension = 'queryExtension'
}
export const llmModelTypeFilterMap = {
  [LLMModelTypeEnum.all]: 'model',
  [LLMModelTypeEnum.classify]: 'usedInClassify',
  [LLMModelTypeEnum.extractFields]: 'usedInExtractFields',
  [LLMModelTypeEnum.toolCall]: 'usedInToolCall',
  [LLMModelTypeEnum.queryExtension]: 'usedInQueryExtension'
};

export enum EmbeddingTypeEnm {
  query = 'query',
  db = 'db'
}
