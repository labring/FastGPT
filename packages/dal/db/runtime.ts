import {
  DbConfigurationError,
  DbLogDatasourceNotConfiguredError,
  DbRuntimeNotConfiguredError
} from './errors';
import {
  getDbDialectFamily,
  type DbDatasource,
  type DbDialect,
  type DbDialectFamily,
  type DbLogger,
  type DbMetrics,
  type DbTransactionRunner,
  type SqlExecutorResolver
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

export type DbRuntimeConfig = {
  dialect: DbDialect;
  mainWriteUrl: string;
  /** 只读副本连接串；未配置时读流量自动路由至主写连接池。 */
  mainReadUrl?: string;
  /**
   * 独立日志库连接串。
   * 未配置时不回退至 mainWriteUrl、不建立任何日志库连接实例，日志类仓储将自动切换至 Noop 空实现。
   */
  logWriteUrl?: string;
  /** 独立日志库只读副本连接串；仅在配置了 logWriteUrl 时生效，未配置时回退至 logWritePool。 */
  logReadUrl?: string;
  maxConnections?: number;
  logger?: DbLogger;
  metrics?: DbMetrics;
  transactionRunner?: DbTransactionRunner;
  sqlExecutorResolver?: SqlExecutorResolver;
  healthChecker?: (datasource: DbDatasource) => Promise<void>;
  closeHandler?: () => Promise<void>;
};

/**
 * 进程级数据库 Runtime。
 *
 * 集中管理当前激活的数据库方言（mongo | postgres | oceanbase | mysql）与实现族（mongo | sql）、
 * 主库/独立日志库拓扑、读写分离路由规则、慢查询观测、健康检查及优雅关闭。
 * 不在模块内部隐式读取环境变量。
 */
export class DbRuntime {
  readonly dialect: DbDialect;
  readonly family: DbDialectFamily;
  readonly maxConnections?: number;

  private readonly mainWriteUrl: string;
  private readonly mainReadUrl?: string;
  private readonly logWriteUrl?: string;
  private readonly logReadUrl?: string;
  private readonly logger: DbLogger;
  private readonly metrics: DbMetrics;
  private transactionRunner?: DbTransactionRunner;
  private sqlExecutorResolver?: SqlExecutorResolver;
  private readonly healthChecker?: (datasource: DbDatasource) => Promise<void>;
  private readonly closeHandler?: () => Promise<void>;
  private state: 'open' | 'closing' | 'closed' = 'open';
  private closePromise?: Promise<void>;

  constructor(config: DbRuntimeConfig) {
    const mainWriteUrl = normalizeOptionalUrl(config.mainWriteUrl);
    if (mainWriteUrl === undefined) {
      throw new DbConfigurationError('Database mainWriteUrl must be a non-empty string');
    }

    const logWriteUrl = normalizeOptionalUrl(config.logWriteUrl);
    const logReadUrl = normalizeOptionalUrl(config.logReadUrl);
    if (logReadUrl !== undefined && logWriteUrl === undefined) {
      throw new DbConfigurationError(
        'Database logReadUrl cannot be configured when logWriteUrl is omitted'
      );
    }

    this.dialect = config.dialect;
    this.family = getDbDialectFamily(config.dialect);
    this.mainWriteUrl = mainWriteUrl;
    this.mainReadUrl = normalizeOptionalUrl(config.mainReadUrl);
    this.logWriteUrl = logWriteUrl;
    this.logReadUrl = logReadUrl;
    this.maxConnections = config.maxConnections;
    this.logger = config.logger ?? silentLogger;
    this.metrics = config.metrics ?? {};
    this.transactionRunner = config.transactionRunner;
    this.sqlExecutorResolver = config.sqlExecutorResolver;
    this.healthChecker = config.healthChecker;
    this.closeHandler = config.closeHandler;
  }

  getState(): 'open' | 'closing' | 'closed' {
    return this.state;
  }

  /** 是否启用了独立的日志数据库实例（未配置 logWriteUrl 时为 false）。 */
  hasLogDatabase(): boolean {
    return this.logWriteUrl !== undefined;
  }

  hasMainReadReplica(): boolean {
    return this.mainReadUrl !== undefined;
  }

  hasLogReadReplica(): boolean {
    return this.logReadUrl !== undefined;
  }

  getLogger(): DbLogger {
    return this.logger;
  }

  setTransactionRunner(runner: DbTransactionRunner): void {
    this.transactionRunner = runner;
  }

  getTransactionRunner(): DbTransactionRunner {
    if (this.transactionRunner === undefined) {
      throw new DbConfigurationError(
        `No transactionRunner has been registered for dialect "${this.dialect}"`
      );
    }
    return this.transactionRunner;
  }

  setSqlExecutorResolver(resolver: SqlExecutorResolver): void {
    this.sqlExecutorResolver = resolver;
  }

  getSqlExecutorResolver(): SqlExecutorResolver {
    if (this.sqlExecutorResolver === undefined) {
      throw new DbConfigurationError(
        `SQL executor resolver has not been registered for dialect "${this.dialect}"`
      );
    }
    return this.sqlExecutorResolver;
  }

  /**
   * 计算读请求的目标连接池角色。
   *
   * 只要调用处于活跃事务内（`hasActiveTx === true`），强制忽略 `useReadReplica` 并路由至 `write` 池，
   * 保证事务内能够读到自身尚未提交的写入。
   */
  resolveReadTarget({
    datasource = 'main',
    useReadReplica = false,
    hasActiveTx = false
  }: {
    datasource?: DbDatasource;
    useReadReplica?: boolean;
    hasActiveTx?: boolean;
  } = {}): { datasource: DbDatasource; target: 'write' | 'readReplica' } {
    if (datasource === 'log' && !this.hasLogDatabase()) {
      throw new DbLogDatasourceNotConfiguredError();
    }
    if (hasActiveTx || !useReadReplica) {
      return { datasource, target: 'write' };
    }
    const hasReplica = datasource === 'main' ? this.hasMainReadReplica() : this.hasLogReadReplica();
    return {
      datasource,
      target: hasReplica ? 'readReplica' : 'write'
    };
  }

  private recordMetric(name: string, callback: () => void): void {
    try {
      callback();
    } catch (error) {
      this.logger.warn('Database metrics callback failed', { name, error });
    }
  }

  /** 统一记录数据库操作耗时与慢查询告警（>=500ms warn，>=2000ms error），跨 Mongo 与 SQL 共享标准。 */
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
      this.recordMetric('slowQuery', () =>
        this.metrics.slowQuery?.({ ...metric, severity: 'error' })
      );
    } else if (durationMs >= SLOW_QUERY_WARN_THRESHOLD_MS) {
      this.logger.warn(`Slow database operation > ${SLOW_QUERY_WARN_THRESHOLD_MS}ms`, metric);
      this.recordMetric('slowQuery', () =>
        this.metrics.slowQuery?.({ ...metric, severity: 'warn' })
      );
    }

    this.recordMetric('operationCompleted', () => this.metrics.operationCompleted?.(metric));
  }

  async checkHealth(datasource: DbDatasource = 'main'): Promise<void> {
    if (datasource === 'log' && !this.hasLogDatabase()) {
      throw new DbLogDatasourceNotConfiguredError();
    }

    const startedAt = Date.now();
    try {
      await this.healthChecker?.(datasource);
      this.recordMetric('healthCheck', () =>
        this.metrics.healthCheck?.({
          dialect: this.dialect,
          datasource,
          success: true,
          latencyMs: Date.now() - startedAt
        })
      );
    } catch (error) {
      this.recordMetric('healthCheck', () =>
        this.metrics.healthCheck?.({
          dialect: this.dialect,
          datasource,
          success: false,
          latencyMs: Date.now() - startedAt
        })
      );
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.closePromise !== undefined) {
      return this.closePromise;
    }
    this.state = 'closing';
    const startedAt = Date.now();

    this.closePromise = (async () => {
      try {
        await this.closeHandler?.();
      } finally {
        this.state = 'closed';
        this.recordMetric('shutdownCompleted', () =>
          this.metrics.shutdownCompleted?.({ durationMs: Date.now() - startedAt })
        );
      }
    })();

    return this.closePromise;
  }
}

type DbRuntimeRegistration = {
  configurationKey: string;
  runtime: DbRuntime;
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

const buildConfigurationKey = (config: DbRuntimeConfig): string =>
  JSON.stringify({
    dialect: config.dialect,
    mainWriteUrl: normalizeOptionalUrl(config.mainWriteUrl),
    mainReadUrl: normalizeOptionalUrl(config.mainReadUrl),
    logWriteUrl: normalizeOptionalUrl(config.logWriteUrl),
    logReadUrl: normalizeOptionalUrl(config.logReadUrl)
  });

/**
 * 显式配置进程级默认数据库 Runtime。
 *
 * 相同连接拓扑重复调用保持幂等（支持 Next.js HMR 热重载复用）；
 * 运行期若未先关闭就切换方言或连接串，将直接抛出 `DbConfigurationError`。
 */
export const configureDbRuntime = (config: DbRuntimeConfig): DbRuntime => {
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
  context.registration = { configurationKey, runtime };
  return runtime;
};

export const getConfiguredDbRuntime = (): DbRuntime | undefined => {
  const registration = getDbRuntimeContext().registration;
  if (registration?.runtime.getState() === 'closed') {
    return undefined;
  }
  return registration?.runtime;
};

export const getDbRuntime = (): DbRuntime => {
  const runtime = getConfiguredDbRuntime();
  if (runtime === undefined) {
    throw new DbRuntimeNotConfiguredError();
  }
  return runtime;
};

export const getDbDialect = (): DbDialect => getDbRuntime().dialect;

export const getDbFamily = (): DbDialectFamily => getDbRuntime().family;

export const hasLogDatabase = (): boolean => getDbRuntime().hasLogDatabase();

export const getDbLogger = (): DbLogger => getConfiguredDbRuntime()?.getLogger() ?? silentLogger;

export const checkDbHealth = (datasource: DbDatasource = 'main'): Promise<void> =>
  getDbRuntime().checkHealth(datasource);

export const closeDbRuntime = async (): Promise<void> => {
  const context = getDbRuntimeContext();
  const registration = context.registration;
  if (registration === undefined) {
    return;
  }
  await registration.runtime.close();
  if (context.registration === registration) {
    context.registration = undefined;
  }
};
