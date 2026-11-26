import { Kysely, MysqlDialect, type CompiledQuery, type LogEvent, type MysqlPool } from 'kysely';
import { createPool } from 'mysql2';
import { DbConfigurationError } from '../errors';
import { getConfiguredDbRuntime, type DbRuntime } from '../runtime';
import type { DbDatasource, DbTransactionRunner, OceanBaseExecutorResolver } from '../types';

export type OceanBaseRuntimeDeps = {
  transactionRunner: DbTransactionRunner;
  oceanBaseExecutorResolver: OceanBaseExecutorResolver<Kysely<any>>;
  closeHandler: () => Promise<void>;
};

const DEFAULT_OCEANBASE_POOL_LIMIT = 10;

const KYSELY_KIND_TO_OPERATION: Record<string, string> = {
  SelectQueryNode: 'select',
  InsertQueryNode: 'insert',
  UpdateQueryNode: 'update',
  DeleteQueryNode: 'delete',
  CreateTableNode: 'create_table',
  AlterTableNode: 'alter_table',
  DropTableNode: 'drop_table',
  MergeQueryNode: 'merge'
};

const extractTableNameFromNode = (node: unknown): string | undefined => {
  if (node === null || node === undefined || typeof node !== 'object') {
    return undefined;
  }
  const record = node as Record<string, unknown>;
  if (record.kind === 'AliasNode') {
    return extractTableNameFromNode(record.node);
  }
  if (record.kind === 'TableNode') {
    const table = record.table as Record<string, unknown> | undefined;
    const identifier = table?.identifier as Record<string, unknown> | undefined;
    return typeof identifier?.name === 'string' ? identifier.name : undefined;
  }
  return undefined;
};

const extractTableFromQueryNode = (node: unknown): string | undefined => {
  if (node === null || node === undefined || typeof node !== 'object') {
    return undefined;
  }
  const record = node as Record<string, unknown>;
  switch (record.kind) {
    case 'SelectQueryNode':
    case 'DeleteQueryNode': {
      const from = record.from as { froms?: unknown[] } | undefined;
      return extractTableNameFromNode(from?.froms?.[0]);
    }
    case 'InsertQueryNode':
      return extractTableNameFromNode(record.into);
    case 'UpdateQueryNode': {
      const directTable = extractTableNameFromNode(record.table);
      if (directTable !== undefined) {
        return directTable;
      }
      const from = record.from as { froms?: unknown[] } | undefined;
      return extractTableNameFromNode(from?.froms?.[0]);
    }
    default:
      return undefined;
  }
};

const SQL_OPERATION_PREFIX_RE =
  /^(select|insert|update|delete|create|alter|drop|replace|with|show|begin|commit|rollback)\b/i;
const SQL_TABLE_FALLBACK_RE =
  /\b(?:from|into|update|table(?:\s+if\s+(?:not\s+)?exists)?)\s+(?:`?([a-zA-Z0-9_]+)`?\.)?`?([a-zA-Z0-9_]+)`?/i;

/** 从 Kysely 编译产物提取表名与操作名（仅用于观测打点，不读取绑定参数）。 */
export const extractOceanBaseQueryMeta = (
  query: CompiledQuery
): { table?: string; operation: string } => {
  const queryNode = query.query as unknown as Record<string, unknown> | undefined;
  const kind = typeof queryNode?.kind === 'string' ? queryNode.kind : undefined;
  const sanitizedSql = query.sql.replace(/^\s*(?:\/\*[\s\S]*?\*\/\s*)*/, '');
  const sqlOpMatch = sanitizedSql.match(SQL_OPERATION_PREFIX_RE);
  const operation =
    (kind !== undefined ? KYSELY_KIND_TO_OPERATION[kind] : undefined) ??
    sqlOpMatch?.[1]?.toLowerCase() ??
    'query';

  const astTable = extractTableFromQueryNode(queryNode);
  const sqlTableMatch = sanitizedSql.match(SQL_TABLE_FALLBACK_RE);
  const table = astTable ?? sqlTableMatch?.[2];

  return {
    operation,
    ...(table !== undefined ? { table } : {})
  };
};

/**
 * 构建 Kysely `log` 回调，将 OceanBase SQL 执行耗时与成败直通上报至 `DbRuntime.recordOperation()`。
 * 严格隔离绑定参数（不记录 `query.parameters`）并吞掉观测异常，避免影响主查询。
 */
export const createOceanBaseKyselyLogger = ({
  datasource,
  getRuntime = getConfiguredDbRuntime
}: {
  datasource: DbDatasource;
  getRuntime?: () => DbRuntime | undefined;
}): ((event: LogEvent) => void) => {
  return (event: LogEvent) => {
    try {
      const runtime = getRuntime();
      if (runtime === undefined) {
        return;
      }

      const { table, operation } = extractOceanBaseQueryMeta(event.query);
      const durationMs = Number.isFinite(event.queryDurationMillis)
        ? Math.max(0, event.queryDurationMillis)
        : 0;

      runtime.recordOperation({
        datasource,
        table,
        operation,
        durationMs,
        success: event.level === 'query'
      });
    } catch {
      // 观测打点异常不得中断数据库执行路径
    }
  };
};

const normalizeOptionalDistinctUrl = (mainUrl: string, rawUrl?: string): string | undefined => {
  if (rawUrl === undefined) {
    return undefined;
  }
  const trimmed = rawUrl.trim();
  return trimmed.length > 0 && trimmed !== mainUrl ? trimmed : undefined;
};

const createOceanBaseKysely = ({
  url,
  connectionLimit,
  datasource
}: {
  url: string;
  connectionLimit: number;
  datasource: DbDatasource;
}): Kysely<any> =>
  new Kysely<any>({
    dialect: new MysqlDialect({
      pool: createPool({
        uri: url,
        connectionLimit,
        waitForConnections: true,
        timezone: 'Z',
        charset: 'utf8mb4',
        supportBigNumbers: true,
        bigNumberStrings: true
      }) as unknown as MysqlPool
    }),
    log: createOceanBaseKyselyLogger({ datasource })
  });

/**
 * 构建基于 `mysql2` + Kysely 的轻量 OceanBase 运行时依赖。
 *
 * - 连接池采用懒创建策略，避免幂等检查失败时泄露未释放的 `mysql2` Pool；
 * - 遵循日志双态拓扑：配置与主库不同的 `logWriteUrl` 进入独立池，否则透明复用主池；
 * - 支持可选 `mainReadUrl` 只读副本路由（仅非事务且 `useReadReplica: true` 生效，事务内强制走写池）。
 */
export const createOceanBaseRuntimeDeps = ({
  mainWriteUrl,
  mainReadUrl,
  logWriteUrl,
  maxConnections = DEFAULT_OCEANBASE_POOL_LIMIT
}: {
  mainWriteUrl: string;
  mainReadUrl?: string;
  logWriteUrl?: string;
  maxConnections?: number;
}): OceanBaseRuntimeDeps => {
  const normalizedMainWriteUrl = mainWriteUrl.trim();
  if (normalizedMainWriteUrl.length === 0) {
    throw new DbConfigurationError('OceanBase mainWriteUrl must be a non-empty string');
  }

  const effectiveMainReadUrl = normalizeOptionalDistinctUrl(normalizedMainWriteUrl, mainReadUrl);
  const effectiveLogWriteUrl = normalizeOptionalDistinctUrl(normalizedMainWriteUrl, logWriteUrl);

  let mainDb: Kysely<any> | undefined;
  let mainReadDb: Kysely<any> | undefined;
  let logDb: Kysely<any> | undefined;

  const getMainDb = (): Kysely<any> => {
    mainDb ??= createOceanBaseKysely({
      url: normalizedMainWriteUrl,
      connectionLimit: maxConnections,
      datasource: 'main'
    });
    return mainDb;
  };

  const getMainReadDb = (): Kysely<any> | undefined => {
    if (effectiveMainReadUrl === undefined) {
      return undefined;
    }
    mainReadDb ??= createOceanBaseKysely({
      url: effectiveMainReadUrl,
      connectionLimit: maxConnections,
      datasource: 'main'
    });
    return mainReadDb;
  };

  const getLogDb = (): Kysely<any> | undefined => {
    if (effectiveLogWriteUrl === undefined) {
      return undefined;
    }
    logDb ??= createOceanBaseKysely({
      url: effectiveLogWriteUrl,
      connectionLimit: maxConnections,
      datasource: 'log'
    });
    return logDb;
  };

  const resolvePoolDb = ({
    datasource,
    useReadReplica = false
  }: {
    datasource: DbDatasource;
    useReadReplica?: boolean;
  }): Kysely<any> => {
    if (datasource === 'log') {
      const dedicatedLogDb = getLogDb();
      if (dedicatedLogDb !== undefined) {
        return dedicatedLogDb;
      }
    }

    if (useReadReplica) {
      const readReplicaDb = getMainReadDb();
      if (readReplicaDb !== undefined) {
        return readReplicaDb;
      }
    }

    return getMainDb();
  };

  return {
    oceanBaseExecutorResolver: ({ datasource, nativeTx, useReadReplica }) =>
      nativeTx !== undefined
        ? (nativeTx as Kysely<any>)
        : resolvePoolDb({ datasource, useReadReplica }),

    transactionRunner: async ({ datasource, execute }) =>
      resolvePoolDb({ datasource, useReadReplica: false })
        .transaction()
        .execute((trx) => execute(trx)),

    closeHandler: async () => {
      const pools = [mainDb, mainReadDb, logDb].filter((db): db is Kysely<any> => db !== undefined);
      mainDb = undefined;
      mainReadDb = undefined;
      logDb = undefined;
      await Promise.all(pools.map((db) => db.destroy()));
    }
  };
};
