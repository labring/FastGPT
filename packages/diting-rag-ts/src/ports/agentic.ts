// src/ports/agentic.ts
// Agentic Search 统一 Provider 配置

import type { LLMProvider } from './llm';
import type { VectorSearchProvider, FullTextSearchProvider, MixedSearchProvider } from './search';
import type { EmbeddingProvider } from './embedding';
import type { RerankProvider } from './reranker';
import type { Logger } from './logger';

/**
 * Agentic Search 所需的所有 Provider
 */
export interface AgenticSearchProviders {
  llm: LLMProvider;
  vectorSearch: VectorSearchProvider;
  fullTextSearch: FullTextSearchProvider;
  mixedSearch?: MixedSearchProvider;
  embed: EmbeddingProvider;
  reranker?: RerankProvider;
  logger?: Logger;
}

/**
 * Agentic Search 内部配置
 */
export interface AgenticSearchConfig {
  searchMode?: 'embedding' | 'fullTextRecall' | 'mixedRecall';
  maxSearchRounds?: number;
  maxToolCalls?: number;
  maxSearchCalls?: number;
  maxIterations?: number;
  tokenBudget?: number;
  embeddingWeight?: number;
  similarity?: number;
  rerankTopK?: number;
  retrieveLimit?: number;
  answerMaxChunks?: number;
  answerMaxTokens?: number;
  enableShowReferences?: boolean;
  enableInfoGain?: boolean;
  infoGainThreshold?: number;
  infoGainMaxHistory?: number;
  searchOnly?: boolean;
}
