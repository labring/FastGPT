import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeDbRuntime } from '@fastgpt/dal/db/runtime';

const mocks = vi.hoisted(() => ({
  isProfiling: vi.fn(() => false),
  recordMongoOperation: vi.fn(),
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

vi.mock('@fastgpt/service/common/profiling', () => ({
  isProfiling: mocks.isProfiling,
  recordMongoOperation: mocks.recordMongoOperation
}));

vi.mock('@fastgpt/service/common/logger', () => ({
  getLogger: () => mocks.logger,
  LogCategories: {
    INFRA: {
      MONGO: ['infra', 'mongo'],
      OCEANBASE: ['infra', 'oceanbase']
    }
  }
}));

const validInvokeTokenSecret = 'fastgpt_test_invoke_token_secret_32';

const loadDalRuntime = async () => {
  vi.resetModules();
  const [dalRuntimeMod, errorsMod, runtimeMod] = await Promise.all([
    import('@fastgpt/service/common/db/dalRuntime'),
    import('@fastgpt/dal/db/errors'),
    import('@fastgpt/dal/db/runtime')
  ]);
  return { ...dalRuntimeMod, ...errorsMod, ...runtimeMod };
};

describe('@fastgpt/service/common/db/dalRuntime', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await closeDbRuntime();
    mocks.isProfiling.mockReturnValue(false);
    vi.stubEnv('FILE_TOKEN_KEY', 'filetokenkey');
    vi.stubEnv('AES256_SECRET_KEY', 'fastgptsecret');
    vi.stubEnv('INVOKE_TOKEN_SECRET', validInvokeTokenSecret);
    vi.stubEnv('MONGODB_URI', 'mongodb://127.0.0.1:27017/fastgpt');
    vi.stubEnv('MONGODB_LOG_URI', '');
    vi.stubEnv('DB_DIALECT', undefined);
    vi.stubEnv('OCEANBASE_DB_URI', undefined);
    vi.stubEnv('OCEANBASE_LOG_DB_URI', undefined);
    vi.stubEnv('OCEANBASE_DB_READ_URI', undefined);
    vi.stubEnv('OCEANBASE_URL', undefined);
    vi.stubEnv('SEEKDB_URL', undefined);
  });

  afterEach(async () => {
    await closeDbRuntime();
    vi.unstubAllEnvs();
  });

  it('defaults to mongo dialect with shared/separate logMode and forwards profiling metrics', async () => {
    const { configureDalRuntime, closeDbRuntime: closeReloaded } = await loadDalRuntime();

    const sharedRuntime = configureDalRuntime();
    expect(sharedRuntime.dialect).toBe('mongo');
    expect(sharedRuntime.logMode).toBe('shared');
    expect(sharedRuntime.hasSeparateLogDatabase()).toBe(false);
    expect(sharedRuntime.hasReadReplica()).toBe(false);

    mocks.isProfiling.mockReturnValue(true);
    sharedRuntime.recordOperation({
      table: 'apps',
      operation: 'find',
      durationMs: 12,
      success: true
    });
    expect(mocks.recordMongoOperation).toHaveBeenCalledWith({
      collectionName: 'apps',
      durationMs: 12
    });

    await closeReloaded();

    vi.stubEnv('MONGODB_LOG_URI', 'mongodb://127.0.0.1:27017/fastgpt_log');
    const { configureDalRuntime: reloadConfigure } = await loadDalRuntime();
    const separateRuntime = reloadConfigure();
    expect(separateRuntime.dialect).toBe('mongo');
    expect(separateRuntime.logMode).toBe('separate');
    expect(separateRuntime.hasSeparateLogDatabase()).toBe(true);
  });

  it('configures oceanbase dialect with shared/separate logMode, read replica, and idempotency', async () => {
    vi.stubEnv('DB_DIALECT', 'oceanbase');
    vi.stubEnv('DB_MAX_LINK', '25');
    vi.stubEnv('OCEANBASE_DB_URI', 'mysql://root@127.0.0.1:2881/fastgpt');

    const { configureDalRuntime, closeDbRuntime: closeReloaded } = await loadDalRuntime();
    const first = configureDalRuntime();
    expect(first.dialect).toBe('oceanbase');
    expect(first.logMode).toBe('shared');
    expect(first.hasReadReplica()).toBe(false);
    expect(first.maxConnections).toBe(25);

    const second = configureDalRuntime();
    expect(second).toBe(first);

    await closeReloaded();

    vi.stubEnv('OCEANBASE_LOG_DB_URI', 'mysql://root@127.0.0.1:2883/fastgpt_log');
    vi.stubEnv('OCEANBASE_DB_READ_URI', 'mysql://root@127.0.0.1:2882/fastgpt_ro');
    const { configureDalRuntime: reloadSeparate } = await loadDalRuntime();
    const separate = reloadSeparate();
    expect(separate.dialect).toBe('oceanbase');
    expect(separate.logMode).toBe('separate');
    expect(separate.hasSeparateLogDatabase()).toBe(true);
    expect(separate.hasReadReplica()).toBe(true);

    mocks.isProfiling.mockReturnValue(true);
    separate.recordOperation({
      datasource: 'log',
      table: 'app_chat_logs',
      operation: 'insert',
      durationMs: 18,
      success: true
    });
    expect(mocks.recordMongoOperation).toHaveBeenCalledWith({
      collectionName: 'app_chat_logs',
      durationMs: 18
    });
  });

  it('never falls back to vector DB OCEANBASE_URL or SEEKDB_URL when OCEANBASE_DB_URI is missing', async () => {
    vi.stubEnv('OCEANBASE_URL', 'mysql://root@127.0.0.1:2881/vector');
    vi.stubEnv('SEEKDB_URL', 'mysql://root@127.0.0.1:2881/seekdb');
    vi.stubEnv('OCEANBASE_DB_URI', undefined);

    const { configureDalRuntime, DbConfigurationError } = await loadDalRuntime();
    expect(() => configureDalRuntime({ dialect: 'oceanbase' })).toThrow(DbConfigurationError);
  });

  it('closes both RedisRuntime and DbRuntime before exiting on SIGTERM via registerDalRuntimeShutdown', async () => {
    vi.stubEnv('DB_DIALECT', 'oceanbase');
    vi.stubEnv('OCEANBASE_DB_URI', 'mysql://root@127.0.0.1:2881/fastgpt');

    const { configureDalRuntime, registerDalRuntimeShutdown, getConfiguredDbRuntime } =
      await loadDalRuntime();
    const dbRuntime = configureDalRuntime();
    expect(dbRuntime.getState()).toBe('open');

    const redisClose = vi.fn(async () => undefined);
    const listeners = new Map<NodeJS.Signals, Set<() => void>>();
    const processRef = {
      on: vi.fn((signal: NodeJS.Signals, listener: () => void) => {
        const set = listeners.get(signal) ?? new Set<() => void>();
        set.add(listener);
        listeners.set(signal, set);
      }),
      removeListener: vi.fn((signal: NodeJS.Signals, listener: () => void) => {
        listeners.get(signal)?.delete(listener);
      }),
      exit: vi.fn()
    };

    registerDalRuntimeShutdown({
      runtime: { close: redisClose },
      processRef,
      exitProcess: true
    });

    for (const listener of listeners.get('SIGTERM') ?? []) {
      listener();
    }
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(redisClose).toHaveBeenCalledTimes(1);
    expect(dbRuntime.getState()).toBe('closed');
    expect(getConfiguredDbRuntime()).toBeUndefined();
    expect(processRef.exit).toHaveBeenCalledWith(0);
  });
});
