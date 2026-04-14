// src/adapters/builtIn/providers.ts
// Built-in Providers 统一工厂 - 一次性创建所有 providers 并注入 logger

import type { Logger } from '../../ports/logger';
import type { AgenticSearchProviders } from '../../ports/agentic';
import { createBuiltInLLMProvider, type BuiltInLLMConfig } from './llm/wrappers';
import { createBuiltInEmbeddingProvider, type BuiltInEmbeddingConfig } from './embedding/wrappers';
import { createBuiltInVectorSearchProvider, type PGVectorConfig } from './pgvector/wrappers';
import { createBuiltInFullTextSearchProvider, type MongoDBConfig } from './mongodb/wrappers';
import { createBuiltInRerankProvider, type BuiltInRerankConfig } from './reranker/wrappers';
import { createBuiltInMixedSearchProvider } from './mixed/index';
import { createLogger, LogLevel } from '../../ports/logger';

export interface BuiltInProvidersOptions {
  /** Logger 实例，如果不提供则创建默认 logger */
  logger?: Logger;
  /** Logger 级别，默认 info */
  loggerLevel?: 'debug' | 'info' | 'warn' | 'error';
  /** Logger 前缀，默认 AgenticRAG */
  loggerPrefix?: string;
  /** LLM 配置 */
  llm?: BuiltInLLMConfig;
  /** Embedding 配置 */
  embedding?: BuiltInEmbeddingConfig;
  /** Vector Search 配置 (PGVector) */
  vectorSearch?: PGVectorConfig;
  /** Full Text Search 配置 (MongoDB) */
  fullTextSearch?: MongoDBConfig;
  /** Reranker 配置 */
  reranker?: BuiltInRerankConfig;
}

/**
 * 创建所有 Built-in Providers（统一入口）
 * 方便自测和日志集成
 */
export function createBuiltInProviders(
  options: BuiltInProvidersOptions = {}
): AgenticSearchProviders {
  const {
    logger,
    loggerLevel = 'info',
    loggerPrefix = 'AgenticRAG',
    llm,
    embedding,
    vectorSearch,
    fullTextSearch,
    reranker
  } = options;

  // 创建默认 logger（如果未提供）
  let resolvedLogger = logger;
  if (!resolvedLogger) {
    const level =
      loggerLevel === 'debug'
        ? LogLevel.DEBUG
        : loggerLevel === 'warn'
          ? LogLevel.WARN
          : loggerLevel === 'error'
            ? LogLevel.ERROR
            : LogLevel.INFO;
    resolvedLogger = createLogger({ level, prefix: loggerPrefix });
  }

  const vectorSearchProvider = createBuiltInVectorSearchProvider(vectorSearch, resolvedLogger);
  const fullTextSearchProvider = createBuiltInFullTextSearchProvider(
    fullTextSearch,
    resolvedLogger
  );

  return {
    llm: createBuiltInLLMProvider(llm, resolvedLogger),
    embed: createBuiltInEmbeddingProvider(embedding, resolvedLogger),
    vectorSearch: vectorSearchProvider,
    fullTextSearch: fullTextSearchProvider,
    mixedSearch: createBuiltInMixedSearchProvider(
      vectorSearchProvider,
      fullTextSearchProvider,
      resolvedLogger
    ),
    reranker: reranker ? createBuiltInRerankProvider(reranker, resolvedLogger) : undefined,
    logger: resolvedLogger
  };
}
