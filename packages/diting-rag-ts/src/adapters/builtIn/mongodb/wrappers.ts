// src/adapters/built-in/mongodb/wrappers.ts
// MongoDB Provider Wrappers - 将 MongoDB 适配器包装为标准 Provider 接口

import type { FullTextSearchProvider, FullTextSearchOptions } from '../../../ports/search';
import type { Logger } from '../../../ports/logger';
import { MongoDBAdapter, type MongoDBConfig } from './adapter';

export { type MongoDBConfig } from './adapter';

/**
 * 创建 MongoDB 全文检索 Provider
 */
export function createBuiltInFullTextSearchProvider(
  config?: MongoDBConfig,
  logger?: Logger
): FullTextSearchProvider {
  const adapter = new MongoDBAdapter({ ...config, logger });

  return {
    search: async (query: string, datasetIds: string[], options: FullTextSearchOptions) => {
      return adapter.search(query, datasetIds, options);
    }
  };
}

/**
 * 包装 MongoDB 适配器为 FullTextSearchProvider
 */
export function wrapMongoDBFullTextSearch(adapter: MongoDBAdapter): FullTextSearchProvider {
  return {
    search: async (query: string, datasetIds: string[], options: FullTextSearchOptions) => {
      return adapter.search(query, datasetIds, options);
    }
  };
}

/**
 * 别名：createMongoDBProvider（向后兼容）
 */
export const createMongoDBProvider = createBuiltInFullTextSearchProvider;
