import type {
  LLMModelItemType,
  EmbeddingModelItemType
} from '@fastgpt/global/core/ai/model.schema';
import { ModelTypeEnum } from 'packages/global/core/ai/constants';

const mockLLMModel: LLMModelItemType = {
  id: 'mock-llm-id',
  type: ModelTypeEnum.llm,
  model: 'gpt-5',
  name: 'gpt-5',
  avatar: 'gpt-5',
  isActive: true,
  isDefault: true,
  isCustom: false,
  isShared: true,
  requestUrl: undefined,
  requestAuth: undefined,
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

const mockVLMModel: LLMModelItemType = {
  ...mockLLMModel,
  id: 'mock-vlm-id',
  model: 'gpt-5-vision',
  name: 'gpt-5-vision',
  avatar: 'gpt-5-vision',
  vision: true
};

const mockEmbeddingModel: EmbeddingModelItemType = {
  id: 'mock-embedding-id',
  type: ModelTypeEnum.embedding,
  model: 'text-embedding-ada-002',
  name: 'text-embedding-ada-002',
  avatar: 'text-embedding-ada-002',
  isActive: true,
  isDefault: true,
  isCustom: false,
  isShared: true,
  requestUrl: undefined,
  requestAuth: undefined,
  defaultConfig: undefined,
  defaultToken: 1,
  maxToken: 100,
  provider: 'OpenAI',
  weight: 1
};

export default async function setupModels() {
  global.systemModelIdMap = new Map<string, any>();
  global.llmModelIdMap = new Map<string, any>();
  global.embeddingModelIdMap = new Map<string, any>();
  global.ttsModelIdMap = new Map<string, any>();
  global.sttModelIdMap = new Map<string, any>();
  global.reRankModelIdMap = new Map<string, any>();

  global.llmModelIdMap.set('mock-llm-id', mockLLMModel);
  global.llmModelIdMap.set('mock-vlm-id', mockVLMModel);
  global.embeddingModelIdMap.set('mock-embedding-id', mockEmbeddingModel);
  global.systemModelIdMap.set('mock-llm-id', mockLLMModel);
  global.systemModelIdMap.set('mock-vlm-id', mockVLMModel);
  global.systemModelIdMap.set('mock-embedding-id', mockEmbeddingModel);

  global.systemDefaultModel = {
    llm: mockLLMModel,
    embedding: mockEmbeddingModel,
    datasetImageLLM: mockVLMModel
  };
  global.systemModelList = [mockLLMModel, mockVLMModel, mockEmbeddingModel];
  global.systemActiveModelList = [mockLLMModel, mockVLMModel, mockEmbeddingModel];
}
