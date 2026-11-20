/** 支持的具体数据库方言（文档型 mongo，以及统一归属 sql 族的 postgres / oceanbase / mysql）。 */
export type DbDialect = 'mongo' | 'postgres' | 'oceanbase' | 'mysql';

/** 领域仓储实现分族：文档模型（mongo）与可移植关系模型（sql）。 */
export type DbDialectFamily = 'mongo' | 'sql';

/** 归属 sql 实现族的具体 SQL 数据库方言。 */
export type SqlDialect = Exclude<DbDialect, 'mongo'>;

/** 根据具体数据库方言解析其所属的仓储实现族。 */
export const getDbDialectFamily = (dialect: DbDialect): DbDialectFamily =>
  dialect === 'mongo' ? 'mongo' : 'sql';

/** 物理隔离的数据源角色：业务主库（main）与日志库（log）。 */
export type DbDatasource = 'main' | 'log';

/**
 * 日志数据源双态拓扑：
 * - `separate`：配置了独立 `logWriteUrl`，使用独立日志连接池；
 * - `shared`（默认）：未配置 `logWriteUrl`，透明回退复用 `main` 连接池（零重复建池）。
 */
export type DbLogMode = 'separate' | 'shared';

export type DbLogMetadata = Record<string, unknown>;

export type DbLogMethod = (message: string, metadata?: DbLogMetadata) => void;

/** 数据库底座结构化日志约定。 */
export type DbLogger = {
  debug?: DbLogMethod;
  info: DbLogMethod;
  warn: DbLogMethod;
  error: DbLogMethod;
};

export type DbOperationMetric = {
  dialect: DbDialect;
  datasource: DbDatasource;
  table?: string;
  operation: string;
  durationMs: number;
  success: boolean;
};

export type DbHealthMetric = {
  dialect: DbDialect;
  datasource: DbDatasource;
  success: boolean;
  latencyMs: number;
};

export type DbShutdownMetric = {
  durationMs: number;
};

/** 数据库底座可观测性扩展端口（支持接入 OpenTelemetry / Profiling 或单测断言）。 */
export type DbMetrics = {
  operationCompleted?: (metric: DbOperationMetric) => void;
  slowQuery?: (metric: DbOperationMetric & { severity: 'warn' | 'error' }) => void;
  healthCheck?: (metric: DbHealthMetric) => void;
  shutdownCompleted?: (metric: DbShutdownMetric) => void;
};

declare const dbSessionBrand: unique symbol;

/**
 * 对业务层完全不透明的数据库事务会话令牌。
 *
 * 业务 Service 与 API 层只允许显式透传 `DbSession` 或注册 `afterCommit` 钩子，
 * 严禁解包或操作底层驱动的 `ClientSession` / Kysely `Transaction`。
 */
export type DbSession = {
  readonly [dbSessionBrand]: true;
  readonly id: string;
  readonly dialect: DbDialect;
  readonly family: DbDialectFamily;
  readonly datasource: DbDatasource;
  /**
   * 注册仅在当前事务最终成功 commit 后按序执行的副作用回调（如刷新 Redis 缓存、投递 BullMQ 任务）。
   * 若事务因冲突回滚重跑，上一轮注册的回调会被自动清空丢弃。
   */
  afterCommit: (callback: () => Promise<void> | void) => void;
};

/** 底层驱动事务执行器签名，由 Mongo / SQL 适配层在初始化 Runtime 时注入。 */
export type DbTransactionRunner = <T>(params: {
  datasource: DbDatasource;
  timeoutMs: number;
  execute: (nativeTx: unknown) => Promise<T>;
}) => Promise<T>;

export type SqlExecutorOptions = {
  datasource?: DbDatasource;
  useReadReplica?: boolean;
  tx?: DbSession;
};

export type SqlExecutorResolver<TExecutor = unknown> = (params: {
  datasource: DbDatasource;
  target: 'write' | 'readReplica';
  nativeTx?: unknown;
}) => TExecutor;

/** 驱动无关的 Mongo 集合描述符最小结构（避免 `types.ts` 直接耦合 `mongoose`）。 */
export type MongoCollectionDescriptor<TDoc = Record<string, unknown>> = {
  readonly name: string;
  readonly datasource: DbDatasource;
  readonly _docType?: TDoc;
};

/** 由 Mongo 运行时注入的幂等 Model 绑定器，供 `MongoRepositoryBase` 在 `constructor` 中调用。 */
export type MongoModelBinder = <TDoc, TModel = unknown>(params: {
  collection: MongoCollectionDescriptor<TDoc>;
  datasource: DbDatasource;
}) => TModel;
