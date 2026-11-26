import type { IndexDefinition, IndexOptions, Schema } from 'mongoose';
import { DbConfigurationError } from '../errors';
import type { DbDatasource, MongoCollectionDescriptor } from '../types';

export type MongoCollectionIndexDef = {
  key: IndexDefinition;
  options?: IndexOptions;
};

export type MongoCollectionDefinition<TDoc = Record<string, unknown>> =
  MongoCollectionDescriptor<TDoc> & {
    readonly schema: Schema;
    readonly indexes: readonly MongoCollectionIndexDef[];
    /** 可选运行时动态索引生成器（如依赖动态配置的条件索引或可调 TTL），在启动异步索引同步时求值。 */
    readonly resolveDynamicIndexes?: () => readonly MongoCollectionIndexDef[];
  };

const appliedSchemas = new WeakSet<Schema>();

const FORBIDDEN_FIELD_INDEX_OPTIONS = ['index', 'unique', 'sparse', 'text', 'expires'] as const;
const VALID_FG_MONGO_INDEX_NAME_REGEX = /^fg_[a-z0-9_]+$/;

export const deriveMongoIndexName = (index: MongoCollectionIndexDef): string => {
  if (typeof index.options?.name === 'string' && index.options.name.trim().length > 0) {
    return index.options.name.trim();
  }
  return Object.entries(index.key as Record<string, unknown>)
    .map(([field, order]) => `${field}_${String(order)}`)
    .join('_');
};

const assertNoInlineFieldIndexes = (collectionName: string, schema: Schema): void => {
  for (const [pathName, schemaType] of Object.entries(schema.paths)) {
    if (pathName === '_id') {
      continue;
    }
    const options = (schemaType as { options?: Record<string, unknown> })?.options;
    if (options === undefined || options === null) {
      continue;
    }
    for (const optionKey of FORBIDDEN_FIELD_INDEX_OPTIONS) {
      const value = options[optionKey];
      if (value !== undefined && value !== false && value !== null) {
        throw new DbConfigurationError(
          `Mongo collection "${collectionName}" must declare indexes via defineMongoCollection({ indexes }), not inline option "${optionKey}" on field "${pathName}"`
        );
      }
    }
  }
};

/**
 * 声明一个纯内存、零副作用的 MongoDB 集合描述符。
 *
 * - 直接接收原生 Mongoose `Schema`，完整保留 `.virtual()` / `.pre()` 等表达力；
 * - 模块导入阶段不触发数据库连接、不注册全局 Model、不发建索引命令；
 * - 定义期强制拦截字段级隐式索引（`index/unique/sparse/text/expires`）与重名索引；
 * - 实际 `Model` 由 `MongoRepositoryBase` 在 `constructor` 内按当前 `DbRuntime` 生命周期幂等绑定。
 */
export const defineMongoCollection = <TDoc = Record<string, unknown>>({
  name,
  datasource = 'main',
  schema,
  indexes = [],
  resolveDynamicIndexes
}: {
  name: string;
  datasource?: DbDatasource;
  schema: Schema;
  indexes?: readonly MongoCollectionIndexDef[];
  resolveDynamicIndexes?: () => readonly MongoCollectionIndexDef[];
}): MongoCollectionDefinition<TDoc> => {
  const normalizedName = name.trim();
  if (normalizedName.length === 0) {
    throw new DbConfigurationError('Mongo collection name must be a non-empty string');
  }

  assertNoInlineFieldIndexes(normalizedName, schema);

  const seenNames = new Set<string>();
  for (const idx of indexes) {
    if (Object.keys(idx.key as Record<string, unknown>).length === 0) {
      throw new DbConfigurationError(
        `Mongo collection "${normalizedName}" has an index with an empty key`
      );
    }
    const derivedName = deriveMongoIndexName(idx);
    if (derivedName.startsWith('fg_')) {
      if (
        !VALID_FG_MONGO_INDEX_NAME_REGEX.test(derivedName) ||
        Buffer.byteLength(derivedName, 'ascii') > 63
      ) {
        throw new DbConfigurationError(
          `Managed Mongo index "${derivedName}" on "${normalizedName}" must match fg_<snake_case> and be <= 63 ASCII bytes`
        );
      }
    }
    if (seenNames.has(derivedName)) {
      throw new DbConfigurationError(
        `Duplicate Mongo index "${derivedName}" declared on collection "${normalizedName}"`
      );
    }
    seenNames.add(derivedName);
  }

  if (!appliedSchemas.has(schema)) {
    for (const idx of indexes) {
      schema.index(idx.key, idx.options);
    }
    appliedSchemas.add(schema);
  }

  return Object.freeze({
    name: normalizedName,
    datasource,
    schema,
    indexes: Object.freeze([...indexes]),
    ...(resolveDynamicIndexes !== undefined ? { resolveDynamicIndexes } : {})
  });
};
