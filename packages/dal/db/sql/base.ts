import { sql, type Kysely, type RawBuilder } from 'kysely';
import type z from 'zod';
import { parseRepoRow, parseRepoRows } from '../parse';
import { getDbDialect, getDbLogger, getDbRuntime } from '../runtime';
import { unwrapNativeDbSession } from '../transaction';
import type { DbDatasource, DbSession, SqlDialect, SqlExecutorOptions } from '../types';

/** SQL 唯一索引防 NULL 语义差异：根目录 parentId 统一存为空串哨兵。 */
export const SQL_EMPTY_PARENT_SENTINEL = '';

/** SQL 唯一索引防 NULL 语义差异：未软删除记录的 delete_time_ms 统一存 0。 */
export const SQL_ACTIVE_DELETE_TIME_MS = 0;

/** 默认单条 SQL 安全绑定参数上限（低于 PostgreSQL 65,535 协议硬上限）。 */
export const DEFAULT_SQL_MAX_PARAMS_PER_BATCH = 60_000;

/**
 * 解析当前调用上下文对应的 Kysely SQL 执行器。
 *
 * 若携带活跃事务 `tx`，强制忽略 `useReadReplica` 并返回绑定该事务连接的 Kysely `Transaction` 实例。
 */
export const getSqlExecutor = <TDatabase = Record<string, any>>(
  options: SqlExecutorOptions = {}
): Kysely<TDatabase> => {
  const { datasource = 'main', useReadReplica = false, tx } = options;
  const runtime = getDbRuntime();
  const nativeTx = unwrapNativeDbSession(tx, { family: 'sql', datasource });
  const route = runtime.resolveReadTarget({
    datasource,
    useReadReplica,
    hasActiveTx: nativeTx !== undefined
  });
  const resolver = runtime.getSqlExecutorResolver();
  return resolver({
    datasource: route.datasource,
    target: route.target,
    nativeTx
  }) as Kysely<TDatabase>;
};

/**
 * 通用可移植 SQL 领域仓储抽象基类（基于 Kysely，一套实现通吃 PostgreSQL、OceanBase 与 MySQL 8+）。
 *
 * 集中封装：
 * - 读写分离与事务路由（`this.db(tx)` / `this.readDb(tx)`）；
 * - 跨方言差异抹平（`upsertRow`、`insertChunked`、`caseInsensitiveLike`、`toJsonParam`）；
 * - 哨兵值与物化路径编解码（避免 PG/OB 唯一索引 `NULL != NULL` 及无 GIN 数组索引差异）；
 * - 出口 Zod 强校验与列表级 Warn & Skip 脏数据隔离。
 */
export abstract class SqlRepositoryBase<
  TDatabase extends Record<string, any>,
  TTableName extends keyof TDatabase & string,
  TReadSchema extends z.ZodTypeAny
> {
  protected abstract readonly tableName: TTableName;
  protected abstract readonly readSchema: TReadSchema;
  protected readonly datasource: DbDatasource = 'main';

  protected get sqlDialect(): SqlDialect {
    const dialect = getDbDialect();
    if (dialect === 'mongo') {
      throw new Error('Cannot access SQL dialect when DbRuntime is configured for mongo');
    }
    return dialect;
  }

  protected db(tx?: DbSession): Kysely<TDatabase> {
    return getSqlExecutor<TDatabase>({
      datasource: this.datasource,
      tx
    });
  }

  protected readDb(tx?: DbSession): Kysely<TDatabase> {
    return getSqlExecutor<TDatabase>({
      datasource: this.datasource,
      useReadReplica: true,
      tx
    });
  }

  protected parseRow(row: unknown): z.output<TReadSchema> {
    return parseRepoRow({
      table: this.tableName,
      schema: this.readSchema,
      row
    });
  }

  protected parseNullable(row: unknown): z.output<TReadSchema> | null {
    if (row === null || row === undefined) {
      return null;
    }
    return this.parseRow(row);
  }

  protected parseList<TSchema extends z.ZodTypeAny = TReadSchema>(
    rows: readonly unknown[],
    customSchema?: TSchema
  ): z.output<TSchema>[] {
    return parseRepoRows({
      table: this.tableName,
      schema: (customSchema ?? this.readSchema) as TSchema,
      rows,
      logger: getDbLogger()
    });
  }

  /**
   * 序列化写入 JSON/JSONB 列的参数。
   *
   * 关键兼容细节：`pg` 驱动会把原生 JS 数组序列化成 PG Array 字面量 `{"a","b"}` 而非 JSON `["a","b"]`，
   * 导致写入 JSONB 列报语法错误；统一显式 `JSON.stringify` 可 100% 兼容 PG 与 OceanBase/MySQL。
   */
  protected toJsonParam(value: unknown): string | null {
    if (value === null || value === undefined) {
      return null;
    }
    return JSON.stringify(value);
  }

  protected toParentSentinel(parentId?: string | null): string {
    if (parentId === null || parentId === undefined || parentId === '') {
      return SQL_EMPTY_PARENT_SENTINEL;
    }
    return parentId;
  }

  protected fromParentSentinel(value?: string | null): string | null {
    if (value === null || value === undefined || value === SQL_EMPTY_PARENT_SENTINEL) {
      return null;
    }
    return value;
  }

  protected encodeMaterializedPath(ancestorIds?: readonly string[]): string {
    if (ancestorIds === undefined || ancestorIds.length === 0) {
      return '';
    }
    return `${ancestorIds.filter(Boolean).join('/')}/`;
  }

  protected decodeMaterializedPath(path?: string | null): string[] | undefined {
    if (path === null || path === undefined || path === '') {
      return undefined;
    }
    const parts = path.split('/').filter(Boolean);
    return parts.length > 0 ? parts : undefined;
  }

  /**
   * 构造跨 PG / OceanBase / MySQL 行为一致的大小写不敏感子串模糊匹配条件。
   *
   * 刻意不使用 PG 专属的 `ILIKE` 和反斜杠转义（MySQL 受 `NO_BACKSLASH_ESCAPES` 影响），
   * 统一采用 `LOWER(col) LIKE ? ESCAPE '|'` 走标准 SQL 语义。
   */
  protected caseInsensitiveLike(columnName: string, keyword: string): RawBuilder<boolean> {
    const escaped = keyword
      .toLowerCase()
      .replaceAll('|', '||')
      .replaceAll('%', '|%')
      .replaceAll('_', '|_');
    const pattern = `%${escaped}%`;
    return sql<boolean>`LOWER(${sql.ref(`${this.tableName}.${columnName}`)}) LIKE ${pattern} ESCAPE '|'`;
  }

  /**
   * 自动分片批量插入，规避 PostgreSQL Wire Protocol 65,535 参数上限与 MySQL 数据包超限。
   */
  protected async insertChunked<TRow extends Record<string, unknown>>({
    table,
    rows,
    maxParamsPerBatch = DEFAULT_SQL_MAX_PARAMS_PER_BATCH,
    tx
  }: {
    table?: keyof TDatabase & string;
    rows: readonly TRow[];
    maxParamsPerBatch?: number;
    tx?: DbSession;
  }): Promise<void> {
    if (rows.length === 0) {
      return;
    }
    const targetTable = table ?? this.tableName;
    const colCount = Math.max(1, Object.keys(rows[0]!).length);
    const chunkSize = Math.max(1, Math.floor(maxParamsPerBatch / colCount));
    const executor = this.db(tx);

    for (let index = 0; index < rows.length; index += chunkSize) {
      const chunk = rows.slice(index, index + chunkSize);
      await executor
        .insertInto(targetTable)
        .values(chunk as never)
        .execute();
    }
  }

  /**
   * 跨方言原子 Upsert 封装：
   * - PostgreSQL 编译为 `INSERT ... ON CONFLICT (conflictKeys) DO UPDATE SET ...`（或 `DO NOTHING`）；
   * - OceanBase / MySQL 编译为 `INSERT ... ON DUPLICATE KEY UPDATE ...`（或 `INSERT IGNORE`）。
   */
  protected async upsertRow<TRow extends Record<string, unknown>>({
    table,
    values,
    conflictKeys,
    updateValues,
    tx
  }: {
    table?: keyof TDatabase & string;
    values: TRow;
    conflictKeys: readonly string[];
    updateValues?: Record<string, unknown>;
    tx?: DbSession;
  }): Promise<void> {
    const targetTable = table ?? this.tableName;
    const executor = this.db(tx);
    const hasUpdates = updateValues !== undefined && Object.keys(updateValues).length > 0;

    if (this.sqlDialect === 'postgres') {
      await executor
        .insertInto(targetTable)
        .values(values as never)
        .onConflict((oc) => {
          const targeted = oc.columns(conflictKeys as never);
          return hasUpdates ? targeted.doUpdateSet(updateValues as never) : targeted.doNothing();
        })
        .execute();
      return;
    }

    if (hasUpdates) {
      await executor
        .insertInto(targetTable)
        .values(values as never)
        .onDuplicateKeyUpdate(updateValues as never)
        .execute();
      return;
    }

    await executor
      .insertInto(targetTable)
      .ignore()
      .values(values as never)
      .execute();
  }
}
