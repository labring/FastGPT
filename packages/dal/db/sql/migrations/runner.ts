import { createHash } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import { DbConfigurationError } from '../../errors';
import type { DbDatasource, DbLogger, SqlDialect } from '../../types';
import { applySqlTableDDL, dropSqlIndexIfExists, ensureSqlIndex } from './helpers';
import type {
  SqlMigrationContext,
  SqlMigrationDefinition,
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

const computeMigrationChecksum = (migration: SqlMigrationDefinition): string =>
  createHash('sha256')
    .update(`${migration.scope}:${migration.id}:${migration.name}:${migration.up.toString()}`)
    .digest('hex');

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
        "id" VARCHAR(64) NOT NULL,
        "name" VARCHAR(128) NOT NULL,
        "checksum" VARCHAR(64) NOT NULL,
        "executed_at" TIMESTAMPTZ NOT NULL,
        "duration_ms" INTEGER NOT NULL,
        PRIMARY KEY ("scope", "id")
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
      \`id\` VARCHAR(64) NOT NULL,
      \`name\` VARCHAR(128) NOT NULL,
      \`checksum\` VARCHAR(64) NOT NULL,
      \`executed_at\` DATETIME(3) NOT NULL,
      \`duration_ms\` INTEGER NOT NULL,
      PRIMARY KEY (\`scope\`, \`id\`)
    ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
  `
    )
    .execute(db);
};

/** 校验待执行的 SQL 迁移列表：强制唯一且严格升序的稳定 ID，防止发布后乱序或重名冲突。 */
export const validateSqlMigrations = (migrations: readonly SqlMigrationDefinition[]): void => {
  const seenByScope = new Map<string, string>();
  for (const migration of migrations) {
    if (!VALID_MIGRATION_ID_REGEX.test(migration.id)) {
      throw new DbConfigurationError(
        `Invalid SQL migration id "${migration.id}" (expected NNNN_short_name)`
      );
    }
    const key = `${migration.scope}:${migration.datasource ?? 'main'}`;
    const prevId = seenByScope.get(key);
    if (prevId !== undefined && migration.id <= prevId) {
      throw new DbConfigurationError(
        `SQL migration id "${migration.id}" must be strictly greater than previous "${prevId}" for ${key}`
      );
    }
    seenByScope.set(key, migration.id);
  }
};

const createMigrationContext = ({
  db,
  dialect,
  datasource,
  logger
}: {
  db: Kysely<any>;
  dialect: SqlDialect;
  datasource: DbDatasource;
  logger: DbLogger;
}): SqlMigrationContext => ({
  db,
  dialect,
  datasource,
  logger,
  ensureIndex: ({ table, index, concurrently, lockWaitTimeoutSec }) =>
    ensureSqlIndex({ db, dialect, table, index, concurrently, lockWaitTimeoutSec }),
  dropIndexIfExists: ({ table, indexName, concurrently, lockWaitTimeoutSec }) =>
    dropSqlIndexIfExists({ db, dialect, table, indexName, concurrently, lockWaitTimeoutSec }),
  applyTableDDL: (table) => applySqlTableDDL({ db, dialect, table })
});

/**
 * 轻量自研 SQL 版本化 DDL 迁移器。
 *
 * 刻意替代 Kysely 原生 `Migrator`，一次性规避其三项生产陷阱：
 * 1. 支持单迁移 `transactional: false`（不包裹 `BEGIN/COMMIT`，允许 PG `CREATE/DROP INDEX CONCURRENTLY`）；
 * 2. 通过可注入分布式锁（默认 Redis `LeaseCache`）防多 Pod 惊群，零数据库会话级 advisory lock 依赖（兼容 OBProxy/PgBouncer）；
 * 3. 回滚/蓝绿发布时遇到账本中存在本地未知的未来版本 ID，记录 info 日志并安全跳过，绝不抛出崩溃错误。
 */
export const runSqlMigrations = async ({
  db,
  dialect,
  scope,
  datasource = 'main',
  migrations,
  lock,
  logger = silentLogger
}: {
  db: Kysely<any>;
  dialect: SqlDialect;
  scope: SqlMigrationScope;
  datasource?: DbDatasource;
  migrations: readonly SqlMigrationDefinition[];
  lock?: SqlMigrationLock;
  logger?: DbLogger;
}): Promise<SqlMigrationRunResult> => {
  const scopedMigrations = migrations.filter((m) => m.scope === scope);
  validateSqlMigrations(scopedMigrations);

  const executeLocked = async (): Promise<SqlMigrationRunResult> => {
    await ensureLedgerTable({ db, dialect });

    const appliedRows = await db
      .selectFrom(SQL_MIGRATIONS_LEDGER_TABLE)
      .select(['id'])
      .where('scope', '=', scope)
      .orderBy('id', 'asc')
      .execute();

    const appliedSet = new Set<string>(appliedRows.map((row) => String(row.id)));
    const localIdSet = new Set<string>(scopedMigrations.map((m) => m.id));

    // 回滚/多版本灰度的关键保护：账本里的未来版本 ID 直接向前兼容跳过，不阻断老版本 Pod 启动
    const skippedFutureIds: string[] = [];
    for (const appliedId of appliedSet) {
      if (!localIdSet.has(appliedId)) {
        skippedFutureIds.push(appliedId);
      }
    }
    if (skippedFutureIds.length > 0) {
      logger.info('SQL migrations ledger contains newer future migration ids; skipping safely', {
        scope,
        datasource,
        dialect,
        skippedFutureIds
      });
    }

    const applied: string[] = [];
    let alreadyAppliedCount = 0;

    for (const migration of scopedMigrations) {
      if (appliedSet.has(migration.id)) {
        alreadyAppliedCount += 1;
        continue;
      }

      const startedAt = Date.now();
      const checksum = computeMigrationChecksum(migration);
      const recordRow = (durationMs: number) => ({
        scope,
        id: migration.id,
        name: migration.name,
        checksum,
        executed_at: new Date(),
        duration_ms: durationMs
      });

      if (migration.transactional === false) {
        // 非事务模式（如 PG CONCURRENTLY 或大表在线 DDL）：不包外层事务，完成后写入账本
        const ctx = createMigrationContext({ db, dialect, datasource, logger });
        await migration.up(ctx);
        const durationMs = Date.now() - startedAt;
        await db.insertInto(SQL_MIGRATIONS_LEDGER_TABLE).values(recordRow(durationMs)).execute();
      } else {
        await db.transaction().execute(async (trx) => {
          const ctx = createMigrationContext({ db: trx, dialect, datasource, logger });
          await migration.up(ctx);
          const durationMs = Date.now() - startedAt;
          await trx.insertInto(SQL_MIGRATIONS_LEDGER_TABLE).values(recordRow(durationMs)).execute();
        });
      }

      applied.push(migration.id);
      logger.info('SQL migration applied', {
        scope,
        datasource,
        dialect,
        migrationId: migration.id,
        durationMs: Date.now() - startedAt
      });
    }

    return {
      scope,
      datasource,
      dialect,
      applied,
      skippedFutureIds,
      alreadyAppliedCount
    };
  };

  if (lock !== undefined) {
    return lock.withLock({
      key: `sql-migrations:${dialect}:${datasource}:${scope}`,
      label: `sql-migrations:${scope}`,
      fn: executeLocked
    });
  }

  return executeLocked();
};
