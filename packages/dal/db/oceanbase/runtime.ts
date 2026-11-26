import {
  AliasNode,
  Kysely,
  MysqlDialect,
  TableNode,
  type CompiledQuery,
  type LogEvent,
  type MysqlPool,
  type OperationNode,
  type RootOperationNode
} from 'kysely';
import { createPool } from 'mysql2';
import { DbConfigurationError } from '../errors';
import { getConfiguredDbRuntime, type DbRuntime } from '../runtime';
import type { DbDatasource, DbTransactionRunner, OceanBaseExecutorResolver } from '../types';

export type NormalizedOceanBaseTopologyUrls = {
  mainWriteUrl: string;
  mainReadUrl?: string;
  logWriteUrl?: string;
};

const normalizeOptionalDistinctOceanBaseUrl = (
  mainWriteUrl: string,
  rawUrl?: string
): string | undefined => {
  if (rawUrl === undefined) {
    return undefined;
  }
  const trimmed = rawUrl.trim();
  return trimmed.length > 0 && trimmed !== mainWriteUrl ? trimmed : undefined;
};

/**
 * 统一归一化 OceanBase 连接拓扑（唯一事实源，供上层 `configureDalRuntime` 与 `createOceanBaseRuntimeDeps` 共享）：
 * - `mainWriteUrl` 必填且去除首尾空白；
 * - `mainReadUrl` 与 `logWriteUrl` 为空或与主库 URI 相同时归一为 `undefined`（复用主池）。
 */
export const normalizeOceanBaseTopologyUrls = ({
  mainWriteUrl,
  mainReadUrl,
  logWriteUrl
}: {
  mainWriteUrl?: string;
  mainReadUrl?: string;
  logWriteUrl?: string;
}): NormalizedOceanBaseTopologyUrls => {
  const normalizedMainWriteUrl = mainWriteUrl?.trim() ?? '';
  if (normalizedMainWriteUrl.length === 0) {
    throw new DbConfigurationError('OceanBase mainWriteUrl must be a non-empty string');
  }

  return {
    mainWriteUrl: normalizedMainWriteUrl,
    mainReadUrl: normalizeOptionalDistinctOceanBaseUrl(normalizedMainWriteUrl, mainReadUrl),
    logWriteUrl: normalizeOptionalDistinctOceanBaseUrl(normalizedMainWriteUrl, logWriteUrl)
  };
};

export type OceanBaseRuntimeDeps = {
  transactionRunner: DbTransactionRunner;
  oceanBaseExecutorResolver: OceanBaseExecutorResolver<Kysely<any>>;
  closeHandler: () => Promise<void>;
};

const DEFAULT_OCEANBASE_POOL_LIMIT = 10;

const KYSELY_KIND_TO_OPERATION: Partial<Record<RootOperationNode['kind'], string>> = {
  SelectQueryNode: 'select',
  InsertQueryNode: 'insert',
  UpdateQueryNode: 'update',
  DeleteQueryNode: 'delete',
  CreateTableNode: 'create_table',
  AlterTableNode: 'alter_table',
  DropTableNode: 'drop_table',
  MergeQueryNode: 'merge'
};

const extractTableNameFromNode = (node: OperationNode | undefined): string | undefined => {
  if (node === undefined) {
    return undefined;
  }
  if (AliasNode.is(node)) {
    return extractTableNameFromNode(node.node);
  }
  if (TableNode.is(node)) {
    return node.table.identifier.name;
  }
  return undefined;
};

const extractTableFromQueryNode = (node: RootOperationNode): string | undefined => {
  switch (node.kind) {
    case 'SelectQueryNode':
    case 'DeleteQueryNode':
      return extractTableNameFromNode(node.from?.froms[0]);
    case 'InsertQueryNode':
      return extractTableNameFromNode(node.into);
    case 'UpdateQueryNode':
      return extractTableNameFromNode(node.table) ?? extractTableNameFromNode(node.from?.froms[0]);
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
  const queryNode: RootOperationNode | undefined = query.query;
  const sanitizedSql = query.sql.replace(/^\s*(?:\/\*[\s\S]*?\*\/\s*)*/, '');
  const sqlOpMatch = sanitizedSql.match(SQL_OPERATION_PREFIX_RE);
  const operation =
    (queryNode !== undefined ? KYSELY_KIND_TO_OPERATION[queryNode.kind] : undefined) ??
    sqlOpMatch?.[1]?.toLowerCase() ??
    'query';

  const astTable = queryNode !== undefined ? extractTableFromQueryNode(queryNode) : undefined;
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

const createOceanBaseKysely = ({
  url,
  connectionLimit,
  datasource,
  assertOpen
}: {
  url: string;
  connectionLimit: number;
  datasource: DbDatasource;
  assertOpen: () => void;
}): Kysely<any> =>
  new Kysely<any>({
    dialect: new MysqlDialect({
      // 交由 Kysely 驱动在首次执行 SQL 时延迟建池，避免未执行查询即 close() 时跳过 destroy() 泄露连接池与 maxIdle 定时器。
      pool: async () => {
        assertOpen();
        return createPool({
          uri: url,
          connectionLimit,
          waitForConnections: true,
          timezone: 'Z',
          charset: 'utf8mb4',
          supportBigNumbers: true,
          bigNumberStrings: true
        }) as unknown as MysqlPool;
      }
    }),
    log: createOceanBaseKyselyLogger({ datasource })
  });

/**
 * 构建基于 `mysql2` + Kysely 的轻量 OceanBase 运行时依赖。
 *
 * - 连接池采用驱动级懒创建策略，并受 Runtime 关闭态同步门禁约束，避免关闭前后泄露或重建 `mysql2` Pool；
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
  const topology = normalizeOceanBaseTopologyUrls({
    mainWriteUrl,
    mainReadUrl,
    logWriteUrl
  });

  let closed = false;
  let closePromise: Promise<void> | undefined;
  let mainDb: Kysely<any> | undefined;
  let mainReadDb: Kysely<any> | undefined;
  let logDb: Kysely<any> | undefined;

  const assertOpen = (): void => {
    if (closed) {
      throw new DbConfigurationError('OceanBase runtime is closing or has been closed');
    }
  };

  const getMainDb = (): Kysely<any> => {
    mainDb ??= createOceanBaseKysely({
      url: topology.mainWriteUrl,
      connectionLimit: maxConnections,
      datasource: 'main',
      assertOpen
    });
    return mainDb;
  };

  const getMainReadDb = (): Kysely<any> | undefined => {
    if (topology.mainReadUrl === undefined) {
      return undefined;
    }
    mainReadDb ??= createOceanBaseKysely({
      url: topology.mainReadUrl,
      connectionLimit: maxConnections,
      datasource: 'main',
      assertOpen
    });
    return mainReadDb;
  };

  const getLogDb = (): Kysely<any> | undefined => {
    if (topology.logWriteUrl === undefined) {
      return undefined;
    }
    logDb ??= createOceanBaseKysely({
      url: topology.logWriteUrl,
      connectionLimit: maxConnections,
      datasource: 'log',
      assertOpen
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
    oceanBaseExecutorResolver: ({ datasource, nativeTx, useReadReplica }) => {
      assertOpen();
      return nativeTx !== undefined
        ? (nativeTx as Kysely<any>)
        : resolvePoolDb({ datasource, useReadReplica });
    },

    transactionRunner: async ({ datasource, execute }) => {
      assertOpen();
      return resolvePoolDb({ datasource, useReadReplica: false })
        .transaction()
        .execute((trx) => execute(trx));
    },

    closeHandler: async () => {
      // 关闭开始即同步拒绝新执行器分配与延迟建池，避免并发关闭或残留回调重建连接池。
      closed = true;
      if (closePromise !== undefined) {
        return closePromise;
      }

      const pools = [mainDb, mainReadDb, logDb].filter((db): db is Kysely<any> => db !== undefined);
      mainDb = undefined;
      mainReadDb = undefined;
      logDb = undefined;

      closePromise = (async () => {
        const results = await Promise.allSettled(pools.map((db) => db.destroy()));
        const firstRejected = results.find(
          (result): result is PromiseRejectedResult => result.status === 'rejected'
        );
        if (firstRejected !== undefined) {
          throw firstRejected.reason;
        }
      })();

      return closePromise;
    }
  };
};
