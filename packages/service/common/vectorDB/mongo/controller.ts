import { DatasetEmbeddingDimensions } from '@fastgpt/global/core/dataset/data/embedding/type';
import { serviceEnv } from '../../../env';
import { MongoIndexManager } from '../../mongo/indexManager';
import { embeddingMongo, MongoDatasetDataEmbedding } from './schema';
import { ensureMongoFullTextIndex } from './fullTextIndex';
import { ensureMongoSearchIndex } from './searchIndex';
import { getLogger, LogCategories } from '../../logger';
import z from 'zod';

const SearchIndexFieldsSchema = z.array(z.record(z.string(), z.unknown()));

export const MongoEmbeddingSearchIndexName = 'embedding_int8';
export const MongoEmbeddingSearchDefinition = {
  fields: [
    {
      type: 'vector',
      path: 'vector',
      numDimensions: DatasetEmbeddingDimensions,
      similarity: 'dotProduct',
      quantization: 'scalar',
      indexingMethod: 'hnsw'
    },
    ...['teamId', 'datasetId', 'collectionId'].map((path) => ({ type: 'filter', path }))
  ]
};

/** 仅使用独立检索库配置，缺省库名为 fastgpt_search；连接失败后允许显式重试。 */
export const connectEmbeddingMongo = async (): Promise<void> => {
  if (!serviceEnv.SEARCH_MONGO_URL) throw new Error('SEARCH_MONGO_URL is required');
  if (embeddingMongo.connection.readyState === 1) return;

  // URI 未指定数据库时覆盖驱动的 test 默认库；兼容多主机及 SRV，保留显式库名。
  const hasDatabase = /^mongodb(?:\+srv)?:\/\/[^/?]+\/[^?]+/.test(serviceEnv.SEARCH_MONGO_URL);
  const connecting = (global.embeddingMongoConnecting ??= embeddingMongo
    .connect(serviceEnv.SEARCH_MONGO_URL, {
      ...(!hasDatabase && { dbName: 'fastgpt_search' }),
      maxPoolSize: serviceEnv.DB_MAX_LINK,
      minPoolSize: 0,
      serverSelectionTimeoutMS: 10_000,
      retryReads: true,
      retryWrites: true
    })
    .then(() => undefined));
  try {
    await connecting;
  } finally {
    if (global.embeddingMongoConnecting === connecting) global.embeddingMongoConnecting = undefined;
  }
};

/** 只管理本 provider 的命名搜索索引；不覆盖配置不同的现有索引或客户自建索引。 */
export const ensureMongoEmbeddingSearchIndex = () =>
  ensureMongoSearchIndex({
    name: MongoEmbeddingSearchIndexName,
    type: 'vectorSearch',
    definition: MongoEmbeddingSearchDefinition,
    matchesDefinition: ({ fields }) => {
      const { data } = SearchIndexFieldsSchema.safeParse(fields);
      return (
        data?.length === MongoEmbeddingSearchDefinition.fields.length &&
        MongoEmbeddingSearchDefinition.fields.every((expected) =>
          data.some((field) =>
            Object.entries(expected).every(
              ([key, value]) =>
                // 旧索引未显式写 indexingMethod 时，服务端默认也是 HNSW。
                (key === 'indexingMethod' ? (field[key] ?? 'hnsw') : field[key]) === value
            )
          )
        )
      );
    }
  });

let initializing: Promise<void> | undefined;

/** 初始化普通索引及 INT8 搜索索引；所有读写共享初始化结果，失败允许重新执行。 */
export const initEmbeddingMongo = async (): Promise<void> => {
  if (!initializing) {
    initializing = (async () => {
      await connectEmbeddingMongo();
      await MongoIndexManager.syncModelIndexes({ model: MongoDatasetDataEmbedding });
      void ensureMongoFullTextIndex().catch((error) => {
        getLogger(LogCategories.INFRA.VECTOR).warn(
          'MongoDB full-text background index build failed',
          { error }
        );
      });
      await ensureMongoEmbeddingSearchIndex();
    })().catch((error) => {
      initializing = undefined;
      throw error;
    });
  }
  await initializing;
};
