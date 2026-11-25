import { delay } from '@fastgpt/global/common/system/utils';
import z from 'zod';
import { MongoDatasetDataEmbedding } from './schema';

const SearchIndexStateSchema = z.object({
  status: z.string(),
  queryable: z.boolean(),
  latestDefinition: z.record(z.string(), z.unknown())
});

type MongoSearchIndexDefinition = {
  name: string;
  type: 'search' | 'vectorSearch';
  definition: Record<string, unknown>;
  matchesDefinition: (definition: Record<string, unknown>) => boolean;
};

const hasMongoErrorCode = (error: unknown, code: number) =>
  error instanceof Error && 'code' in error && error.code === code;

const readSearchIndex = async ({ name, matchesDefinition }: MongoSearchIndexDefinition) => {
  const [raw] = await MongoDatasetDataEmbedding.collection
    .listSearchIndexes(name)
    .toArray()
    .catch((error: unknown) => {
      if (hasMongoErrorCode(error, 26)) return [];
      throw error;
    });
  if (!raw) return;
  // Mongoose 只声明搜索索引名称，实际就绪状态和定义来自 mongot。
  const index = SearchIndexStateSchema.parse(raw);
  if (!matchesDefinition(index.latestDefinition)) {
    throw new Error(`MongoDB search index ${name} has an incompatible definition`);
  }
  if (index.status === 'FAILED') throw new Error(`MongoDB search index ${name} build failed`);
  return index;
};

/** 迁移完成前重新读取索引状态，验证目标定义和查询能力。 */
export const assertMongoSearchIndexReady = async (config: MongoSearchIndexDefinition) => {
  const index = await readSearchIndex(config);
  if (index?.status !== 'READY' || !index.queryable) {
    throw new Error(`MongoDB search index ${config.name} is not ready`);
  }
};

/** 幂等创建并等待命名索引就绪，已有定义冲突时保留索引并报错。 */
export const ensureMongoSearchIndex = async (config: MongoSearchIndexDefinition) => {
  const { name, type, definition } = config;
  let index = await readSearchIndex(config);
  if (!index) {
    const create = () =>
      MongoDatasetDataEmbedding.collection.createSearchIndex({ name, type, definition });
    try {
      await create().catch(async (error: unknown) => {
        // 空库可先从全文迁移入口进入，搜索索引依赖目标集合已存在。
        if (!hasMongoErrorCode(error, 26)) throw error;
        await MongoDatasetDataEmbedding.createCollection();
        return create();
      });
    } catch (error) {
      // 另一实例可能已经创建；下次读取仍核对定义。
      if (!hasMongoErrorCode(error, 68)) throw error;
    }
  }
  for (let attempt = 0; attempt < 180; attempt++) {
    if (index?.status === 'READY' && index.queryable) return;
    await delay(1000);
    index = await readSearchIndex(config);
  }
  if (index?.status === 'READY' && index.queryable) return;
  throw new Error(`MongoDB search index ${name} did not become READY within 180 seconds`);
};
