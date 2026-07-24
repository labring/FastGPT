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

export type DefineMongoIndexOptions = {
  key: IndexDefinition;
  options?: IndexOptions;
  deprecated?: true;
};

/**
 * 统一声明当前索引和 FastGPT 明确废弃的历史索引。
 *
 * `deprecated` 默认是 `false`，当前索引直接代理 `Schema.index()`；显式设置为
 * `true` 时只登记清理元数据，不能继续写入 Mongoose Schema，否则启动同步会先
 * 重新创建该索引。废弃索引未显式命名时，按 MongoDB 的默认规则从 key 推导名称。
 */
export const defineIndex = (
  schema: Schema,
  { key, options, deprecated }: DefineMongoIndexOptions
) => {
  if (deprecated !== true) {
    schema.index(key, options);
    return;
  }

  const registeredIndexes = getDeprecatedIndexes(schema);
  const indexName =
    options?.name ??
    Object.entries(key)
      .map(([field, order]) => `${field}_${order}`)
      .join('_');
  const duplicateIndexName = registeredIndexes.some((index) => index.indexName === indexName);

  if (duplicateIndexName) {
    throw new Error(`Duplicate deprecated MongoDB index declaration: ${indexName}`);
  }

  const deprecatedOptions: DeprecatedMongoIndexOptions = {
    unique: options?.unique,
    sparse: options?.sparse,
    expireAfterSeconds: options?.expireAfterSeconds,
    partialFilterExpression: options?.partialFilterExpression,
    collation: options?.collation
  };
  const hasDeprecatedOptions = Object.values(deprecatedOptions).some(
    (value) => value !== undefined
  );

  Reflect.set(schema, deprecatedMongoIndexesKey, [
    ...registeredIndexes,
    {
      indexName,
      key,
      options: hasDeprecatedOptions ? deprecatedOptions : undefined
    }
  ] satisfies DeprecatedMongoIndexDefinition[]);
};

/** 读取某个 Schema 自身登记的废弃索引，不聚合其他集合或全局清单。 */
export const getDeprecatedIndexes = (schema: Schema): readonly DeprecatedMongoIndexDefinition[] => {
  const indexes: unknown = Reflect.get(schema, deprecatedMongoIndexesKey);
  return Array.isArray(indexes) ? indexes : [];
};
