import { DatasetEmbeddingDimensions } from '@fastgpt/global/core/dataset/data/embedding/type';
import { delay } from '@fastgpt/global/common/system/utils';
import { serviceEnv } from '../../../env';
import { MongoIndexManager } from '../../mongo/indexManager';
import { embeddingMongo, MongoDatasetDataEmbedding } from './schema';
import z from 'zod';

const SearchIndexStateSchema = z.object({
  status: z.string(),
  queryable: z.boolean(),
  latestDefinition: z.object({ fields: z.array(z.record(z.string(), z.unknown())) })
});

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

/** 连接独立的向量库；失败会清除连接 promise，后续显式重试不会永久复用失败结果。 */
export const connectEmbeddingMongo = async (): Promise<void> => {
  if (!serviceEnv.EMBEDDING_MONGO_URL) throw new Error('EMBEDDING_MONGO_URL is required');
  if (embeddingMongo.connection.readyState === 1) return;
  const connecting = (global.embeddingMongoConnecting ??= embeddingMongo
    .connect(serviceEnv.EMBEDDING_MONGO_URL, {
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
export const ensureMongoEmbeddingSearchIndex = async (): Promise<void> => {
  const collection = MongoDatasetDataEmbedding.collection;
  const getIndex = async () => {
    const index = (await collection.listSearchIndexes(MongoEmbeddingSearchIndexName).toArray())[0];
    // Mongoose 的搜索索引类型只声明 name，实际状态必须从服务端响应校验取得。
    return index ? SearchIndexStateSchema.parse(index) : undefined;
  };
  let index = await getIndex();
  if (!index) {
    try {
      await collection.createSearchIndex({
        name: MongoEmbeddingSearchIndexName,
        type: 'vectorSearch',
        definition: MongoEmbeddingSearchDefinition
      });
    } catch (error) {
      // 多个 App 节点同时首次启动时，只允许忽略同名索引已被另一个节点创建的情况。
      if (!(error instanceof Error && 'code' in error && error.code === 68)) throw error;
    }
  }
  for (let attempt = 0; attempt < 180; attempt++) {
    index = await getIndex();
    if (index) {
      const fields = index.latestDefinition?.fields;
      if (
        !Array.isArray(fields) ||
        fields.length !== MongoEmbeddingSearchDefinition.fields.length ||
        !MongoEmbeddingSearchDefinition.fields.every((expected) =>
          fields.some((field) =>
            Object.entries(expected).every(
              ([key, value]) =>
                // 旧索引未显式写 indexingMethod 时，服务端默认也是 HNSW。
                (key === 'indexingMethod' ? (field[key] ?? 'hnsw') : field[key]) === value
            )
          )
        )
      ) {
        throw new Error(
          `MongoDB search index ${MongoEmbeddingSearchIndexName} has an incompatible definition`
        );
      }
      if (index.status === 'FAILED') throw new Error('MongoDB embedding search index build failed');
      if (index.status === 'READY' && index.queryable) return;
    }
    await delay(1000);
  }
  throw new Error('MongoDB embedding search index did not become READY within 180 seconds');
};

let initializing: Promise<void> | undefined;

/** 初始化普通索引及 INT8 搜索索引；所有读写共享初始化结果，失败允许重新执行。 */
export const initEmbeddingMongo = async (): Promise<void> => {
  if (!initializing) {
    initializing = (async () => {
      await connectEmbeddingMongo();
      await MongoIndexManager.syncModelIndexes({ model: MongoDatasetDataEmbedding });
      await ensureMongoEmbeddingSearchIndex();
    })().catch((error) => {
      initializing = undefined;
      throw error;
    });
  }
  await initializing;
};
