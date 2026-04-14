// src/adapters/built-in/milvus/wrappers.ts
// Milvus Provider Wrappers - 将 Milvus 适配器包装为标准 Provider 接口

import type { VectorSearchProvider, VectorSearchOptions } from '../../../ports/search';
import { MilvusAdapter, type MilvusConfig } from './adapter';

/**
 * 创建 Milvus 向量检索 Provider
 */
export function createMilvusProvider(config: MilvusConfig): VectorSearchProvider {
  const adapter = new MilvusAdapter(config);
  return {
    search: async (vectors: number[][], datasetIds: string[], options: VectorSearchOptions) => {
      return adapter.search(vectors, datasetIds, options);
    }
  };
}

/**
 * 包装 Milvus 适配器为 VectorSearchProvider
 */
export function wrapMilvusVectorSearch(adapter: MilvusAdapter): VectorSearchProvider {
  return {
    search: async (vectors: number[][], datasetIds: string[], options: VectorSearchOptions) => {
      return adapter.search(vectors, datasetIds, options);
    }
  };
}
