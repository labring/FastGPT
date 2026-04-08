// src/ports/search.ts
// 搜索 Provider 接口

import type { ChunkResult } from '../types/chunk';
import type { EmbeddingProvider } from './embedding';

/**
 * 向量检索过滤器
 */
export interface VectorSearchFilter {
  collectionIds?: string[];
  forbidCollectionIds?: string[];
  text?: string;
  providerFilters?: Record<string, unknown>;
}

/**
 * 向量检索选项
 */
export interface VectorSearchOptions {
  limit: number;
  similarity?: number;
  filter?: VectorSearchFilter;
  enableExactSearch?: boolean;
  extraParams?: Record<string, unknown>;
}

/**
 * 向量检索接口
 */
export interface VectorSearchProvider {
  search(
    vectors: number[][],
    datasetIds: string[],
    options: VectorSearchOptions
  ): Promise<SearchResult<ChunkResult>>;
}

/**
 * 全文检索过滤器
 */
export interface FullTextSearchFilter {
  collectionIds?: string[];
  forbidCollectionIds?: string[];
  tags?: string[];
  dateRange?: { start: string; end: string };
  providerFilters?: Record<string, unknown>;
}

/**
 * 全文检索选项
 */
export interface FullTextSearchOptions {
  limit: number;
  enableFuzzy?: boolean;
  enablePhraseMatch?: boolean;
  filter?: FullTextSearchFilter;
  extraParams?: Record<string, unknown>;
}

/**
 * 全文检索接口
 */
export interface FullTextSearchProvider {
  search(
    query: string,
    datasetIds: string[],
    options: FullTextSearchOptions
  ): Promise<SearchResult<ChunkResult>>;
}

/**
 * 混合检索选项
 */
export interface MixedSearchOptions {
  limit: number;
  vectorWeight?: number;
  fullTextWeight?: number;
  rerankAfterMerge?: boolean;
  filter?: VectorSearchFilter & FullTextSearchFilter;
}

/**
 * 混合检索接口
 */
export interface MixedSearchProvider {
  search(
    query: string,
    datasetIds: string[],
    options: MixedSearchOptions,
    embeddingOrVectors: {
      vectors?: number[][];
      embeddingProvider?: EmbeddingProvider;
    }
  ): Promise<SearchResult<ChunkResult>>;
}

/**
 * Web 检索选项
 */
export interface WebSearchOptions {
  limit: number;
  site?: string;
  lang?: string;
  safeSearch?: boolean;
  extraParams?: Record<string, unknown>;
}

/**
 * Web 检索接口
 */
export interface WebSearchProvider {
  search(query: string, options: WebSearchOptions): Promise<SearchResult<ChunkResult>>;
}

/**
 * 检索结果包装
 */
export interface SearchResult<T = ChunkResult> {
  chunks: T[];
  error?: {
    code: string;
    message: string;
    retryable: boolean;
    details?: Record<string, unknown>;
  };
  meta: {
    searchSource: 'vector' | 'fulltext' | 'mixed' | 'web';
    provider: string;
    duration: number;
    totalTokens?: number;
    rawResponse?: unknown;
    queryAnalytics?: {
      originalQuery: string;
      rewrittenQuery?: string;
      subQueries?: string[];
    };
  };
}

/**
 * 工具函数：将 ChunkResult[] 转换为 SearchResult
 * 用于兼容旧的 provider 实现
 */
export function createSearchResult(
  chunks: ChunkResult[],
  searchSource: 'vector' | 'fulltext' | 'mixed' | 'web',
  provider: string,
  options?: {
    error?: SearchResult['error'];
    rawResponse?: unknown;
    totalTokens?: number;
  }
): SearchResult<ChunkResult> {
  const startTime = Date.now();

  return {
    chunks,
    error: options?.error,
    meta: {
      searchSource,
      provider,
      duration: Date.now() - startTime,
      totalTokens: options?.totalTokens,
      rawResponse: options?.rawResponse
    }
  };
}
