import { isDeepStrictEqual } from 'node:util';
import { assertMongoSearchIndexReady, ensureMongoSearchIndex } from './searchIndex';

export const MongoFullTextSearchIndexName = 'embedding_search_fulltext';

const definition = {
  mappings: {
    dynamic: false,
    fields: {
      _id: { type: 'token' },
      teamId: { type: 'token' },
      datasetId: { type: 'token' },
      collectionId: { type: 'token' },
      fulltextTokens: { type: 'string', analyzer: 'lucene.whitespace' }
    }
  }
};

const fullTextIndex = {
  name: MongoFullTextSearchIndexName,
  type: 'search' as const,
  definition,
  matchesDefinition: (actual: Record<string, unknown>) => isDeepStrictEqual(actual, definition)
};

let building: Promise<void> | undefined;

/** 检查全文搜索索引的当前定义和就绪状态。 */
export const assertMongoFullTextIndex = () => assertMongoSearchIndexReady(fullTextIndex);

/** 启动与迁移合并进行中的建图，后续准备重新核验当前数据库目录。 */
export const ensureMongoFullTextIndex = () => {
  building ??= ensureMongoSearchIndex(fullTextIndex).finally(() => {
    building = undefined;
  });
  return building;
};
