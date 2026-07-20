import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';

export default async function setupModels() {
  const llmModel = {
    id: 'gpt-5',
    type: ModelTypeEnum.llm,
    model: 'gpt-5',
    name: 'gpt-5',
    avatar: 'gpt-5',
    isActive: true,
    isSystem: true,
    defaultSystemChatPrompt: undefined,
    fieldMap: undefined,
    defaultConfig: undefined,
    provider: 'OpenAI',
    functionCall: false,
    toolChoice: false,
    maxContext: 4096,
    maxResponse: 4096,
    quoteMaxToken: 2048
  };
  const embeddingModel = {
    id: 'text-embedding-ada-002',
    type: ModelTypeEnum.embedding,
    model: 'text-embedding-ada-002',
    name: 'text-embedding-ada-002',
    avatar: 'text-embedding-ada-002',
    isActive: true,
    isSystem: true,
    defaultConfig: undefined,
    defaultToken: 1,
    maxToken: 100,
    provider: 'OpenAI',
    weight: 1
  };

  // New id-keyed maps (the refactored cache reads these).
  global.systemModelIdMap = new Map<string, any>([
    [llmModel.id, llmModel],
    [embeddingModel.id, embeddingModel]
  ]);
  global.llmModelIdMap = new Map<string, any>([[llmModel.id, llmModel]]);
  global.embeddingModelIdMap = new Map<string, any>([[embeddingModel.id, embeddingModel]]);
  global.ttsModelIdMap = new Map();
  global.sttModelIdMap = new Map();
  global.reRankModelIdMap = new Map();

  global.systemDefaultModel = {
    llm: llmModel,
    embedding: embeddingModel,
    datasetTextLLM: llmModel,
    datasetImageLLM: llmModel,
    chatTitleLLM: llmModel,
    helperBotLLM: llmModel
  };
  global.systemModelList = [llmModel, embeddingModel];
  global.systemActiveModelList = [llmModel, embeddingModel];
}
