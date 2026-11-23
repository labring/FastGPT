import { createHash } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import { DbConfigurationError } from '../../errors';
import type { DbDatasource, DbLogMode, DbLogger, SqlDialect } from '../../types';
import { applySqlTableDDL, dropSqlIndexIfExists, ensureSqlIndex } from './helpers';
import type {
  SqlMigrationContext,
  SqlMigrationDefinition,
  SqlMigrationLeaseGuard,
  SqlMigrationLedgerEntryRef,
  SqlMigrationLock,
  SqlMigrationRunResult,
  SqlMigrationScope
} from './types';

export const SQL_MIGRATIONS_LEDGER_TABLE = '_fg_sql_migrations';

const VALID_MIGRATION_ID_REGEX = /^\d{4,8}_[a-z0-9_]+$/;

const silentLogger: DbLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

const noopLeaseGuard: SqlMigrationLeaseGuard = {
  assertValid: () => undefined
};

const assertLeaseGuardValid = (lease: SqlMigrationLeaseGuard): void => {
  lease.assertValid();
  lease.signal?.throwIfAborted();
};

const makeLedgerKey = (datasource: DbDatasource, id: string): string => `${datasource}:${id}`;

const computeMigrationChecksum = (migration: SqlMigrationDefinition): string => {
  const migrationDatasource = migration.datasource ?? 'main';
  return createHash('sha256')
    .update(
      `${migration.scope}:${migrationDatasource}:${migration.id}:${migration.name}:${migration.up.toString()}`
    )
    .digest('hex');
};

const resolveTargetDatasources = ({
  datasource,
  logMode,
  datasources
}: {
  datasource: DbDatasource;
  logMode?: DbLogMode;
  datasources?: readonly DbDatasource[];
}): DbDatasource[] => {
  if (datasources !== undefined) {
    const deduped: DbDatasource[] = [];
    for (const item of datasources) {
      if (item !== 'main' && item !== 'log') {
        throw new DbConfigurationError(`Invalid SQL migration datasource "${String(item)}"`);
      }
      if (!deduped.includes(item)) {
        deduped.push(item);
      }
    }
    if (deduped.length === 0) {
      throw new DbConfigurationError('SQL migrations require at least one target datasource');
    }
    return deduped;
  }

  if (logMode === 'shared' && datasource === 'log') {
    throw new DbConfigurationError(
      'Cannot run SQL migrations with datasource "log" and logMode "shared"; target datasource "main" in shared mode or pass explicit datasources'
    );
  }

  // 未显式指定 logMode 时：main 默认按 shared 执行 ['main', 'log']；
  // 显式指定 datasource === 'log' 则默认视为独立日志库，绝不意外把 main 迁移落入 log 库。
  const resolvedLogMode: DbLogMode = logMode ?? (datasource === 'log' ? 'separate' : 'shared');
  return resolvedLogMode === 'shared' ? ['main', 'log'] : [datasource];
};

const resolvePhysicalLockKey = ({
  dialect,
  datasource,
  logMode,
  lockKey
}: {
  dialect: SqlDialect;
  datasource: DbDatasource;
  logMode?: DbLogMode;
  lockKey?: string;
}): string => {
  if (lockKey !== undefined) {
    const trimmed = lockKey.trim();
    if (trimmed.length === 0) {
      throw new DbConfigurationError('SQL migration lockKey must be a non-empty string');
    }
    return trimmed.startsWith('sql-migrations:') ? trimmed : `sql-migrations:${trimmed}`;
  }

  // 锁键按物理数据库实例维度收敛：不拆分 scope（core/pro 串行），shared 模式下也不拆分 main/log。
  const resolvedLogMode: DbLogMode = logMode ?? (datasource === 'log' ? 'separate' : 'shared');
  const physicalSlot = resolvedLogMode === 'separate' ? datasource : 'main';
  return `sql-migrations:${dialect}:${physicalSlot}`;
};

const ensureLedgerTable = async ({
  db,
  dialect
}: {
  db: Kysely<any>;
  dialect: SqlDialect;
}): Promise<void> => {
  if (dialect === 'postgres') {
    await sql
      .raw(
        `
      CREATE TABLE IF NOT EXISTS "${SQL_MIGRATIONS_LEDGER_TABLE}" (
        "scope" VARCHAR(16) NOT NULL,
        "datasource" VARCHAR(16) NOT NULL,
        "id" VARCHAR(64) NOT NULL,
        "name" VARCHAR(128) NOT NULL,
        "checksum" VARCHAR(64) NOT NULL,
        "executed_at" TIMESTAMPTZ NOT NULL,
        "duration_ms" INTEGER NOT NULL,
        PRIMARY KEY ("scope", "datasource", "id")
      );
    `
      )
      .execute(db);
    return;
  }

  await sql
    .raw(
      `
    CREATE TABLE IF NOT EXISTS \`${SQL_MIGRATIONS_LEDGER_TABLE}\` (
      \`scope\` VARCHAR(16) NOT NULL,
      \`datasource\` VARCHAR(16) NOT NULL,
      \`id\` VARCHAR(64) NOT NULL,
      \`name\` VARCHAR(128) NOT NULL,
      \`checksum\` VARCHAR(64) NOT NULL,
      \`executed_at\` DATETIME(3) NOT NULL,
      \`duration_ms\` INTEGER NOT NULL,
      PRIMARY KEY (\`scope\`, \`datasource\`, \`id\`)
    ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
  `
    )
    .execute(db);
};

const recordLedgerRow = async ({
  executor,
  dialect,
  row
}: {
  executor: Kysely<any>;
  dialect: SqlDialect;
  row: {
    scope: SqlMigrationScope;
    datasource: DbDatasource;
    id: string;
    name: string;
    checksum: string;
    executed_at: Date;
    duration_ms: number;
  };
}): Promise<void> => {
  if (dialect === 'postgres') {
    await executor
      .insertInto(SQL_MIGRATIONS_LEDGER_TABLE)
      .values(row)
      .onConflict((oc) => oc.columns(['scope', 'datasource', 'id']).doNothing())
      .execute();
    return;
  }

  // MySQL / OceanBase：DDL 隐式提交导致重入场景可能出现并发账本写入，以 ON DUPLICATE KEY UPDATE 幂等落账
  await executor
    .insertInto(SQL_MIGRATIONS_LEDGER_TABLE)
    .values(row)
    .onDuplicateKeyUpdate({ id: row.id })
    .execute();
};

/** 校验待执行的 SQL 迁移列表：强制合法 datasource 与按 `(scope, datasource)` 唯一且严格升序的稳定 ID。 */
export const validateSqlMigrations = (migrations: readonly SqlMigrationDefinition[]): void => {
  const seenByStream = new Map<string, string>();
  for (const migration of migrations) {
    if (!VALID_MIGRATION_ID_REGEX.test(migration.id)) {
      throw new DbConfigurationError(
        `Invalid SQL migration id "${migration.id}" (expected NNNN_short_name)`
      );
    }
    const migrationDatasource = migration.datasource ?? 'main';
    if (migrationDatasource !== 'main' && migrationDatasource !== 'log') {
      throw new DbConfigurationError(
        `Invalid SQL migration datasource "${String(migrationDatasource)}" on "${migration.id}"`
      );
    }
    const key = `${migration.scope}:${migrationDatasource}`;
    const prevId = seenByStream.get(key);
    if (prevId !== undefined && migration.id <= prevId) {
      throw new DbConfigurationError(
        `SQL migration id "${migration.id}" must be strictly greater than previous "${prevId}" for ${key}`
      );
    }
    seenByStream.set(key, migration.id);
  }
};

const createMigrationContext = ({
  db,
  dialect,
  datasource,
  logger,
  lease
}: {
  db: Kysely<any>;
  dialect: SqlDialect;
  datasource: DbDatasource;
  logger: DbLogger;
  lease: SqlMigrationLeaseGuard;
}): SqlMigrationContext => ({
  db,
  dialect,
  datasource,
  logger,
  signal: lease.signal,
  assertLeaseValid: () => assertLeaseGuardValid(lease),
  ensureIndex: ({ table, index, concurrently, lockWaitTimeoutSec, allowBlockingFallback }) =>
    ensureSqlIndex({
      db,
      dialect,
      table,
      index,
      concurrently,
      lockWaitTimeoutSec,
      allowBlockingFallback,
      lease
    }),
  dropIndexIfExists: ({ table, indexName, concurrently, lockWaitTimeoutSec }) =>
    dropSqlIndexIfExists({
      db,
      dialect,
      table,
      indexName,
      concurrently,
      lockWaitTimeoutSec,
      lease
    }),
  applyTableDDL: (table) => applySqlTableDDL({ db, dialect, table, lease })
});

/**
 * 轻量自研 SQL 版本化 DDL 迁移器。
 *
 * 刻意替代 Kysely 原生 `Migrator`，一次性规避其四项生产陷阱：
 * 1. 按物理库归属 `datasources` 严格过滤迁移，并在 `_fg_sql_migrations` 中以 `(scope, datasource, id)` 建主键，
 *    既保证 `separate` 模式下 `main`/`log` 物理零串库，又避免 `shared` 模式下同 ID 跨 datasource 静默跳过；
 * 2. 区分方言 DDL 事务边界：PostgreSQL 默认支持单迁移事务（`transactional: false` 时允许 `CONCURRENTLY`），
 *    MySQL/OceanBase 因 DDL 隐式提交显式以非事务幂等重入模式执行 `up` 并幂等写入账本；
 * 3. 通过物理库维度分布式锁（默认 Redis `LeaseCache`）串行化 `core`/`pro`/`shared` 迁移，并在每次迁移、
 *    每条 DDL 与每次账本写入前强制校验租约有效；
 * 4. 回滚/蓝绿发布时遇到账本中存在本地未知的未来版本 ID，记录 info 日志并安全跳过，绝不抛出崩溃错误。
 */
export const runSqlMigrations = async ({
  db,
  dialect,
  scope,
  datasource = 'main',
  logMode,
  datasources,
  lockKey,
  migrations,
  lock,
  logger = silentLogger
}: {
  db: Kysely<any>;
  dialect: SqlDialect;
  scope: SqlMigrationScope;
  datasource?: DbDatasource;
  logMode?: DbLogMode;
  /** 显式覆盖该物理库承接的逻辑数据源集合；省略时按 `datasource` + `logMode` 推导。 */
  datasources?: readonly DbDatasource[];
  /** 物理数据库锁标识（省略时按 `dialect` + 物理槽位推导，不按 `scope` 拆分）。 */
  lockKey?: string;
  migrations: readonly SqlMigrationDefinition[];
  lock?: SqlMigrationLock;
  logger?: DbLogger;
}): Promise<SqlMigrationRunResult> => {
  const targetDatasources = resolveTargetDatasources({ datasource, logMode, datasources });
  const targetDatasourceSet = new Set<DbDatasource>(targetDatasources);

  const scopedAllMigrations = migrations.filter((m) => m.scope === scope);
  validateSqlMigrations(scopedAllMigrations);

  const targetMigrations = scopedAllMigrations.filter((m) =>
    targetDatasourceSet.has(m.datasource ?? 'main')
  );

  const executeLocked = async (lease: SqlMigrationLeaseGuard): Promise<SqlMigrationRunResult> => {
    assertLeaseGuardValid(lease);
    await ensureLedgerTable({ db, dialect });

    assertLeaseGuardValid(lease);
    const appliedRows = await db
      .selectFrom(SQL_MIGRATIONS_LEDGER_TABLE)
      .select(['datasource', 'id'])
      .where('scope', '=', scope)
      .where('datasource', 'in', targetDatasources)
      .orderBy('datasource', 'asc')
      .orderBy('id', 'asc')
      .execute();

    const appliedSet = new Set<string>();
    const appliedLedgerEntries: SqlMigrationLedgerEntryRef[] = [];
    for (const row of appliedRows) {
      const rowDatasource = String(row.datasource) as DbDatasource;
      const rowId = String(row.id);
      appliedSet.add(makeLedgerKey(rowDatasource, rowId));
      appliedLedgerEntries.push({ datasource: rowDatasource, id: rowId });
    }

    const localKeySet = new Set<string>(
      targetMigrations.map((m) => makeLedgerKey(m.datasource ?? 'main', m.id))
    );

    // 回滚/多版本灰度的关键保护：账本里的未来版本记录按 (datasource, id) 向前兼容跳过，不阻断老版本 Pod 启动
    const skippedFutureEntries: SqlMigrationLedgerEntryRef[] = [];
    for (const entry of appliedLedgerEntries) {
      if (!localKeySet.has(makeLedgerKey(entry.datasource, entry.id))) {
        skippedFutureEntries.push(entry);
      }
    }
    const skippedFutureIds = skippedFutureEntries.map((entry) => entry.id);

    if (skippedFutureEntries.length > 0) {
      logger.info('SQL migrations ledger contains newer future migration ids; skipping safely', {
        scope,
        datasource,
        datasources: targetDatasources,
        dialect,
        skippedFutureIds,
        skippedFutureEntries
      });
    }

    const applied: string[] = [];
    const appliedEntries: SqlMigrationLedgerEntryRef[] = [];
    let alreadyAppliedCount = 0;

    for (const migration of targetMigrations) {
      const migrationDatasource: DbDatasource = migration.datasource ?? 'main';
      const ledgerKey = makeLedgerKey(migrationDatasource, migration.id);
      if (appliedSet.has(ledgerKey)) {
        alreadyAppliedCount += 1;
        continue;
      }

      // 每次开始新迁移前先核验租约，防止前一步耗时过长已丢失锁仍继续执行后续 DDL
      assertLeaseGuardValid(lease);

      const startedAt = Date.now();
      const checksum = computeMigrationChecksum(migration);
      const buildLedgerRow = (durationMs: number) => ({
        scope,
        datasource: migrationDatasource,
        id: migration.id,
        name: migration.name,
        checksum,
        executed_at: new Date(),
        duration_ms: durationMs
      });

      // 仅 PostgreSQL 支持 DDL 事务；MySQL / OceanBase 中任何 DDL 都会隐式提交，
      // 严禁在 MySQL/OceanBase 上包一层虚假事务制造原子性假象，统一走非事务可重入路径。
      const runInSqlTransaction = dialect === 'postgres' && migration.transactional !== false;

      if (!runInSqlTransaction) {
        const ctx = createMigrationContext({
          db,
          dialect,
          datasource: migrationDatasource,
          logger,
          lease
        });
        await migration.up(ctx);
        assertLeaseGuardValid(lease);
        const durationMs = Date.now() - startedAt;
        await recordLedgerRow({
          executor: db,
          dialect,
          row: buildLedgerRow(durationMs)
        });
      } else {
        await db.transaction().execute(async (trx) => {
          assertLeaseGuardValid(lease);
          const ctx = createMigrationContext({
            db: trx,
            dialect,
            datasource: migrationDatasource,
            logger,
            lease
          });
          await migration.up(ctx);
          assertLeaseGuardValid(lease);
          const durationMs = Date.now() - startedAt;
          await recordLedgerRow({
            executor: trx,
            dialect,
            row: buildLedgerRow(durationMs)
          });
        });
      }

      appliedSet.add(ledgerKey);
      applied.push(migration.id);
      appliedEntries.push({ datasource: migrationDatasource, id: migration.id });
      logger.info('SQL migration applied', {
        scope,
        datasource: migrationDatasource,
        dialect,
        migrationId: migration.id,
        durationMs: Date.now() - startedAt
      });
    }

    return {
      scope,
      datasource,
      datasources: targetDatasources,
      dialect,
      applied,
      appliedEntries,
      skippedFutureIds,
      skippedFutureEntries,
      alreadyAppliedCount
    };
  };

  if (lock !== undefined) {
    return lock.withLock({
      key: resolvePhysicalLockKey({ dialect, datasource, logMode, lockKey }),
      label: `sql-migrations:${scope}`,
      fn: executeLocked
    });
  }

  return executeLocked(noopLeaseGuard);
};
