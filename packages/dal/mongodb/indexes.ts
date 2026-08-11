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

/** 统一声明当前索引；废弃索引只登记元数据，供索引管理器精确清理。 */
export const defineIndex = (
  schema: Schema,
  { key, options, deprecated }: DefineMongoIndexOptions
) => {
  if (Object.keys(key).length === 0) {
    throw new Error('defineIndex: key must not be empty');
  }

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

  if (registeredIndexes.some((index) => index.indexName === indexName)) {
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

export const getDeprecatedIndexes = (schema: Schema): readonly DeprecatedMongoIndexDefinition[] => {
  const indexes: unknown = Reflect.get(schema, deprecatedMongoIndexesKey);
  // 返回副本，防止外部直接修改 schema 上登记的内部元数据。
  return Array.isArray(indexes) ? [...indexes] : [];
};
