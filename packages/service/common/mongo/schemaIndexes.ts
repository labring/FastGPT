import type { IndexDefinition, IndexOptions, Schema } from 'mongoose';

const deprecatedMongoIndexesKey = Symbol.for('fastgpt.mongo.deprecatedIndexes');

export type DeprecatedMongoIndexOptions = Pick<
  IndexOptions,
  'unique' | 'sparse' | 'expireAfterSeconds' | 'partialFilterExpression' | 'collation'
>;

export type DeprecatedMongoIndexDefinition = {
  indexName: string;
  key: IndexDefinition;
  options?: DeprecatedMongoIndexOptions;
};

/**
 * 将 FastGPT 明确废弃的历史索引登记到所属 Schema。
 *
 * collection 由 model 推导，因此定义只描述索引本身。重复名称会在启动前直接报错，
 * 避免同一个 Schema 对删除目标给出互相冲突的定义。
 */
export const defineDeprecatedIndexes = (
  schema: Schema,
  indexes: DeprecatedMongoIndexDefinition[]
) => {
  const registeredIndexes = getDeprecatedIndexes(schema);
  const nextIndexes = [...registeredIndexes, ...indexes];
  const duplicateIndexName = nextIndexes.find(
    (index, position) =>
      nextIndexes.findIndex((candidate) => candidate.indexName === index.indexName) !== position
  )?.indexName;

  if (duplicateIndexName) {
    throw new Error(`Duplicate deprecated MongoDB index declaration: ${duplicateIndexName}`);
  }

  Reflect.set(schema, deprecatedMongoIndexesKey, nextIndexes);
};

/** 读取某个 Schema 自身登记的废弃索引，不聚合其他集合或全局清单。 */
export const getDeprecatedIndexes = (schema: Schema): readonly DeprecatedMongoIndexDefinition[] => {
  const indexes: unknown = Reflect.get(schema, deprecatedMongoIndexesKey);
  return Array.isArray(indexes) ? indexes : [];
};
