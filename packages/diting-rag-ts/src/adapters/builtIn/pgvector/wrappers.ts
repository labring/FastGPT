// src/adapters/built-in/pgvector/wrappers.ts
// PGVector Provider Wrappers - 将 PGVector 适配器包装为标准 Provider 接口

import type { VectorSearchProvider, VectorSearchOptions } from '../../../ports/search';
import type { Logger } from '../../../ports/logger';
import { PGVectorAdapter, type PGVectorConfig } from './adapter';

export { type PGVectorConfig } from './adapter';

/**
 * 创建 PGVector 向量检索 Provider
 */
export function createBuiltInVectorSearchProvider(
  config?: PGVectorConfig,
  logger?: Logger
): VectorSearchProvider {
  const adapter = new PGVectorAdapter({ ...config, logger });
  return {
    search: async (vectors: number[][], datasetIds: string[], options: VectorSearchOptions) => {
      return adapter.search(vectors, datasetIds, options);
    }
  };
}

/**
 * 包装 PGVector 适配器为 VectorSearchProvider
 */
export function wrapPGVectorSearch(adapter: PGVectorAdapter): VectorSearchProvider {
  return {
    search: async (vectors: number[][], datasetIds: string[], options: VectorSearchOptions) => {
      return adapter.search(vectors, datasetIds, options);
    }
  };
}
