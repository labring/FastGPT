/** 支持的数据库方言：MongoDB（生产）与 OceanBase（测试环境验证）。 */
export type DbDialect = 'mongo' | 'oceanbase';

/** 数据源角色：业务主库（main）与日志库（log）。 */
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

/** 数据库底座可观测性回调（接入 Profiling / 指标上报）。 */
export type DbMetrics = {
  operationCompleted?: (metric: DbOperationMetric) => void;
};

declare const dbSessionBrand: unique symbol;

/**
 * 对业务层完全不透明的数据库事务会话令牌。
 * 业务层只允许显式透传 `DbSession` 或注册 `afterCommit`，严禁直接访问底层驱动句柄。
 */
export type DbSession = {
  readonly [dbSessionBrand]: true;
  readonly id: string;
  readonly dialect: DbDialect;
  readonly datasource: DbDatasource;
  afterCommit: (callback: () => Promise<void> | void) => void;
};

/** 底层驱动事务执行器签名，由 Mongo / OceanBase 适配层在初始化 Runtime 时注入。 */
export type DbTransactionRunner = <T>(params: {
  datasource: DbDatasource;
  timeoutMs: number;
  execute: (nativeTx: unknown) => Promise<T>;
}) => Promise<T>;

export type OceanBaseExecutorResolver<TExecutor = unknown> = (params: {
  datasource: DbDatasource;
  nativeTx?: unknown;
}) => TExecutor;

/** 驱动无关的 Mongo 集合描述符最小结构（避免 `types.ts` 直接耦合 `mongoose`）。 */
export type MongoCollectionDescriptor<TDoc = Record<string, unknown>> = {
  readonly name: string;
  /** 可选 Mongoose Model 注册名；缺省等同物理集合名 `name`。用于渐进迁移期避免与存量旧 Schema 抢占同名 Model。 */
  readonly modelName?: string;
  readonly datasource: DbDatasource;
  readonly _docType?: TDoc;
};

/** 由 Mongo 运行时注入的幂等 Model 绑定器，供 `MongoRepositoryBase` 在 `constructor` 中调用。 */
export type MongoModelBinder = <TDoc, TModel = unknown>(params: {
  collection: MongoCollectionDescriptor<TDoc>;
  datasource: DbDatasource;
}) => TModel;
