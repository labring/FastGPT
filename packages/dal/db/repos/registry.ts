import type { MongoCollectionDefinition } from '../mongo/collection';
import { defineSqlTable, validateSqlTableRegistry, type SqlTableDefinition } from '../sql/ddl';
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
 * `0001_init_app_registrations` 永久冻结的 v1 建表快照。
 *
 * 严禁修改此快照或改回引用实时 `appRegistrationSqlTable`：已发布迁移必须始终复现历史版本 DDL，
 * 后续任何列/索引演进必须通过追加 `0002_*` 等新迁移完成，从而让防漂移守卫稳定捕获存量库升级缺列/缺索引问题。
 */
export const APP_REGISTRATION_SQL_TABLE_V1: SqlTableDefinition = Object.freeze(
  defineSqlTable({
    name: 'app_registrations',
    columns: Object.freeze({
      _id: Object.freeze({ kind: 'entityId', primaryKey: true }),
      team_id: Object.freeze({ kind: 'entityId' }),
      tmb_id: Object.freeze({ kind: 'entityId' }),
      app_id: Object.freeze({ kind: 'entityId', nullable: true }),
      created_at: Object.freeze({ kind: 'timestamp', nullable: true })
    }),
    indexes: Object.freeze([
      Object.freeze({ name: 'fg_app_reg_team', columns: Object.freeze(['team_id']) })
    ])
  })
);

/**
 * 开源主仓版本化 SQL DDL 迁移清单（只允许尾部追加，禁止修改已发布 ID 或历史语义）。
 *
 * 所有迁移 `up` 必须仅依赖可重入 DDL helper（兼容 MySQL/OceanBase DDL 隐式提交重入）。
 */
export const coreSqlMigrations: readonly SqlMigrationDefinition[] = [
  {
    id: '0001_init_app_registrations',
    name: 'Initialize app_registrations table',
    scope: 'core',
    datasource: 'main',
    up: async ({ applyTableDDL }) => {
      await applyTableDDL(APP_REGISTRATION_SQL_TABLE_V1);
    }
  }
];
