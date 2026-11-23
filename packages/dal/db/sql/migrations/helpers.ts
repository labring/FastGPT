import { createHash } from 'node:crypto';
import { Kysely, MysqlDialect, PostgresDialect, sql, type MysqlPool } from 'kysely';
import { createPool } from 'mysql2';
import { Pool } from 'pg';
import { LeaseCache, type LeaseCacheOptions } from '../../../redis/caches/lease';
import { DbConfigurationError, DbError } from '../../errors';
import type { DbDatasource, SqlDialect } from '../../types';
import {
  assertManagedSqlIndexName,
  compileSqlIndexColumnList,
  compileSqlTableDDL,
  normalizeSqlIndexColumn,
  quoteSqlIdentifier,
  SQL_INDEX_NAME_PREFIX,
  type SqlColumnDef,
  type SqlIndexDef,
  type SqlIndexDirection,
  type SqlTableDefinition
} from '../ddl';
import type {
  DropSqlIndexResult,
  EnsureSqlIndexResult,
  SqlMigrationLeaseGuard,
  SqlMigrationLock,
  SqlSchemaInspectReport
} from './types';

type LiveSqlIndexColumn = {
  column: string | null;
  direction: SqlIndexDirection | 'unknown';
};

type LiveSqlIndexDefinition = {
  table: string;
  indexName: string;
  isValid: boolean;
  isPrimary: boolean;
  unique: boolean;
  isPartial: boolean;
  columns: LiveSqlIndexColumn[];
};

type LiveSqlColumnDefinition = {
  table: string;
  column: string;
  normalizedType: string;
  notNull: boolean;
  columnDefault: string | null;
};

const collectErrorCodes = (error: unknown, depth = 0): Array<string | number> => {
  if (depth > 3 || error === null || error === undefined || typeof error !== 'object') {
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
    codes.push(...collectErrorCodes(rec.cause, depth + 1));
  }
  return codes;
};

const hasErrorCode = (error: unknown, targets: readonly (string | number)[]): boolean => {
  const codes = collectErrorCodes(error);
  return codes.some((code) => targets.includes(code));
};

const assertLeaseGuardValid = (lease?: SqlMigrationLeaseGuard): void => {
  lease?.assertValid();
  lease?.signal?.throwIfAborted();
};

const toBooleanFlag = (value: unknown): boolean =>
  value === true || value === 1 || value === '1' || value === 't' || value === 'true';

const setMysqlSessionLockWaitTimeout = async ({
  conn,
  lockWaitTimeoutSec
}: {
  conn: Kysely<any>;
  lockWaitTimeoutSec: number;
}): Promise<void> => {
  if (!Number.isSafeInteger(lockWaitTimeoutSec) || lockWaitTimeoutSec <= 0) {
    return;
  }
  try {
    await sql
      .raw(`SET SESSION lock_wait_timeout = ${Math.floor(lockWaitTimeoutSec)}`)
      .execute(conn);
  } catch (error) {
    // 仅容忍个别兼容引擎不支持该系统变量（ER_UNKNOWN_SYSTEM_VARIABLE = 1193），
    // 绝不吞掉断连、鉴权失败、语法异常或租约冲突等真实错误。
    if (hasErrorCode(error, [1193, 'ER_UNKNOWN_SYSTEM_VARIABLE'])) {
      return;
    }
    throw error;
  }
};

const formatIndexColumns = (
  columns: ReadonlyArray<{ column: string | null; direction: SqlIndexDirection | 'unknown' }>
): string =>
  columns
    .map((entry) => {
      const name = entry.column ?? '<expression>';
      return entry.direction === 'asc' ? name : `${name} ${entry.direction.toUpperCase()}`;
    })
    .join(', ');

const getSqlIndexMismatchReason = ({
  table,
  expected,
  live
}: {
  table: string;
  expected: SqlIndexDef;
  live: LiveSqlIndexDefinition;
}): string | undefined => {
  if (live.table !== table) {
    return `Index "${expected.name}" exists on table "${live.table}" instead of "${table}"`;
  }
  if (live.isPartial) {
    return `Index "${expected.name}" on "${table}" is a partial index, expected a full index`;
  }
  const expectedUnique = expected.unique === true;
  if (live.unique !== expectedUnique) {
    return `Index "${expected.name}" on "${table}" uniqueness mismatch (expected ${expectedUnique ? 'UNIQUE' : 'NON-UNIQUE'}, live ${live.unique ? 'UNIQUE' : 'NON-UNIQUE'})`;
  }

  const expectedCols = expected.columns.map(normalizeSqlIndexColumn);
  const colsMatch =
    live.columns.length === expectedCols.length &&
    expectedCols.every(
      (col, idx) =>
        live.columns[idx]?.column === col.column && live.columns[idx]?.direction === col.direction
    );

  if (!colsMatch) {
    return `Index "${expected.name}" on "${table}" definition mismatch (expected (${formatIndexColumns(expectedCols)}), live (${formatIndexColumns(live.columns)}))`;
  }

  return undefined;
};

const introspectLiveSqlIndexes = async ({
  db,
  dialect,
  indexName
}: {
  db: Kysely<any>;
  dialect: SqlDialect;
  indexName?: string;
}): Promise<LiveSqlIndexDefinition[]> => {
  if (dialect === 'postgres') {
    const query =
      indexName !== undefined
        ? sql<{
            table_name: string;
            index_name: string;
            indisvalid: unknown;
            indisprimary: unknown;
            indisunique: unknown;
            is_partial: unknown;
            seq_in_index: string | number;
            column_name: string | null;
            is_desc: unknown;
          }>`
            SELECT
              tbl_cls.relname AS table_name,
              idx_cls.relname AS index_name,
              i.indisvalid,
              i.indisprimary,
              i.indisunique,
              (i.indpred IS NOT NULL) AS is_partial,
              k.ordinality AS seq_in_index,
              a.attname AS column_name,
              ((o.opt & 1) = 1) AS is_desc
            FROM pg_index i
            JOIN pg_class idx_cls ON idx_cls.oid = i.indexrelid
            JOIN pg_class tbl_cls ON tbl_cls.oid = i.indrelid
            JOIN pg_namespace ns ON ns.oid = idx_cls.relnamespace
            CROSS JOIN LATERAL unnest(i.indkey::smallint[]) WITH ORDINALITY AS k(attnum, ordinality)
            LEFT JOIN LATERAL unnest(i.indoption::smallint[]) WITH ORDINALITY AS o(opt, ordinality)
              ON o.ordinality = k.ordinality
            LEFT JOIN pg_attribute a
              ON a.attrelid = i.indrelid AND a.attnum = k.attnum AND a.attnum > 0
            WHERE ns.nspname = current_schema()
              AND idx_cls.relname = ${indexName}
              AND k.ordinality <= i.indnkeyatts
            ORDER BY tbl_cls.relname ASC, idx_cls.relname ASC, k.ordinality ASC
          `
        : sql<{
            table_name: string;
            index_name: string;
            indisvalid: unknown;
            indisprimary: unknown;
            indisunique: unknown;
            is_partial: unknown;
            seq_in_index: string | number;
            column_name: string | null;
            is_desc: unknown;
          }>`
            SELECT
              tbl_cls.relname AS table_name,
              idx_cls.relname AS index_name,
              i.indisvalid,
              i.indisprimary,
              i.indisunique,
              (i.indpred IS NOT NULL) AS is_partial,
              k.ordinality AS seq_in_index,
              a.attname AS column_name,
              ((o.opt & 1) = 1) AS is_desc
            FROM pg_index i
            JOIN pg_class idx_cls ON idx_cls.oid = i.indexrelid
            JOIN pg_class tbl_cls ON tbl_cls.oid = i.indrelid
            JOIN pg_namespace ns ON ns.oid = idx_cls.relnamespace
            CROSS JOIN LATERAL unnest(i.indkey::smallint[]) WITH ORDINALITY AS k(attnum, ordinality)
            LEFT JOIN LATERAL unnest(i.indoption::smallint[]) WITH ORDINALITY AS o(opt, ordinality)
              ON o.ordinality = k.ordinality
            LEFT JOIN pg_attribute a
              ON a.attrelid = i.indrelid AND a.attnum = k.attnum AND a.attnum > 0
            WHERE ns.nspname = current_schema()
              AND k.ordinality <= i.indnkeyatts
            ORDER BY tbl_cls.relname ASC, idx_cls.relname ASC, k.ordinality ASC
          `;

    const res = await query.execute(db);
    const grouped = new Map<
      string,
      {
        meta: Omit<LiveSqlIndexDefinition, 'columns'>;
        columns: Array<{ seq: number; column: string | null; direction: SqlIndexDirection }>;
      }
    >();

    for (const row of res.rows) {
      const key = `${row.table_name}\0${row.index_name}`;
      let entry = grouped.get(key);
      if (entry === undefined) {
        entry = {
          meta: {
            table: String(row.table_name),
            indexName: String(row.index_name),
            isValid: toBooleanFlag(row.indisvalid),
            isPrimary: toBooleanFlag(row.indisprimary),
            unique: toBooleanFlag(row.indisunique),
            isPartial: toBooleanFlag(row.is_partial)
          },
          columns: []
        };
        grouped.set(key, entry);
      }
      entry.columns.push({
        seq: Number(row.seq_in_index ?? entry.columns.length + 1),
        column:
          row.column_name === null || row.column_name === undefined
            ? null
            : String(row.column_name),
        direction: toBooleanFlag(row.is_desc) ? 'desc' : 'asc'
      });
    }

    return Array.from(grouped.values()).map(({ meta, columns }) => ({
      ...meta,
      columns: columns
        .sort((a, b) => a.seq - b.seq)
        .map(({ column, direction }) => ({ column, direction }))
    }));
  }

  const query =
    indexName !== undefined
      ? sql<{
          table_name: string;
          index_name: string;
          non_unique: string | number;
          seq_in_index: string | number;
          column_name: string | null;
          collation: string | null;
        }>`
          SELECT
            table_name AS table_name,
            index_name AS index_name,
            non_unique AS non_unique,
            seq_in_index AS seq_in_index,
            column_name AS column_name,
            collation AS collation
          FROM information_schema.statistics
          WHERE table_schema = DATABASE()
            AND index_name = ${indexName}
          ORDER BY table_name ASC, index_name ASC, seq_in_index ASC
        `
      : sql<{
          table_name: string;
          index_name: string;
          non_unique: string | number;
          seq_in_index: string | number;
          column_name: string | null;
          collation: string | null;
        }>`
          SELECT
            table_name AS table_name,
            index_name AS index_name,
            non_unique AS non_unique,
            seq_in_index AS seq_in_index,
            column_name AS column_name,
            collation AS collation
          FROM information_schema.statistics
          WHERE table_schema = DATABASE()
          ORDER BY table_name ASC, index_name ASC, seq_in_index ASC
        `;

  const res = await query.execute(db);
  const grouped = new Map<
    string,
    {
      meta: Omit<LiveSqlIndexDefinition, 'columns'>;
      columns: Array<{
        seq: number;
        column: string | null;
        direction: SqlIndexDirection | 'unknown';
      }>;
    }
  >();

  for (const row of res.rows) {
    const key = `${row.table_name}\0${row.index_name}`;
    let entry = grouped.get(key);
    if (entry === undefined) {
      const name = String(row.index_name);
      entry = {
        meta: {
          table: String(row.table_name),
          indexName: name,
          isValid: true,
          isPrimary: name === 'PRIMARY',
          unique: Number(row.non_unique) === 0,
          isPartial: false
        },
        columns: []
      };
      grouped.set(key, entry);
    }

    const direction = (() => {
      const raw =
        row.collation === null || row.collation === undefined
          ? ''
          : String(row.collation).toUpperCase();
      if (raw === 'A') {
        return 'asc' as const;
      }
      if (raw === 'D') {
        return 'desc' as const;
      }
      return 'unknown' as const;
    })();

    entry.columns.push({
      seq: Number(row.seq_in_index ?? entry.columns.length + 1),
      column:
        row.column_name === null || row.column_name === undefined ? null : String(row.column_name),
      direction
    });
  }

  return Array.from(grouped.values()).map(({ meta, columns }) => ({
    ...meta,
    columns: columns
      .sort((a, b) => a.seq - b.seq)
      .map(({ column, direction }) => ({ column, direction }))
  }));
};

const findActivePgIndexBuild = async ({
  db,
  table,
  indexName
}: {
  db: Kysely<any>;
  table: string;
  indexName: string;
}): Promise<{ pid: string | number; phase: string | null } | undefined> => {
  const res = await sql<{ pid: string | number; phase: string | null }>`
    SELECT p.pid, p.phase
    FROM pg_stat_progress_create_index p
    JOIN pg_index i
      ON p.index_relid = i.indexrelid
      OR (p.relid = i.indrelid AND (p.index_relid = 0 OR p.index_relid IS NULL))
    JOIN pg_class idx_cls ON idx_cls.oid = i.indexrelid
    JOIN pg_class tbl_cls ON tbl_cls.oid = i.indrelid
    JOIN pg_namespace ns ON ns.oid = idx_cls.relnamespace
    WHERE ns.nspname = current_schema()
      AND tbl_cls.relname = ${table}
      AND idx_cls.relname = ${indexName}
    LIMIT 1
  `.execute(db);

  return res.rows[0];
};

const getExpectedNormalizedColumnType = (column: SqlColumnDef): string => {
  switch (column.kind) {
    case 'entityId':
      return 'varchar(24)';
    case 'varchar':
      return `varchar(${column.length ?? 255})`;
    case 'text':
      return 'text';
    case 'boolean':
      return 'boolean';
    case 'integer':
      return 'integer';
    case 'bigint':
      return 'bigint';
    case 'double':
      return 'double';
    case 'timestamp':
      return 'timestamp';
    case 'json':
      return 'json';
  }
};

const normalizePgLiveColumnType = (row: {
  data_type: string;
  character_maximum_length: string | number | null;
}): string => {
  const dt = String(row.data_type).toLowerCase().trim();
  if (dt === 'character varying') {
    if (row.character_maximum_length !== null && row.character_maximum_length !== undefined) {
      return `varchar(${Number(row.character_maximum_length)})`;
    }
    return 'varchar';
  }
  if (dt === 'text') {
    return 'text';
  }
  if (dt === 'boolean') {
    return 'boolean';
  }
  if (dt === 'integer') {
    return 'integer';
  }
  if (dt === 'bigint') {
    return 'bigint';
  }
  if (dt === 'double precision') {
    return 'double';
  }
  if (dt === 'timestamp with time zone') {
    return 'timestamp';
  }
  if (dt === 'jsonb') {
    return 'json';
  }
  return dt;
};

const normalizeMysqlLiveColumnType = (row: {
  data_type: string;
  column_type?: string | null;
  character_maximum_length: string | number | null;
  datetime_precision?: string | number | null;
}): string => {
  const dt = String(row.data_type).toLowerCase().trim();
  const ct =
    row.column_type === null || row.column_type === undefined
      ? ''
      : String(row.column_type).toLowerCase().trim();

  if (dt === 'varchar') {
    if (row.character_maximum_length !== null && row.character_maximum_length !== undefined) {
      return `varchar(${Number(row.character_maximum_length)})`;
    }
    return ct.length > 0 ? ct : 'varchar';
  }
  if (dt === 'longtext') {
    return 'text';
  }
  if (dt === 'text') {
    // 普通 MySQL TEXT 仅 64KB，与可移植 LONGTEXT 语义不等价，显式区分以暴露漂移
    return 'mysql_text_64k';
  }
  if (dt === 'tinyint') {
    return ct === '' || ct === 'tinyint' || ct === 'tinyint(1)' ? 'boolean' : ct;
  }
  if (dt === 'int' || dt === 'integer') {
    return 'integer';
  }
  if (dt === 'bigint') {
    return 'bigint';
  }
  if (dt === 'double') {
    return 'double';
  }
  if (dt === 'datetime') {
    const hasMsPrecision =
      row.datetime_precision !== null && row.datetime_precision !== undefined
        ? Number(row.datetime_precision) === 3
        : ct === 'datetime(3)';
    return hasMsPrecision
      ? 'timestamp'
      : ct.length > 0
        ? ct
        : `datetime(${row.datetime_precision ?? 0})`;
  }
  if (dt === 'json') {
    return 'json';
  }
  return ct.length > 0 ? ct : dt;
};

const stripPgDefaultCastAndParens = (raw: string): string => {
  let current = raw.trim();
  // PG 常返回 `'foo'::character varying` 或 `(-1)::integer`，循环剥离外层类型转换与括号
  for (let i = 0; i < 4; i += 1) {
    const withoutCast = current.replace(/::[a-zA-Z0-9_ "]+(?:\(\d+\))?$/, '').trim();
    if (withoutCast.startsWith('(') && withoutCast.endsWith(')')) {
      current = withoutCast.slice(1, -1).trim();
    } else if (withoutCast !== current) {
      current = withoutCast;
    } else {
      break;
    }
  }
  return current;
};

const unwrapSingleQuotedSqlLiteral = (raw: string): string | undefined => {
  if (raw.length >= 2 && raw.startsWith("'") && raw.endsWith("'")) {
    return raw.slice(1, -1).replaceAll("''", "'");
  }
  return undefined;
};

const doesLiveDefaultMatch = ({
  expectedDefault,
  liveDefault,
  dialect
}: {
  expectedDefault: string | number | boolean | undefined;
  liveDefault: string | null;
  dialect: SqlDialect;
}): boolean => {
  if (expectedDefault === undefined) {
    return liveDefault === null;
  }
  if (liveDefault === null) {
    return false;
  }

  if (typeof expectedDefault === 'string') {
    if (dialect === 'postgres') {
      const stripped = stripPgDefaultCastAndParens(liveDefault);
      const unwrapped = unwrapSingleQuotedSqlLiteral(stripped);
      return unwrapped === expectedDefault;
    }
    if (liveDefault === expectedDefault) {
      return true;
    }
    const unwrapped = unwrapSingleQuotedSqlLiteral(liveDefault.trim());
    return unwrapped === expectedDefault;
  }

  if (typeof expectedDefault === 'number') {
    const cleaned =
      dialect === 'postgres' ? stripPgDefaultCastAndParens(liveDefault) : liveDefault.trim();
    const unwrapped = unwrapSingleQuotedSqlLiteral(cleaned) ?? cleaned;
    if (unwrapped.length === 0) {
      return false;
    }
    const parsed = Number(unwrapped);
    return Number.isFinite(parsed) && parsed === expectedDefault;
  }

  const cleaned =
    dialect === 'postgres' ? stripPgDefaultCastAndParens(liveDefault) : liveDefault.trim();
  const unwrapped = (unwrapSingleQuotedSqlLiteral(cleaned) ?? cleaned).toLowerCase();
  if (unwrapped === 'true' || unwrapped === '1' || unwrapped === "b'1'") {
    return expectedDefault === true;
  }
  if (unwrapped === 'false' || unwrapped === '0' || unwrapped === "b'0'") {
    return expectedDefault === false;
  }
  return false;
};

const getSqlColumnMismatchReason = ({
  table,
  columnName,
  expected,
  live,
  dialect
}: {
  table: string;
  columnName: string;
  expected: SqlColumnDef;
  live: LiveSqlColumnDefinition;
  dialect: SqlDialect;
}): string | undefined => {
  const reasons: string[] = [];
  const expectedType = getExpectedNormalizedColumnType(expected);
  if (live.normalizedType !== expectedType) {
    reasons.push(`type expected "${expectedType}", live "${live.normalizedType}"`);
  }

  const expectedNotNull = expected.nullable !== true;
  if (live.notNull !== expectedNotNull) {
    reasons.push(
      `nullability expected ${expectedNotNull ? 'NOT NULL' : 'NULL'}, live ${live.notNull ? 'NOT NULL' : 'NULL'}`
    );
  }

  if (
    !doesLiveDefaultMatch({
      expectedDefault: expected.defaultValue,
      liveDefault: live.columnDefault,
      dialect
    })
  ) {
    const expectedDesc =
      expected.defaultValue === undefined ? '<none>' : JSON.stringify(expected.defaultValue);
    const liveDesc = live.columnDefault === null ? '<none>' : JSON.stringify(live.columnDefault);
    reasons.push(`default expected ${expectedDesc}, live ${liveDesc}`);
  }

  if (reasons.length === 0) {
    return undefined;
  }
  return `Column "${table}.${columnName}" mismatch: ${reasons.join('; ')}`;
};

const introspectLiveSqlColumns = async ({
  db,
  dialect
}: {
  db: Kysely<any>;
  dialect: SqlDialect;
}): Promise<Map<string, Map<string, LiveSqlColumnDefinition>>> => {
  const byTable = new Map<string, Map<string, LiveSqlColumnDefinition>>();

  if (dialect === 'postgres') {
    const res = await sql<{
      table_name: string;
      column_name: string;
      data_type: string;
      character_maximum_length: string | number | null;
      is_nullable: string;
      column_default: string | null;
    }>`
      SELECT
        table_name,
        column_name,
        data_type,
        character_maximum_length,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_schema = current_schema()
      ORDER BY table_name ASC, ordinal_position ASC
    `.execute(db);

    for (const row of res.rows) {
      const tableName = String(row.table_name);
      const colName = String(row.column_name);
      let tableCols = byTable.get(tableName);
      if (tableCols === undefined) {
        tableCols = new Map();
        byTable.set(tableName, tableCols);
      }
      tableCols.set(colName, {
        table: tableName,
        column: colName,
        normalizedType: normalizePgLiveColumnType(row),
        notNull: String(row.is_nullable).toUpperCase() === 'NO',
        columnDefault:
          row.column_default === null || row.column_default === undefined
            ? null
            : String(row.column_default)
      });
    }
    return byTable;
  }

  const res = await sql<{
    table_name: string;
    column_name: string;
    data_type: string;
    column_type: string | null;
    character_maximum_length: string | number | null;
    datetime_precision: string | number | null;
    is_nullable: string;
    column_default: string | null;
  }>`
    SELECT
      table_name AS table_name,
      column_name AS column_name,
      data_type AS data_type,
      column_type AS column_type,
      character_maximum_length AS character_maximum_length,
      datetime_precision AS datetime_precision,
      is_nullable AS is_nullable,
      column_default AS column_default
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
    ORDER BY table_name ASC, ordinal_position ASC
  `.execute(db);

  for (const row of res.rows) {
    const tableName = String(row.table_name);
    const colName = String(row.column_name);
    let tableCols = byTable.get(tableName);
    if (tableCols === undefined) {
      tableCols = new Map();
      byTable.set(tableName, tableCols);
    }
    tableCols.set(colName, {
      table: tableName,
      column: colName,
      normalizedType: normalizeMysqlLiveColumnType(row),
      notNull: String(row.is_nullable).toUpperCase() === 'NO',
      columnDefault:
        row.column_default === null || row.column_default === undefined
          ? null
          : String(row.column_default)
    });
  }

  return byTable;
};

/**
 * 基于目标物理数据库连接串生成不含凭据的稳定分布式锁 Key（按物理库序列化 `core` / `pro` 与 `shared` 迁移）。
 */
export const buildSqlMigrationLockKey = ({
  dialect,
  url
}: {
  dialect: SqlDialect;
  url: string;
}): string => {
  const trimmed = url.trim();
  if (trimmed.length === 0) {
    throw new DbConfigurationError('SQL migration physical database url must be non-empty');
  }

  const identity = (() => {
    try {
      const parsed = new URL(trimmed);
      const options = parsed.searchParams.get('options') ?? '';
      return `${parsed.protocol}//${parsed.hostname.toLowerCase()}:${parsed.port}${parsed.pathname}?options=${options}`;
    } catch {
      return trimmed;
    }
  })();

  const digest = createHash('sha256').update(`${dialect}:${identity}`).digest('hex').slice(0, 24);
  return `sql-migrations:${dialect}:${digest}`;
};

/**
 * 基于 `@fastgpt/dal/redis/caches/lease` 构建 SQL DDL 迁移分布式互斥锁。
 *
 * 刻意不依赖数据库会话级 `GET_LOCK` / `pg_advisory_lock`，以彻底规避 OBProxy 与 PgBouncer
 * 事务池化模式下会话迁移导致锁泄露或提前释放的风险，并将 `LeaseCache` 的租约守卫
 * （`signal` / `assertValid`）完整透传给迁移执行器。
 */
export const createRedisSqlMigrationLock = ({
  leaseCache,
  redis,
  ttlMs = 60_000,
  waitTimeoutMs = 120_000
}: {
  leaseCache?: LeaseCache;
  ttlMs?: number;
  waitTimeoutMs?: number;
} & LeaseCacheOptions = {}): SqlMigrationLock => {
  const resolvedLeaseCache = leaseCache ?? new LeaseCache({ redis });

  return {
    withLock: ({ key, label, fn }) =>
      resolvedLeaseCache.withConcurrency({
        key,
        label,
        concurrency: 1,
        ttlMs,
        waitTimeoutMs,
        fn: (leaseContext) =>
          fn({
            signal: leaseContext.signal,
            assertValid: leaseContext.assertValid
          })
      })
  };
};

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

/** 对单张声明表执行方言编译后的幂等 `CREATE TABLE IF NOT EXISTS`（及 PG 初始索引），每条 DDL 前校验租约。 */
export const applySqlTableDDL = async ({
  db,
  dialect,
  table,
  lease
}: {
  db: Kysely<any>;
  dialect: SqlDialect;
  table: SqlTableDefinition;
  lease?: SqlMigrationLeaseGuard;
}): Promise<void> => {
  assertLeaseGuardValid(lease);
  const statements = compileSqlTableDDL(table, dialect);
  for (const statement of statements) {
    assertLeaseGuardValid(lease);
    await sql.raw(statement).execute(db);
  }
};

/**
 * 幂等创建 FastGPT 托管 SQL 索引（强制 `fg_*` 命名并校验完整索引定义）：
 * - 校验同库/同 Schema 下是否已有同名索引挂在其他表，或存在唯一性/列序/排序方向漂移；
 * - PostgreSQL：发现 `indisvalid = false` 时先查 `pg_stat_progress_create_index`，仅确认无在途建索引任务才清理僵尸索引再重建；
 * - MySQL 8+ / OceanBase：将 `SET SESSION lock_wait_timeout` 与 `CREATE INDEX` 固定在同一条专用连接上执行；
 *   MySQL 默认强制 `ALGORITHM=INPLACE LOCK=NONE`，拒绝时不静默退化为锁表建索引（除非显式 `allowBlockingFallback: true`）；
 * - 建索引或命中 `1061` 后统一二次回查真实索引定义，确保线上索引结构与声明完全一致。
 */
export const ensureSqlIndex = async ({
  db,
  dialect,
  table,
  index,
  concurrently = true,
  lockWaitTimeoutSec = 5,
  allowBlockingFallback = false,
  lease
}: {
  db: Kysely<any>;
  dialect: SqlDialect;
  table: string;
  index: SqlIndexDef;
  concurrently?: boolean;
  lockWaitTimeoutSec?: number;
  allowBlockingFallback?: boolean;
  lease?: SqlMigrationLeaseGuard;
}): Promise<EnsureSqlIndexResult> => {
  assertManagedSqlIndexName(index.name);
  assertLeaseGuardValid(lease);

  const tableIdent = quoteSqlIdentifier(table, dialect);
  const indexIdent = quoteSqlIdentifier(index.name, dialect);
  const columnList = compileSqlIndexColumnList(index.columns, dialect);
  const uniqueSql = index.unique === true ? 'UNIQUE ' : '';

  // 1. 跨全 Schema/库探测同名索引，严防跨表命名冲突或同表定义漂移被静默当作幂等跳过
  const existingMatches = await introspectLiveSqlIndexes({
    db,
    dialect,
    indexName: index.name
  });
  const otherTableMatch = existingMatches.find((item) => item.table !== table);
  if (otherTableMatch !== undefined) {
    throw new DbConfigurationError(
      `SQL index name conflict: "${index.name}" already exists on table "${otherTableMatch.table}", cannot ensure on "${table}"`
    );
  }
  const existing = existingMatches.find((item) => item.table === table);

  if (dialect === 'postgres') {
    let healed = false;
    if (existing !== undefined) {
      if (existing.isValid) {
        const mismatchReason = getSqlIndexMismatchReason({
          table,
          expected: index,
          live: existing
        });
        if (mismatchReason !== undefined) {
          throw new DbConfigurationError(mismatchReason);
        }
        return { table, indexName: index.name, status: 'exists' };
      }

      // 2. PG indisvalid=false 可能是另一进程正在执行 CREATE INDEX CONCURRENTLY，必须先确认无在途构建再清理
      const activeBuild = await findActivePgIndexBuild({
        db,
        table,
        indexName: index.name
      });
      if (activeBuild !== undefined) {
        throw new DbError({
          code: 'DB_OPERATION_FAILED',
          message: `Cannot heal invalid PostgreSQL index "${index.name}" on "${table}": active CREATE INDEX build is in progress (pid=${activeBuild.pid}, phase=${activeBuild.phase ?? 'unknown'})`
        });
      }

      assertLeaseGuardValid(lease);
      const dropClause = concurrently ? 'CONCURRENTLY ' : '';
      await sql.raw(`DROP INDEX ${dropClause}IF EXISTS ${indexIdent};`).execute(db);
      healed = true;
    }

    assertLeaseGuardValid(lease);
    const createClause = concurrently ? 'CONCURRENTLY ' : '';
    await sql
      .raw(
        `CREATE ${uniqueSql}INDEX ${createClause}IF NOT EXISTS ${indexIdent} ON ${tableIdent} (${columnList});`
      )
      .execute(db);

    // 3. 建索引后二次回查完整定义，防止并发创建或 IF NOT EXISTS 掩盖定义不一致
    const verifiedMatches = await introspectLiveSqlIndexes({
      db,
      dialect,
      indexName: index.name
    });
    const verifiedOther = verifiedMatches.find((item) => item.table !== table);
    if (verifiedOther !== undefined) {
      throw new DbConfigurationError(
        `SQL index name conflict: "${index.name}" exists on table "${verifiedOther.table}" instead of "${table}"`
      );
    }
    const verified = verifiedMatches.find((item) => item.table === table);
    if (verified === undefined || !verified.isValid) {
      throw new DbError({
        code: 'DB_OPERATION_FAILED',
        message: `PostgreSQL index "${index.name}" on "${table}" is missing or invalid after creation`
      });
    }
    const postMismatch = getSqlIndexMismatchReason({
      table,
      expected: index,
      live: verified
    });
    if (postMismatch !== undefined) {
      throw new DbConfigurationError(postMismatch);
    }

    return {
      table,
      indexName: index.name,
      status: healed ? 'healed_and_created' : 'created'
    };
  }

  // OceanBase / MySQL：若目标表已存在同名索引，校验完整定义一致后再幂等返回
  if (existing !== undefined) {
    const mismatchReason = getSqlIndexMismatchReason({
      table,
      expected: index,
      live: existing
    });
    if (mismatchReason !== undefined) {
      throw new DbConfigurationError(mismatchReason);
    }
    return { table, indexName: index.name, status: 'exists' };
  }

  const baseStmt = `CREATE ${uniqueSql}INDEX ${indexIdent} ON ${tableIdent} (${columnList})`;
  let duplicateHit = false;

  // 将会话级 lock_wait_timeout 与后续 CREATE INDEX 绑定在同一条物理连接上，防止连接池漂移失效
  await db.connection().execute(async (conn) => {
    assertLeaseGuardValid(lease);
    await setMysqlSessionLockWaitTimeout({ conn, lockWaitTimeoutSec });
    assertLeaseGuardValid(lease);

    try {
      if (dialect === 'mysql') {
        try {
          await sql.raw(`${baseStmt} ALGORITHM=INPLACE LOCK=NONE;`).execute(conn);
        } catch (error) {
          if (hasErrorCode(error, [1061, 'ER_DUP_KEYNAME'])) {
            duplicateHit = true;
            return;
          }
          if (
            hasErrorCode(error, [
              1845,
              1846,
              'ER_ALTER_OPERATION_NOT_SUPPORTED',
              'ER_ALTER_OPERATION_NOT_SUPPORTED_REASON'
            ])
          ) {
            if (!allowBlockingFallback) {
              throw new DbError({
                code: 'DB_OPERATION_FAILED',
                message: `MySQL online index creation (ALGORITHM=INPLACE LOCK=NONE) rejected for "${index.name}" on "${table}"; pass allowBlockingFallback: true explicitly to allow blocking DDL`,
                cause: error
              });
            }
            assertLeaseGuardValid(lease);
            await sql.raw(`${baseStmt};`).execute(conn);
            return;
          }
          throw error;
        }
      } else {
        await sql.raw(`${baseStmt};`).execute(conn);
      }
    } catch (error) {
      if (hasErrorCode(error, [1061, 'ER_DUP_KEYNAME'])) {
        duplicateHit = true;
        return;
      }
      throw error;
    }
  });

  // 建索引或命中 1061 并发重名后回查真实索引定义，确保未与不同定义发生静默冲突
  const verifiedMatches = await introspectLiveSqlIndexes({
    db,
    dialect,
    indexName: index.name
  });
  const verifiedOther = verifiedMatches.find((item) => item.table !== table);
  if (verifiedOther !== undefined) {
    throw new DbConfigurationError(
      `SQL index name conflict: "${index.name}" exists on table "${verifiedOther.table}" instead of "${table}"`
    );
  }
  const verified = verifiedMatches.find((item) => item.table === table);
  if (verified === undefined) {
    throw new DbError({
      code: 'DB_OPERATION_FAILED',
      message: `SQL index "${index.name}" on "${table}" was not found after creation`
    });
  }
  const postMismatch = getSqlIndexMismatchReason({
    table,
    expected: index,
    live: verified
  });
  if (postMismatch !== undefined) {
    throw new DbConfigurationError(postMismatch);
  }

  return {
    table,
    indexName: index.name,
    status: duplicateHit ? 'exists' : 'created'
  };
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
  lockWaitTimeoutSec = 5,
  lease
}: {
  db: Kysely<any>;
  dialect: SqlDialect;
  table: string;
  indexName: string;
  concurrently?: boolean;
  lockWaitTimeoutSec?: number;
  lease?: SqlMigrationLeaseGuard;
}): Promise<DropSqlIndexResult> => {
  if (!indexName.startsWith(SQL_INDEX_NAME_PREFIX)) {
    throw new DbConfigurationError(
      `Refusing to drop non-managed SQL index "${indexName}" on "${table}" (only "${SQL_INDEX_NAME_PREFIX}*" managed indexes may be dropped)`
    );
  }
  assertManagedSqlIndexName(indexName);
  assertLeaseGuardValid(lease);

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

    assertLeaseGuardValid(lease);
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

  let dropped = false;
  await db.connection().execute(async (conn) => {
    assertLeaseGuardValid(lease);
    await setMysqlSessionLockWaitTimeout({ conn, lockWaitTimeoutSec });
    assertLeaseGuardValid(lease);
    try {
      await sql.raw(`DROP INDEX ${indexIdent} ON ${tableIdent};`).execute(conn);
      dropped = true;
    } catch (error) {
      if (hasErrorCode(error, [1091, 'ER_CANT_DROP_FIELD_OR_KEY'])) {
        dropped = false;
        return;
      }
      throw error;
    }
  });

  return { table, indexName, status: dropped ? 'dropped' : 'missing' };
};

/**
 * 100% 只读的 SQL 表、列与索引全量巡检器（绝不执行任何写入或 DDL）。
 *
 * 比对物理库中现有表/列/索引定义与声明式 `SqlTableDefinition[]`：
 * - 报告缺失表、缺失列、列类型/非空/默认值漂移；
 * - 报告缺失索引、索引定义漂移（表归属/唯一性/列序/排序方向/部分索引）、PG 失效僵尸索引；
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

  if (dialect === 'postgres') {
    const tblRes = await sql<{ tablename: string }>`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = current_schema()
    `.execute(db);
    for (const row of tblRes.rows) {
      existingTables.add(row.tablename);
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
  }

  const liveColumnsByTable = await introspectLiveSqlColumns({ db, dialect });
  const liveIndexes = await introspectLiveSqlIndexes({ db, dialect });

  const liveIndexesByTable = new Map<string, Map<string, LiveSqlIndexDefinition>>();
  const liveIndexesByName = new Map<string, LiveSqlIndexDefinition[]>();
  for (const liveIdx of liveIndexes) {
    let tableMap = liveIndexesByTable.get(liveIdx.table);
    if (tableMap === undefined) {
      tableMap = new Map();
      liveIndexesByTable.set(liveIdx.table, tableMap);
    }
    tableMap.set(liveIdx.indexName, liveIdx);

    const byName = liveIndexesByName.get(liveIdx.indexName) ?? [];
    byName.push(liveIdx);
    liveIndexesByName.set(liveIdx.indexName, byName);
  }

  const missingTables: string[] = [];
  const missingColumns: Array<{ table: string; column: string }> = [];
  const columnMismatches: Array<{ table: string; column: string; reason: string }> = [];
  const missingIndexes: Array<{ table: string; indexName: string }> = [];
  const indexMismatches: Array<{ table: string; indexName: string; reason: string }> = [];
  const invalidIndexes: Array<{ table: string; indexName: string }> = [];
  const extraManagedIndexes: Array<{ table: string; indexName: string }> = [];
  const customerIndexes: Array<{ table: string; indexName: string }> = [];

  for (const table of tables) {
    if (!existingTables.has(table.name)) {
      missingTables.push(table.name);
      continue;
    }

    // 1. 校验每张表的列完整性与归一化类型/可空/默认值一致性
    const liveCols =
      liveColumnsByTable.get(table.name) ?? new Map<string, LiveSqlColumnDefinition>();
    for (const [colName, colDef] of Object.entries(table.columns)) {
      const liveCol = liveCols.get(colName);
      if (liveCol === undefined) {
        missingColumns.push({ table: table.name, column: colName });
        continue;
      }
      const mismatchReason = getSqlColumnMismatchReason({
        table: table.name,
        columnName: colName,
        expected: colDef,
        live: liveCol,
        dialect
      });
      if (mismatchReason !== undefined) {
        columnMismatches.push({
          table: table.name,
          column: colName,
          reason: mismatchReason
        });
      }
    }

    // 2. 校验每张表的索引存在性、有效性与完整定义一致性
    const liveMap = liveIndexesByTable.get(table.name) ?? new Map<string, LiveSqlIndexDefinition>();
    const declaredNames = new Set((table.indexes ?? []).map((idx) => idx.name));

    for (const idx of table.indexes ?? []) {
      const live = liveMap.get(idx.name);
      if (live === undefined) {
        missingIndexes.push({ table: table.name, indexName: idx.name });
        const otherTableHit = (liveIndexesByName.get(idx.name) ?? []).find(
          (candidate) => candidate.table !== table.name
        );
        if (otherTableHit !== undefined) {
          indexMismatches.push({
            table: table.name,
            indexName: idx.name,
            reason: `Index "${idx.name}" exists on table "${otherTableHit.table}" instead of "${table.name}"`
          });
        }
      } else if (!live.isValid) {
        invalidIndexes.push({ table: table.name, indexName: idx.name });
      } else {
        const mismatchReason = getSqlIndexMismatchReason({
          table: table.name,
          expected: idx,
          live
        });
        if (mismatchReason !== undefined) {
          indexMismatches.push({
            table: table.name,
            indexName: idx.name,
            reason: mismatchReason
          });
        }
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
    missingColumns,
    columnMismatches,
    missingIndexes,
    indexMismatches,
    invalidIndexes,
    extraManagedIndexes,
    customerIndexes
  };
};
