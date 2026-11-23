import type { Kysely } from 'kysely';
import type { DbDatasource, DbLogger, SqlDialect } from '../../types';
import type { SqlIndexDef, SqlTableDefinition } from '../ddl';

/** SQL DDL 迁移账本作用域：开源主仓（core）与商业版（pro）各自独立按序演进。 */
export type SqlMigrationScope = 'core' | 'pro';

/**
 * 迁移锁租约守卫：
 * 在每个迁移、每条不可逆 DDL 与每次账本写入前校验当前执行者仍持有有效租约，
 * 防止租约丢失或续租失败后继续向数据库发出 DDL 或篡改账本。
 */
export type SqlMigrationLeaseGuard = {
  /** 租约丢失或外部取消时触发的中止信号。 */
  signal?: AbortSignal;
  /** 若当前执行者已失去租约则立即抛错阻断后续操作。 */
  assertValid: () => void;
};

/** 分布式锁抽象：生产默认接 `@fastgpt/dal/redis/caches/lease` `LeaseCache`，单测可注入纯内存锁。 */
export type SqlMigrationLock = {
  withLock: <T>(params: {
    key: string;
    label: string;
    fn: (lease: SqlMigrationLeaseGuard) => Promise<T>;
  }) => Promise<T>;
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
  /** 租约丢失或外部取消信号（未注入分布式锁时为 `undefined`）。 */
  signal?: AbortSignal;
  /** 校验迁移分布式锁租约是否仍有效；失效时立即抛错阻断后续 DDL 或写入。 */
  assertLeaseValid: () => void;
  ensureIndex: (params: {
    table: string;
    index: SqlIndexDef;
    concurrently?: boolean;
    lockWaitTimeoutSec?: number;
    /**
     * MySQL 8+ 在线建索引（`ALGORITHM=INPLACE LOCK=NONE`）被引擎拒绝时是否允许退化为锁表建索引。
     * 默认 `false`（直接抛错，严禁静默退化导致生产大表锁表）。
     */
    allowBlockingFallback?: boolean;
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
  /** 永久稳定且按 `(scope, datasource)` 严格字典序递增的迁移 ID（如 `0001_init_app_registrations`）。 */
  id: string;
  name: string;
  scope: SqlMigrationScope;
  /** 逻辑数据源；默认为 `'main'`。`logMode === 'shared'` 时 `'log'` 迁移自动随主库执行。 */
  datasource?: DbDatasource;
  /**
   * 是否在单事务内执行 `up` 与账本写入（仅 PostgreSQL 生效，默认 `true`）。
   * - 包含 PG `CREATE/DROP INDEX CONCURRENTLY` 或长耗时大表在线 DDL 时设为 `false`；
   * - MySQL / OceanBase 中 DDL 会触发隐式提交，runner 统一以非事务可重入方式执行 `up`
   *   并在成功后幂等写入账本，因此所有迁移 `up` 必须使用可重入 DDL helper。
   */
  transactional?: boolean;
  up: (ctx: SqlMigrationContext) => Promise<void>;
};

export type SqlMigrationLedgerEntryRef = {
  datasource: DbDatasource;
  id: string;
};

export type SqlMigrationRunResult = {
  scope: SqlMigrationScope;
  datasource: DbDatasource;
  datasources: DbDatasource[];
  dialect: SqlDialect;
  applied: string[];
  appliedEntries: SqlMigrationLedgerEntryRef[];
  skippedFutureIds: string[];
  skippedFutureEntries: SqlMigrationLedgerEntryRef[];
  alreadyAppliedCount: number;
};

export type SqlSchemaInspectReport = {
  datasource: DbDatasource;
  dialect: SqlDialect;
  missingTables: string[];
  missingColumns: Array<{ table: string; column: string }>;
  columnMismatches: Array<{ table: string; column: string; reason: string }>;
  missingIndexes: Array<{ table: string; indexName: string }>;
  indexMismatches: Array<{ table: string; indexName: string; reason: string }>;
  invalidIndexes: Array<{ table: string; indexName: string }>;
  extraManagedIndexes: Array<{ table: string; indexName: string }>;
  customerIndexes: Array<{ table: string; indexName: string }>;
};
