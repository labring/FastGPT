import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';

export default async function setupModels() {
  const llmModel = {
    modelId: '68ad85a7463006c963799a68',
    type: ModelTypeEnum.llm,
    model: 'gpt-5',
    name: 'gpt-5',
    avatar: 'gpt-5',
    isActive: true,
    isDefault: true,
    scope: 'system' as const,
    requestUrl: undefined,
    requestAuth: undefined,
    provider: 'OpenAI',
    config: {
      defaultSystemChatPrompt: undefined,
      fieldMap: undefined,
      defaultConfig: undefined,
      functionCall: false,
      toolChoice: false,
      maxContext: 4096,
      maxResponse: 4096,
      quoteMaxToken: 2048
    }
  };
  const embeddingModel = {
    modelId: '68ad85a7463006c963799a69',
    type: ModelTypeEnum.embedding,
    model: 'text-embedding-ada-002',
    name: 'text-embedding-ada-002',
    avatar: 'text-embedding-ada-002',
    isActive: true,
    isDefault: true,
    scope: 'system' as const,
    requestUrl: undefined,
    requestAuth: undefined,
    provider: 'OpenAI',
    config: {
      defaultConfig: undefined,
      defaultToken: 1,
      maxToken: 100,
      weight: 1
    }
  };

  global.systemDefaultModel = {
    llm: llmModel,
    embedding: embeddingModel
  };
  global.systemModelList = [llmModel, embeddingModel];
  global.systemActiveModelList = [llmModel, embeddingModel];
  global.systemModelMap = new Map([
    [`id:${llmModel.modelId}`, llmModel],
    [`model:${llmModel.model}`, llmModel],
    [`id:${embeddingModel.modelId}`, embeddingModel],
    [`model:${embeddingModel.model}`, embeddingModel]
  ]);
}
