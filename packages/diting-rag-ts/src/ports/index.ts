// src/ports/index.ts
// 接口统一导出

export type { LLMProvider } from './llm';
export { wrapProviderWithDefaults, resolveLLMCallOptions } from './llm';
export type { EmbeddingProvider, EmbedResult } from './embedding';
export type { RerankProvider, RerankResult } from './reranker';
export type {
  VectorSearchProvider,
  VectorSearchOptions,
  VectorSearchFilter,
  FullTextSearchProvider,
  FullTextSearchOptions,
  FullTextSearchFilter,
  MixedSearchProvider,
  MixedSearchOptions,
  WebSearchProvider,
  WebSearchOptions,
  SearchResult
} from './search';
export { createSearchResult } from './search';
export type { Logger, LoggerOptions } from './logger';
export { LogLevel, createLogger, createLoggerFromInstance } from './logger';
export type { DitingConfig, FallbackStrategy, RetryConfig } from './config';
export {
  DEFAULT_CONFIG,
  DEFAULT_FALLBACK_STRATEGY,
  DEFAULT_RETRY_CONFIG,
  mergeConfig
} from './config';
