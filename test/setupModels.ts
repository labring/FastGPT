import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { setModelTestSnapshot } from './modelCache';

export default async function setupModels() {
  // 测试静态目录对应空数据库的初始修订号；目录集成测试显式写入并刷新真实快照。
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

  setModelTestSnapshot({
    models: [llmModel, embeddingModel],
    revision: 0,
    defaultModels: {
      llm: llmModel,
      embedding: embeddingModel
    },
    configuredDefaultModelIds: {},
    version: 'test-catalog'
  });
}
