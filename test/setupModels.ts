import { ModelTypeEnum } from 'packages/global/core/ai/model';
import { ModelProviderIdType } from 'packages/global/core/ai/provider';

export default async function setupModels() {
  global.llmModelMap = new Map<string, any>();
  global.llmModelMap.set('gpt-4o-mini', {
    type: ModelTypeEnum.llm,
    model: 'gpt-4o-mini',
    name: 'gpt-4o-mini',
    avatar: 'gpt-4o-mini',
    isActive: true,
    isDefault: true,
    isCustom: false,
    requestUrl: undefined,
    requestAuth: undefined,
    customCQPrompt: '',
    customExtractPrompt: '',
    defaultSystemChatPrompt: undefined,
    fieldMap: undefined,
    defaultConfig: undefined,
    provider: 'OpenAI' as ModelProviderIdType,
    functionCall: false,
    toolChoice: false,
    maxContext: 4096,
    maxResponse: 4096,
    quoteMaxToken: 2048
  });
  global.systemDefaultModel = {
    llm: {
      type: ModelTypeEnum.llm,
      model: 'gpt-4o-mini',
      name: 'gpt-4o-mini',
      avatar: 'gpt-4o-mini',
      isActive: true,
      isDefault: true,
      isCustom: false,
      requestUrl: undefined,
      requestAuth: undefined,
      customCQPrompt: '',
      customExtractPrompt: '',
      defaultSystemChatPrompt: undefined,
      fieldMap: undefined,
      defaultConfig: undefined,
      provider: 'OpenAI' as ModelProviderIdType,
      functionCall: false,
      toolChoice: false,
      maxContext: 4096,
      maxResponse: 4096,
      quoteMaxToken: 2048
    }
  };
}
