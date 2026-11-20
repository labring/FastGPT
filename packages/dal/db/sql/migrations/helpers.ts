import { Kysely, MysqlDialect, PostgresDialect, sql, type MysqlPool } from 'kysely';
import { createPool } from 'mysql2';
import { Pool } from 'pg';
import { LeaseCache, type LeaseCacheOptions } from '../../../redis/caches/lease';
import { DbConfigurationError } from '../../errors';
import type { DbDatasource, SqlDialect } from '../../types';
import {
  assertManagedSqlIndexName,
  compileSqlIndexColumnList,
  compileSqlTableDDL,
  quoteSqlIdentifier,
  SQL_INDEX_NAME_PREFIX,
  type SqlIndexDef,
  type SqlTableDefinition
} from '../ddl';
import type {
  DropSqlIndexResult,
  EnsureSqlIndexResult,
  SqlMigrationLock,
  SqlSchemaInspectReport
} from './types';

const collectErrorCodes = (error: unknown): Array<string | number> => {
  if (error === null || error === undefined || typeof error !== 'object') {
    return [];
  }
  const rec = error as Record<string, unknown>;
  const codes: Array<string | number> = [];
  for (const field of ['code', 'errno'] as const) {
    const val = rec[field];
    if (typeof val === 'string' || typeof val === 'number') {
      codes.push(val);
    }
  }
  if (rec.cause !== undefined && rec.cause !== error) {
    codes.push(...collectErrorCodes(rec.cause));
  }
  return codes;
};

const hasErrorCode = (error: unknown, targets: readonly (string | number)[]): boolean => {
  const codes = collectErrorCodes(error);
  return codes.some((code) => targets.includes(code));
};

const setMysqlSessionLockWaitTimeout = async (
  db: Kysely<any>,
  lockWaitTimeoutSec: number
): Promise<void> => {
  if (!Number.isSafeInteger(lockWaitTimeoutSec) || lockWaitTimeoutSec <= 0) {
    return;
  }
  await sql
    .raw(`SET SESSION lock_wait_timeout = ${Math.floor(lockWaitTimeoutSec)}`)
    .execute(db)
    .catch(() => undefined);
};

/**
 * 基于 `@fastgpt/dal/redis/caches/lease` 构建 SQL DDL 迁移分布式互斥锁。
 *
 * 刻意不依赖数据库会话级 `GET_LOCK` / `pg_advisory_lock`，以彻底规避 OBProxy 与 PgBouncer
 * 事务池化模式下会话迁移导致锁泄露或提前释放的风险。
 */
export const createRedisSqlMigrationLock = ({
  leaseCache = new LeaseCache(),
  ttlMs = 60_000,
  waitTimeoutMs = 120_000
}: {
  leaseCache?: LeaseCache;
  ttlMs?: number;
  waitTimeoutMs?: number;
} & LeaseCacheOptions = {}): SqlMigrationLock => ({
  withLock: ({ key, label, fn }) =>
    leaseCache.withConcurrency({
      key,
      label,
      concurrency: 1,
      ttlMs,
      waitTimeoutMs,
      fn: () => fn()
    })
});

/**
 * 为大表 SQL DDL 迁移创建独立无 60s 业务查询超时的轻量专用连接，避免阻塞常规查询池。
 */
export const createSqlDdlExecutor = ({
  dialect,
  url
}: {
  dialect: SqlDialect;
  url: string;
}): { db: Kysely<any>; close: () => Promise<void> } => {
  if (dialect === 'postgres') {
    const db = new Kysely<any>({
      dialect: new PostgresDialect({
        pool: new Pool({
          connectionString: url,
          max: 2,
          statement_timeout: 0
        })
      })
    });
    return {
      db,
      close: () => db.destroy()
    };
  }

  const db = new Kysely<any>({
    dialect: new MysqlDialect({
      pool: createPool({
        uri: url,
        connectionLimit: 2,
        waitForConnections: true,
        enableKeepAlive: true,
        timezone: 'Z',
        charset: 'utf8mb4',
        supportBigNumbers: true,
        bigNumberStrings: true
      }) as unknown as MysqlPool
    })
  });
  return {
    db,
    close: () => db.destroy()
  };
};

/** 对单张声明表执行方言编译后的幂等 `CREATE TABLE IF NOT EXISTS`（及 PG 初始索引）。 */
export const applySqlTableDDL = async ({
  db,
  dialect,
  table
}: {
  db: Kysely<any>;
  dialect: SqlDialect;
  table: SqlTableDefinition;
}): Promise<void> => {
  const statements = compileSqlTableDDL(table, dialect);
  for (const statement of statements) {
    await sql.raw(statement).execute(db);
  }
};

/**
 * 幂等创建 FastGPT 托管 SQL 索引（强制 `fg_*` 命名）：
 * - PostgreSQL：探测 `pg_index.indisvalid = false` 僵尸索引先自动清理再重建，默认 `CONCURRENTLY` 不锁表；
 * - MySQL 8+：先设 `lock_wait_timeout` 并尝试 `ALGORITHM=INPLACE, LOCK=NONE` 在线建索引，忽略 `1061` 幂等；
 * - OceanBase：查 `information_schema.statistics` 幂等跳过，并发竞态下忽略 `1061`（`ER_DUP_KEYNAME`）。
 */
export const ensureSqlIndex = async ({
  db,
  dialect,
  table,
  index,
  concurrently = true,
  lockWaitTimeoutSec = 5
}: {
  db: Kysely<any>;
  dialect: SqlDialect;
  table: string;
  index: SqlIndexDef;
  concurrently?: boolean;
  lockWaitTimeoutSec?: number;
}): Promise<EnsureSqlIndexResult> => {
  assertManagedSqlIndexName(index.name);
  const tableIdent = quoteSqlIdentifier(table, dialect);
  const indexIdent = quoteSqlIdentifier(index.name, dialect);
  const columnList = compileSqlIndexColumnList(index.columns, dialect);
  const uniqueSql = index.unique === true ? 'UNIQUE ' : '';

  if (dialect === 'postgres') {
    const existingRes = await sql<{ indisvalid: boolean }>`
      SELECT i.indisvalid
      FROM pg_index i
      JOIN pg_class idx_cls ON idx_cls.oid = i.indexrelid
      JOIN pg_class tbl_cls ON tbl_cls.oid = i.indrelid
      JOIN pg_namespace ns ON ns.oid = idx_cls.relnamespace
      WHERE ns.nspname = current_schema()
        AND tbl_cls.relname = ${table}
        AND idx_cls.relname = ${index.name}
      LIMIT 1
    `.execute(db);

    const existing = existingRes.rows[0];
    let healed = false;
    if (existing !== undefined) {
      if (existing.indisvalid === true) {
        return { table, indexName: index.name, status: 'exists' };
      }
      // PG CONCURRENTLY 中断会遗留 indisvalid=false 僵尸索引，先清理后再安全重建
      const dropClause = concurrently ? 'CONCURRENTLY ' : '';
      await sql.raw(`DROP INDEX ${dropClause}IF EXISTS ${indexIdent};`).execute(db);
      healed = true;
    }

    const createClause = concurrently ? 'CONCURRENTLY ' : '';
    await sql
      .raw(
        `CREATE ${uniqueSql}INDEX ${createClause}IF NOT EXISTS ${indexIdent} ON ${tableIdent} (${columnList});`
      )
      .execute(db);

    return {
      table,
      indexName: index.name,
      status: healed ? 'healed_and_created' : 'created'
    };
  }

  // OceanBase / MySQL：先通过 information_schema 幂等探测
  const existingRes = await sql<{ cnt: string | number }>`
    SELECT COUNT(*) AS cnt
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = ${table}
      AND index_name = ${index.name}
  `.execute(db);

  if (Number(existingRes.rows[0]?.cnt ?? 0) > 0) {
    return { table, indexName: index.name, status: 'exists' };
  }

  await setMysqlSessionLockWaitTimeout(db, lockWaitTimeoutSec);

  const baseStmt = `CREATE ${uniqueSql}INDEX ${indexIdent} ON ${tableIdent} (${columnList})`;
  try {
    if (dialect === 'mysql') {
      try {
        await sql.raw(`${baseStmt} ALGORITHM=INPLACE LOCK=NONE;`).execute(db);
      } catch (error) {
        // 个别 MySQL 引擎/列类型不支持 INPLACE+NONE 时自动退化为常规建索引；重复键直接视为幂等成功
        if (hasErrorCode(error, [1061, 'ER_DUP_KEYNAME'])) {
          return { table, indexName: index.name, status: 'exists' };
        }
        if (
          hasErrorCode(error, [
            1845,
            1846,
            'ER_ALTER_OPERATION_NOT_SUPPORTED',
            'ER_ALTER_OPERATION_NOT_SUPPORTED_REASON'
          ])
        ) {
          await sql.raw(`${baseStmt};`).execute(db);
        } else {
          throw error;
        }
      }
    } else {
      await sql.raw(`${baseStmt};`).execute(db);
    }
  } catch (error) {
    if (hasErrorCode(error, [1061, 'ER_DUP_KEYNAME'])) {
      return { table, indexName: index.name, status: 'exists' };
    }
    throw error;
  }

  return { table, indexName: index.name, status: 'created' };
};

/**
 * 幂等删除 FastGPT 托管 SQL 索引。
 *
 * 硬守卫：仅允许删除 `fg_` 前缀托管索引，任何无 `fg_` 前缀的客户 DBA 自建索引都会在触库前直接抛出
 * `DbConfigurationError`，从底层杜绝误删客户生产索引。
 */
export const dropSqlIndexIfExists = async ({
  db,
  dialect,
  table,
  indexName,
  concurrently = true,
  lockWaitTimeoutSec = 5
}: {
  db: Kysely<any>;
  dialect: SqlDialect;
  table: string;
  indexName: string;
  concurrently?: boolean;
  lockWaitTimeoutSec?: number;
}): Promise<DropSqlIndexResult> => {
  if (!indexName.startsWith(SQL_INDEX_NAME_PREFIX)) {
    throw new DbConfigurationError(
      `Refusing to drop non-managed SQL index "${indexName}" on "${table}" (only "${SQL_INDEX_NAME_PREFIX}*" managed indexes may be dropped)`
    );
  }
  assertManagedSqlIndexName(indexName);

  const tableIdent = quoteSqlIdentifier(table, dialect);
  const indexIdent = quoteSqlIdentifier(indexName, dialect);

  if (dialect === 'postgres') {
    const existingRes = await sql<{ exists: number }>`
      SELECT 1 AS exists
      FROM pg_index i
      JOIN pg_class idx_cls ON idx_cls.oid = i.indexrelid
      JOIN pg_class tbl_cls ON tbl_cls.oid = i.indrelid
      JOIN pg_namespace ns ON ns.oid = idx_cls.relnamespace
      WHERE ns.nspname = current_schema()
        AND tbl_cls.relname = ${table}
        AND idx_cls.relname = ${indexName}
      LIMIT 1
    `.execute(db);

    if (existingRes.rows.length === 0) {
      return { table, indexName, status: 'missing' };
    }

    const dropClause = concurrently ? 'CONCURRENTLY ' : '';
    await sql.raw(`DROP INDEX ${dropClause}IF EXISTS ${indexIdent};`).execute(db);
    return { table, indexName, status: 'dropped' };
  }

  const existingRes = await sql<{ cnt: string | number }>`
    SELECT COUNT(*) AS cnt
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = ${table}
      AND index_name = ${indexName}
  `.execute(db);

  if (Number(existingRes.rows[0]?.cnt ?? 0) === 0) {
    return { table, indexName, status: 'missing' };
  }

  await setMysqlSessionLockWaitTimeout(db, lockWaitTimeoutSec);
  try {
    await sql.raw(`DROP INDEX ${indexIdent} ON ${tableIdent};`).execute(db);
  } catch (error) {
    if (hasErrorCode(error, [1091, 'ER_CANT_DROP_FIELD_OR_KEY'])) {
      return { table, indexName, status: 'missing' };
    }
    throw error;
  }

  return { table, indexName, status: 'dropped' };
};

/**
 * 100% 只读的 SQL 表与索引巡检器（绝不执行任何写入或 DDL）。
 *
 * 比对物理库中现有表/索引与声明式 `SqlTableDefinition[]`：
 * - 报告缺失表、缺失索引、PG 失效僵尸索引（`indisvalid = false`）；
 * - 区分多出的托管索引（`fg_*`）与客户 DBA 自建索引（非 `fg_*`，仅作只读展示）。
 */
export const inspectSqlSchema = async ({
  db,
  dialect,
  datasource = 'main',
  tables
}: {
  db: Kysely<any>;
  dialect: SqlDialect;
  datasource?: DbDatasource;
  tables: readonly SqlTableDefinition[];
}): Promise<SqlSchemaInspectReport> => {
  const existingTables = new Set<string>();
  const liveIndexesByTable = new Map<
    string,
    Map<string, { isValid: boolean; isPrimary: boolean }>
  >();

  if (dialect === 'postgres') {
    const tblRes = await sql<{ tablename: string }>`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = current_schema()
    `.execute(db);
    for (const row of tblRes.rows) {
      existingTables.add(row.tablename);
    }

    const idxRes = await sql<{
      table_name: string;
      index_name: string;
      indisvalid: boolean;
      indisprimary: boolean;
    }>`
      SELECT
        tbl_cls.relname AS table_name,
        idx_cls.relname AS index_name,
        i.indisvalid,
        i.indisprimary
      FROM pg_index i
      JOIN pg_class idx_cls ON idx_cls.oid = i.indexrelid
      JOIN pg_class tbl_cls ON tbl_cls.oid = i.indrelid
      JOIN pg_namespace ns ON ns.oid = tbl_cls.relnamespace
      WHERE ns.nspname = current_schema()
    `.execute(db);

    for (const row of idxRes.rows) {
      let map = liveIndexesByTable.get(row.table_name);
      if (map === undefined) {
        map = new Map();
        liveIndexesByTable.set(row.table_name, map);
      }
      map.set(row.index_name, {
        isValid: row.indisvalid === true,
        isPrimary: row.indisprimary === true
      });
    }
  } else {
    const tblRes = await sql<{ table_name: string }>`
      SELECT table_name AS table_name
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
    `.execute(db);
    for (const row of tblRes.rows) {
      existingTables.add(row.table_name);
    }

    const idxRes = await sql<{ table_name: string; index_name: string }>`
      SELECT DISTINCT table_name AS table_name, index_name AS index_name
      FROM information_schema.statistics
      WHERE table_schema = DATABASE()
    `.execute(db);

    for (const row of idxRes.rows) {
      let map = liveIndexesByTable.get(row.table_name);
      if (map === undefined) {
        map = new Map();
        liveIndexesByTable.set(row.table_name, map);
      }
      map.set(row.index_name, {
        isValid: true,
        isPrimary: row.index_name === 'PRIMARY'
      });
    }
  }

  const missingTables: string[] = [];
  const missingIndexes: Array<{ table: string; indexName: string }> = [];
  const invalidIndexes: Array<{ table: string; indexName: string }> = [];
  const extraManagedIndexes: Array<{ table: string; indexName: string }> = [];
  const customerIndexes: Array<{ table: string; indexName: string }> = [];

  for (const table of tables) {
    if (!existingTables.has(table.name)) {
      missingTables.push(table.name);
      continue;
    }

    const liveMap = liveIndexesByTable.get(table.name) ?? new Map();
    const declaredNames = new Set((table.indexes ?? []).map((idx) => idx.name));

    for (const idx of table.indexes ?? []) {
      const live = liveMap.get(idx.name);
      if (live === undefined) {
        missingIndexes.push({ table: table.name, indexName: idx.name });
      } else if (!live.isValid) {
        invalidIndexes.push({ table: table.name, indexName: idx.name });
      }
    }

    for (const [liveName, meta] of liveMap.entries()) {
      if (meta.isPrimary || declaredNames.has(liveName)) {
        continue;
      }
      if (!meta.isValid) {
        invalidIndexes.push({ table: table.name, indexName: liveName });
      }
      if (liveName.startsWith(SQL_INDEX_NAME_PREFIX)) {
        extraManagedIndexes.push({ table: table.name, indexName: liveName });
      } else {
        customerIndexes.push({ table: table.name, indexName: liveName });
      }
    }
  }

  return {
    datasource,
    dialect,
    missingTables,
    missingIndexes,
    invalidIndexes,
    extraManagedIndexes,
    customerIndexes
  };
};
