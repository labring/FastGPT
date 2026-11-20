import type { MongoCollectionDefinition } from '../mongo/collection';
import { validateSqlTableRegistry, type SqlTableDefinition } from '../sql/ddl';
import type { SqlMigrationDefinition } from '../sql/migrations/types';
import { appRegistrationMongoCollection } from './appRegistration/mongo/schema';
import { appRegistrationSqlTable } from './appRegistration/sql/table';

/**
 * 开源主仓已迁入 `@fastgpt/dal` 的全部 MongoDB 集合声明注册表。
 *
 * 供启动后后台异步索引同步（只增补建）与只读 `inspectMongoIndexes` 使用。
 */
export const coreMongoCollections: readonly MongoCollectionDefinition<any>[] = [
  appRegistrationMongoCollection
];

/**
 * 开源主仓已迁入 `@fastgpt/dal` 的全部可移植 SQL 表声明注册表。
 *
 * 加载期即执行跨表全局唯一索引名校验（兼容 PostgreSQL 单 Schema 全局索引命名空间与 `shared` 单库模式）。
 */
export const coreSqlTables: readonly SqlTableDefinition[] = [appRegistrationSqlTable];

validateSqlTableRegistry(coreSqlTables);

/**
 * 开源主仓版本化 SQL DDL 迁移清单（只允许尾部追加，禁止修改已发布 ID 或历史语义）。
 */
export const coreSqlMigrations: readonly SqlMigrationDefinition[] = [
  {
    id: '0001_init_app_registrations',
    name: 'Initialize app_registrations table',
    scope: 'core',
    datasource: 'main',
    up: async ({ applyTableDDL }) => {
      await applyTableDDL(appRegistrationSqlTable);
    }
  }
];
