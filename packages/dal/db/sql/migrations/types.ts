import type { Kysely } from 'kysely';
import type { DbDatasource, DbLogger, SqlDialect } from '../../types';
import type { SqlIndexDef, SqlTableDefinition } from '../ddl';

/** SQL DDL 迁移账本作用域：开源主仓（core）与商业版（pro）各自独立按序演进。 */
export type SqlMigrationScope = 'core' | 'pro';

/** 分布式锁抽象：生产默认接 `@fastgpt/dal/redis/caches/lease` `LeaseCache`，单测可注入纯内存锁。 */
export type SqlMigrationLock = {
  withLock: <T>(params: { key: string; label: string; fn: () => Promise<T> }) => Promise<T>;
};

export type EnsureSqlIndexResult = {
  table: string;
  indexName: string;
  status: 'created' | 'exists' | 'healed_and_created';
};

export type DropSqlIndexResult = {
  table: string;
  indexName: string;
  status: 'dropped' | 'missing';
};

export type SqlMigrationContext = {
  db: Kysely<any>;
  dialect: SqlDialect;
  datasource: DbDatasource;
  logger: DbLogger;
  ensureIndex: (params: {
    table: string;
    index: SqlIndexDef;
    concurrently?: boolean;
    lockWaitTimeoutSec?: number;
  }) => Promise<EnsureSqlIndexResult>;
  dropIndexIfExists: (params: {
    table: string;
    indexName: string;
    concurrently?: boolean;
    lockWaitTimeoutSec?: number;
  }) => Promise<DropSqlIndexResult>;
  applyTableDDL: (table: SqlTableDefinition) => Promise<void>;
};

export type SqlMigrationDefinition = {
  /** 永久稳定且按字典序递增的迁移 ID（如 `0001_init_app_registrations`）。 */
  id: string;
  name: string;
  scope: SqlMigrationScope;
  /** 逻辑数据源；默认为 `'main'`。`logMode === 'shared'` 时 `'log'` 迁移自动随主库执行。 */
  datasource?: DbDatasource;
  /**
   * 是否在单事务内执行 `up` 与账本写入。
   * - 默认 `true`；
   * - 包含 PG `CREATE/DROP INDEX CONCURRENTLY` 或长耗时大表在线 DDL 时设为 `false`。
   */
  transactional?: boolean;
  up: (ctx: SqlMigrationContext) => Promise<void>;
};

export type SqlMigrationRunResult = {
  scope: SqlMigrationScope;
  datasource: DbDatasource;
  dialect: SqlDialect;
  applied: string[];
  skippedFutureIds: string[];
  alreadyAppliedCount: number;
};

export type SqlSchemaInspectReport = {
  datasource: DbDatasource;
  dialect: SqlDialect;
  missingTables: string[];
  missingIndexes: Array<{ table: string; indexName: string }>;
  invalidIndexes: Array<{ table: string; indexName: string }>;
  extraManagedIndexes: Array<{ table: string; indexName: string }>;
  customerIndexes: Array<{ table: string; indexName: string }>;
};
