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

export type DbRuntimeConfig = {
  dialect: DbDialect;
  mainWriteUrl: string;
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
};

/**
 * 进程级数据库 Runtime（MongoDB 生产 + OceanBase 测试双引擎）。
 * 集中管理方言、主/日志双态连接拓扑、驱动执行器绑定、耗时上报与优雅关闭。
 */
export class DbRuntime {
  readonly dialect: DbDialect;
  readonly logMode: DbLogMode;
  readonly maxConnections?: number;

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

    const logWriteUrl = normalizeOptionalUrl(config.logWriteUrl);
    this.dialect = config.dialect;
    this.logMode = logWriteUrl !== undefined ? 'separate' : 'shared';
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

  getTransactionRunner(): DbTransactionRunner {
    if (this.transactionRunner === undefined) {
      throw new DbConfigurationError(
        `No transactionRunner has been registered for dialect "${this.dialect}"`
      );
    }
    return this.transactionRunner;
  }

  getOceanBaseExecutorResolver(): OceanBaseExecutorResolver {
    if (this.oceanBaseExecutorResolver === undefined) {
      throw new DbConfigurationError(
        `OceanBase executor resolver has not been registered for dialect "${this.dialect}"`
      );
    }
    return this.oceanBaseExecutorResolver;
  }

  /** 按当前 `DbRuntime` 拓扑幂等绑定指定集合的 Mongo `Model`。 */
  bindMongoModel<TDoc, TModel = unknown>(collection: MongoCollectionDescriptor<TDoc>): TModel {
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
    logWriteUrl: normalizeOptionalUrl(config.logWriteUrl)
  });

/**
 * 显式配置进程级默认数据库 Runtime（同拓扑调用幂等，支持 Next.js HMR；切换拓扑前需先关闭）。
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

export const getDbLogger = (): DbLogger => getConfiguredDbRuntime()?.getLogger() ?? silentLogger;

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
