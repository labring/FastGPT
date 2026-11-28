import { DbConfigurationError, DbRuntimeNotConfiguredError } from './errors';
import type {
  DbDatasource,
  DbDialect,
  DbLogMode,
  DbLogger,
  DbMetrics,
  DbTransactionRunner,
  MongoCollectionDescriptor,
  MongoModelBinder,
  OceanBaseExecutorResolver
} from './types';

export const SLOW_QUERY_WARN_THRESHOLD_MS = 500;
export const SLOW_QUERY_ERROR_THRESHOLD_MS = 2_000;

const silentLogger: DbLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

const normalizeOptionalUrl = (url?: string): string | undefined => {
  if (url === undefined) {
    return undefined;
  }
  const trimmed = url.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const normalizeOptionalReadReplicaUrl = (
  mainWriteUrl: string,
  mainReadUrl?: string
): string | undefined => {
  const normalized = normalizeOptionalUrl(mainReadUrl);
  return normalized !== undefined && normalized !== mainWriteUrl ? normalized : undefined;
};

export type DbFallbackMongoConfig = Omit<
  DbRuntimeConfig,
  'dialect' | 'fallbackMongo' | 'oceanBaseExecutorResolver' | 'mainReadUrl'
>;

export type DbRuntimeConfig = {
  dialect: DbDialect;
  mainWriteUrl: string;
  /**
   * 可选只读副本连接串（OceanBase 非事务读路径 `useReadReplica: true` 使用）：
   * - 未配置或与 `mainWriteUrl` 相同时自动回退复用主写连接池。
   */
  mainReadUrl?: string;
  /**
   * 独立日志库连接串：
   * - 配置时进入 `separate` 模式，使用独立日志连接池；
   * - 未配置（默认）时进入 `shared` 模式，透明回退复用 `main` 连接池。
   */
  logWriteUrl?: string;
  maxConnections?: number;
  logger?: DbLogger;
  metrics?: DbMetrics;
  transactionRunner?: DbTransactionRunner;
  oceanBaseExecutorResolver?: OceanBaseExecutorResolver;
  mongoModelBinder?: MongoModelBinder;
  closeHandler?: () => Promise<void>;
  /**
   * 渐进迁移混合模式（`dialect === 'oceanbase'`）下可选挂载的伴生 MongoDB Runtime 配置：
   * 仅供尚未提供 OceanBase 实现的 Mongo 专用仓储及其事务继续解析到 MongoDB；
   * 已具备双实现的仓储仍严格按主方言路由至 OceanBase。纯 OceanBase 测试缺省不配，保持 fail-closed。
   */
  fallbackMongo?: DbFallbackMongoConfig;
};

/**
 * 进程级数据库 Runtime（MongoDB 生产 + OceanBase 测试双引擎）。
 * 集中管理方言、主/日志双态连接拓扑、驱动执行器绑定、耗时上报与优雅关闭。
 */
export class DbRuntime {
  readonly dialect: DbDialect;
  readonly logMode: DbLogMode;
  readonly maxConnections?: number;

  private readonly separateReadReplica: boolean;
  private readonly logger: DbLogger;
  private readonly metrics: DbMetrics;
  private readonly transactionRunner?: DbTransactionRunner;
  private readonly oceanBaseExecutorResolver?: OceanBaseExecutorResolver;
  private readonly mongoModelBinder?: MongoModelBinder;
  private readonly closeHandler?: () => Promise<void>;
  private state: 'open' | 'closing' | 'closed' = 'open';
  private closePromise?: Promise<void>;

  constructor(config: DbRuntimeConfig) {
    const mainWriteUrl = normalizeOptionalUrl(config.mainWriteUrl);
    if (mainWriteUrl === undefined) {
      throw new DbConfigurationError('Database mainWriteUrl must be a non-empty string');
    }

    const mainReadUrl = normalizeOptionalReadReplicaUrl(mainWriteUrl, config.mainReadUrl);
    // 保留显式传入同 URI 的 logWriteUrl（例如 Mongo 同一副本集 URI 配合不同 dbName 建立独立日志库）
    const logWriteUrl = normalizeOptionalUrl(config.logWriteUrl);
    this.dialect = config.dialect;
    this.logMode = logWriteUrl !== undefined ? 'separate' : 'shared';
    this.separateReadReplica = mainReadUrl !== undefined;
    this.maxConnections = config.maxConnections;
    this.logger = config.logger ?? silentLogger;
    this.metrics = config.metrics ?? {};
    this.transactionRunner = config.transactionRunner;
    this.oceanBaseExecutorResolver = config.oceanBaseExecutorResolver;
    this.mongoModelBinder = config.mongoModelBinder;
    this.closeHandler = config.closeHandler;
  }

  getState(): 'open' | 'closing' | 'closed' {
    return this.state;
  }

  /** 是否配置了物理独立的日志数据库实例（`separate` 为 `true`，`shared` 回退复用主库时为 `false`）。 */
  hasSeparateLogDatabase(): boolean {
    return this.logMode === 'separate';
  }

  /** 是否配置了独立于主写库的只读副本连接池。 */
  hasReadReplica(): boolean {
    return this.separateReadReplica;
  }

  /** 将逻辑数据源解析为物理承接数据源：`shared` 模式下 `log` 透明回退至 `main`。 */
  resolveEffectiveDatasource(datasource: DbDatasource): DbDatasource {
    if (datasource === 'log') {
      return this.logMode === 'separate' ? 'log' : 'main';
    }
    return 'main';
  }

  getLogger(): DbLogger {
    return this.logger;
  }

  private assertOpen(action: string): void {
    if (this.state !== 'open') {
      throw new DbConfigurationError(`Cannot ${action} while DbRuntime is "${this.state}"`);
    }
  }

  getTransactionRunner(): DbTransactionRunner {
    this.assertOpen('access transactionRunner');
    if (this.transactionRunner === undefined) {
      throw new DbConfigurationError(
        `No transactionRunner has been registered for dialect "${this.dialect}"`
      );
    }
    return this.transactionRunner;
  }

  getOceanBaseExecutorResolver(): OceanBaseExecutorResolver {
    this.assertOpen('resolve OceanBase executor');
    if (this.oceanBaseExecutorResolver === undefined) {
      throw new DbConfigurationError(
        `OceanBase executor resolver has not been registered for dialect "${this.dialect}"`
      );
    }
    return this.oceanBaseExecutorResolver;
  }

  /** 按当前 `DbRuntime` 拓扑幂等绑定指定集合的 Mongo `Model`。 */
  bindMongoModel<TDoc, TModel = unknown>(collection: MongoCollectionDescriptor<TDoc>): TModel {
    this.assertOpen(`bind Mongo model "${collection.name}"`);
    if (this.dialect !== 'mongo') {
      throw new DbConfigurationError(
        `Cannot bind Mongo model "${collection.name}" when DbRuntime is configured for dialect "${this.dialect}"`
      );
    }
    if (this.mongoModelBinder === undefined) {
      throw new DbConfigurationError(
        `Mongo model binder has not been registered for dialect "${this.dialect}"`
      );
    }
    const effectiveDatasource = this.resolveEffectiveDatasource(collection.datasource);
    return this.mongoModelBinder<TDoc, TModel>({
      collection,
      datasource: effectiveDatasource
    });
  }

  /** 上报单次数据库操作耗时，并在超过阈值时输出与旧 Mongo 层一致的慢查询告警。 */
  recordOperation({
    datasource = 'main',
    table,
    operation,
    durationMs,
    success
  }: {
    datasource?: DbDatasource;
    table?: string;
    operation: string;
    durationMs: number;
    success: boolean;
  }): void {
    const metric = {
      dialect: this.dialect,
      datasource,
      table,
      operation,
      durationMs,
      success
    };

    if (durationMs >= SLOW_QUERY_ERROR_THRESHOLD_MS) {
      this.logger.error(`Slow database operation > ${SLOW_QUERY_ERROR_THRESHOLD_MS}ms`, metric);
    } else if (durationMs >= SLOW_QUERY_WARN_THRESHOLD_MS) {
      this.logger.warn(`Slow database operation > ${SLOW_QUERY_WARN_THRESHOLD_MS}ms`, metric);
    }

    try {
      this.metrics.operationCompleted?.(metric);
    } catch (error) {
      this.logger.warn('Database metrics callback failed', { error });
    }
  }

  async close(): Promise<void> {
    if (this.closePromise !== undefined) {
      return this.closePromise;
    }
    this.state = 'closing';

    this.closePromise = (async () => {
      try {
        await this.closeHandler?.();
      } finally {
        this.state = 'closed';
      }
    })();

    return this.closePromise;
  }
}

type DbRuntimeRegistration = {
  configurationKey: string;
  runtime: DbRuntime;
  fallbackMongoRuntime?: DbRuntime;
};

type DbRuntimeContext = {
  registration?: DbRuntimeRegistration;
};

const DB_RUNTIME_CONTEXT_SYMBOL = Symbol.for('@fastgpt/dal/db-runtime-context');

const getDbRuntimeContext = (): DbRuntimeContext => {
  const existing = Reflect.get(globalThis, DB_RUNTIME_CONTEXT_SYMBOL) as
    | DbRuntimeContext
    | undefined;
  if (existing !== undefined) {
    return existing;
  }
  const context: DbRuntimeContext = {};
  Reflect.set(globalThis, DB_RUNTIME_CONTEXT_SYMBOL, context);
  return context;
};

const buildConfigurationKey = (config: DbRuntimeConfig): string => {
  const mainWriteUrl = normalizeOptionalUrl(config.mainWriteUrl);
  const mainReadUrl =
    mainWriteUrl !== undefined
      ? normalizeOptionalReadReplicaUrl(mainWriteUrl, config.mainReadUrl)
      : undefined;

  return JSON.stringify({
    dialect: config.dialect,
    mainWriteUrl,
    mainReadUrl,
    logWriteUrl: normalizeOptionalUrl(config.logWriteUrl),
    fallbackMongo:
      config.fallbackMongo !== undefined
        ? {
            mainWriteUrl: normalizeOptionalUrl(config.fallbackMongo.mainWriteUrl),
            logWriteUrl: normalizeOptionalUrl(config.fallbackMongo.logWriteUrl)
          }
        : undefined
  });
};

/**
 * 显式配置进程级默认数据库 Runtime（同拓扑调用幂等，支持 Next.js HMR；切换拓扑前需先关闭）。
 */
export const configureDbRuntime = (config: DbRuntimeConfig): DbRuntime => {
  if (config.fallbackMongo !== undefined && config.dialect !== 'oceanbase') {
    throw new DbConfigurationError('fallbackMongo is only supported when dialect is "oceanbase"');
  }

  const context = getDbRuntimeContext();
  const configurationKey = buildConfigurationKey(config);
  const existing = context.registration;

  if (existing?.runtime.getState() === 'closed') {
    context.registration = undefined;
  } else if (existing !== undefined) {
    if (existing.configurationKey !== configurationKey) {
      throw new DbConfigurationError(
        'Database runtime is already configured with a different dialect or connection topology'
      );
    }
    return existing.runtime;
  }

  const runtime = new DbRuntime(config);
  const fallbackMongoRuntime =
    config.fallbackMongo !== undefined
      ? new DbRuntime({
          ...config.fallbackMongo,
          dialect: 'mongo'
        })
      : undefined;
  context.registration = { configurationKey, runtime, fallbackMongoRuntime };
  return runtime;
};

export const getConfiguredDbRuntime = (dialect?: DbDialect): DbRuntime | undefined => {
  const registration = getDbRuntimeContext().registration;
  if (registration === undefined || registration.runtime.getState() === 'closed') {
    return undefined;
  }
  if (dialect === undefined || dialect === registration.runtime.dialect) {
    return registration.runtime;
  }
  if (dialect === 'mongo') {
    const fallback = registration.fallbackMongoRuntime;
    if (fallback === undefined || fallback.getState() === 'closed') {
      return undefined;
    }
    return fallback;
  }
  return undefined;
};

export const getDbRuntime = (dialect?: DbDialect): DbRuntime => {
  const primary = getConfiguredDbRuntime();
  if (primary === undefined) {
    throw new DbRuntimeNotConfiguredError();
  }
  if (dialect === undefined) {
    return primary;
  }
  const target = getConfiguredDbRuntime(dialect);
  if (target === undefined) {
    throw new DbConfigurationError(
      `No "${dialect}" DbRuntime is configured (active dialect: "${primary.dialect}")`
    );
  }
  return target;
};

export const getDbDialect = (): DbDialect => getDbRuntime().dialect;

export const getDbLogger = (): DbLogger => getConfiguredDbRuntime()?.getLogger() ?? silentLogger;

export const closeDbRuntime = async (): Promise<void> => {
  const context = getDbRuntimeContext();
  const registration = context.registration;
  if (registration === undefined) {
    return;
  }

  const runtimes = [
    registration.runtime,
    ...(registration.fallbackMongoRuntime !== undefined ? [registration.fallbackMongoRuntime] : [])
  ];
  const results = await Promise.allSettled(runtimes.map((runtime) => runtime.close()));
  if (context.registration === registration) {
    context.registration = undefined;
  }

  const firstRejected = results.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected'
  );
  if (firstRejected !== undefined) {
    throw firstRejected.reason;
  }
};
