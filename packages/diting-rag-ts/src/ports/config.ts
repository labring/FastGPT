// src/ports/config.ts

import { LogLevel } from './logger';

export interface DitingConfig {
  logger?: {
    level?: LogLevel;
    prefix?: string;
  };
  search?: {
    defaultSearchMode?: 'vector' | 'fulltext' | 'mixed';
    fallback?: FallbackStrategy;
    retry?: RetryConfig;
    tokenBudget?: number;
  };
  llm?: {
    defaultModel?: string;
    timeout?: number;
    maxRetries?: number;
  };
  embedding?: {
    batchSize?: number;
    timeout?: number;
  };
}

export interface FallbackStrategy {
  vectorToFulltext?: boolean;
  fulltextToVector?: boolean;
  mixedFallbackMode?: 'vector' | 'fulltext';
  llmFallbackMode?: 'error' | 'skip' | 'default';
}

export interface RetryConfig {
  maxRetries: number;
  retryDelay: number;
  retryBackoff: 'linear' | 'exponential';
  retryableErrors?: string[];
}

export const DEFAULT_FALLBACK_STRATEGY: FallbackStrategy = {
  vectorToFulltext: true,
  fulltextToVector: true,
  mixedFallbackMode: 'vector',
  llmFallbackMode: 'error'
};

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  retryDelay: 1000,
  retryBackoff: 'exponential',
  retryableErrors: ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND']
};

export const DEFAULT_CONFIG: DitingConfig = {
  logger: {
    level: LogLevel.INFO,
    prefix: 'diting'
  },
  search: {
    defaultSearchMode: 'mixed',
    fallback: DEFAULT_FALLBACK_STRATEGY,
    retry: DEFAULT_RETRY_CONFIG,
    tokenBudget: 4000
  },
  llm: {
    timeout: 60000,
    maxRetries: 3
  },
  embedding: {
    batchSize: 100,
    timeout: 30000
  }
};

export function mergeConfig(base: DitingConfig, override: Partial<DitingConfig>): DitingConfig {
  return {
    logger: { ...base.logger, ...override.logger },
    search: {
      ...base.search,
      ...override.search,
      fallback: {
        ...DEFAULT_FALLBACK_STRATEGY,
        ...base.search?.fallback,
        ...override.search?.fallback
      },
      retry: {
        ...DEFAULT_RETRY_CONFIG,
        ...base.search?.retry,
        ...override.search?.retry
      }
    },
    llm: { ...base.llm, ...override.llm },
    embedding: { ...base.embedding, ...override.embedding }
  };
}
