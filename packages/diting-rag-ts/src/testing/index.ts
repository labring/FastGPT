// src/testing/index.ts
// 测试用 Mock providers 统一导出

import { MockLLMProvider } from '../adapters/mock/llm';
import { MockVectorSearchProvider } from '../adapters/mock/vector_search';
import { MockFullTextSearchProvider } from '../adapters/mock/full_text_search';
import { MockEmbeddingProvider } from '../adapters/mock/embedding';
import { MockRerankProvider } from '../adapters/mock/reranker';
import type { AgenticSearchProviders } from '../ports/agentic';
import type { MockLLMOptions } from '../adapters/mock/llm';

export { MockLLMProvider } from '../adapters/mock/llm';
export { MockVectorSearchProvider } from '../adapters/mock/vector_search';
export { MockFullTextSearchProvider } from '../adapters/mock/full_text_search';
export { MockEmbeddingProvider } from '../adapters/mock/embedding';
export { MockRerankProvider } from '../adapters/mock/reranker';

export type { MockLLMOptions } from '../adapters/mock/llm';

/**
 * 创建测试用 Mock Providers
 */
export function createMockProviders(options: {
  modelName?: string;
  apiKey?: string;
  endpoint?: string;
}): AgenticSearchProviders {
  const llmOptions: MockLLMOptions = {
    modelName: options.modelName || 'qwen3-80b',
    responseDelay: 100,
    shouldFail: false
  };

  return {
    llm: new MockLLMProvider(llmOptions),
    vectorSearch: new MockVectorSearchProvider(),
    fullTextSearch: new MockFullTextSearchProvider(),
    embed: new MockEmbeddingProvider(1536),
    reranker: new MockRerankProvider()
  } as unknown as AgenticSearchProviders;
}
