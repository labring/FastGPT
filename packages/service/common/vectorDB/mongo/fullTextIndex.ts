import { MongoDatasetDataEmbedding, MongoFullTextIndex } from './schema';

let building: Promise<void> | undefined;

/** 确认 Mongo 全文索引名称、字段和语言配置，避免依赖其他文本字段或分词规则。 */
export const assertMongoFullTextIndex = async () => {
  const index = (await MongoDatasetDataEmbedding.listIndexes()).find(
    ({ name }) => name === MongoFullTextIndex.options.name
  );
  if (
    !index ||
    index.hidden ||
    index.default_language !== 'none' ||
    index.key.teamId !== 1 ||
    index.key._fts !== 'text' ||
    index.key._ftsx !== 1 ||
    Object.keys(index.key).length !== 3 ||
    index.weights?.fulltextTokens !== 1 ||
    Object.keys(index.weights).length !== 1 ||
    index.partialFilterExpression ||
    (index.collation && index.collation.locale !== 'simple')
  ) {
    throw new Error('MongoDB full-text index is missing or incompatible');
  }
};

/** 启动与迁移共享后台索引构建，失败后可重试；向量写入无需等待。 */
export const ensureMongoFullTextIndex = () => {
  building ??= (async () => {
    const { key, options } = MongoFullTextIndex;
    await MongoDatasetDataEmbedding.collection.createIndex(key, options);
    await assertMongoFullTextIndex();
  })().catch((error) => {
    building = undefined;
    throw error;
  });
  return building;
};
