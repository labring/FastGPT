import { spawn } from 'node:child_process';
import http from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
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

type SignalListener = (signal: NodeJS.Signals) => void;

/** 最小进程替身：记录信号监听器并以 `vi.fn` 捕获 `exit`，供退出编排单测复用。 */
const createProcessMock = () => {
  const listeners = new Map<NodeJS.Signals, Set<SignalListener>>();
  const processRef = {
    on: vi.fn((signal: NodeJS.Signals, listener: SignalListener) => {
      const set = listeners.get(signal) ?? new Set<SignalListener>();
      set.add(listener);
      listeners.set(signal, set);
    }),
    removeListener: vi.fn((signal: NodeJS.Signals, listener: SignalListener) => {
      listeners.get(signal)?.delete(listener);
    }),
    listeners: vi.fn((signal: NodeJS.Signals) => [...(listeners.get(signal) ?? [])]),
    exit: vi.fn()
  };
  return {
    processRef,
    emit: (signal: NodeJS.Signals) => {
      for (const listener of [...(listeners.get(signal) ?? [])]) listener(signal);
    },
    listenerCount: (signal: NodeJS.Signals) => listeners.get(signal)?.size ?? 0
  };
};

const flushAsync = () => new Promise<void>((resolve) => setImmediate(resolve));

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

    const {
      configureDalRuntime,
      registerDalRuntimeShutdown,
      getConfiguredDbRuntime,
      closeDbRuntime
    } = await loadDalRuntime();
    const dbRuntime = configureDalRuntime();
    expect(dbRuntime.getState()).toBe('open');

    const redisClose = vi.fn(async () => undefined);
    const { processRef, emit, listenerCount } = createProcessMock();

    registerDalRuntimeShutdown({
      closeResources: [redisClose, closeDbRuntime],
      processRef,
      signals: ['SIGTERM']
    });

    emit('SIGTERM');
    await flushAsync();

    expect(redisClose).toHaveBeenCalledTimes(1);
    expect(dbRuntime.getState()).toBe('closed');
    expect(getConfiguredDbRuntime()).toBeUndefined();
    expect(processRef.exit).toHaveBeenCalledWith(0);
    expect(listenerCount('SIGTERM')).toBe(0);
  });

  it('restores host listeners on unregister and exits with code 1 after all resources settle on close failure', async () => {
    const { registerDalRuntimeShutdown } = await loadDalRuntime();
    const { processRef, emit, listenerCount } = createProcessMock();

    const prior = vi.fn();
    processRef.on('SIGTERM', prior);
    const unregister = registerDalRuntimeShutdown({
      processRef,
      closeResources: [vi.fn(async () => undefined)],
      signals: ['SIGTERM']
    });
    unregister();
    expect(listenerCount('SIGTERM')).toBe(1);
    emit('SIGTERM');
    expect(prior).toHaveBeenCalledWith('SIGTERM');

    // 资源关闭失败时仍等待全部资源 settle，通过 error 字段上报原始异常并以 1 退出
    processRef.removeListener('SIGTERM', prior);
    const secondClose = vi.fn(async () => undefined);
    const failError = new Error('db close failed');
    const logger = { info: vi.fn(), error: vi.fn() };
    registerDalRuntimeShutdown({
      processRef,
      logger,
      closeResources: [vi.fn(async () => Promise.reject(failError)), secondClose],
      signals: ['SIGTERM']
    });
    emit('SIGTERM');
    await flushAsync();

    expect(secondClose).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      'DAL runtime close failed after process shutdown signal',
      { error: failError }
    );
    expect(processRef.exit).toHaveBeenCalledWith(1);

    // 多个资源同时关闭失败时用 AggregateError 经 error 字段一次保留全部异常
    const multiMock = createProcessMock();
    const multiLogger = { info: vi.fn(), error: vi.fn() };
    const redisError = new Error('redis close failed');
    const dbError = new Error('db close failed');
    registerDalRuntimeShutdown({
      processRef: multiMock.processRef,
      logger: multiLogger,
      closeResources: [
        vi.fn(async () => Promise.reject(redisError)),
        vi.fn(async () => Promise.reject(dbError))
      ],
      signals: ['SIGTERM']
    });
    multiMock.emit('SIGTERM');
    await flushAsync();

    expect(multiLogger.error).toHaveBeenCalledWith(
      'DAL runtime close failed after process shutdown signal',
      expect.objectContaining({ error: expect.any(AggregateError) })
    );
    const loggedError: unknown = multiLogger.error.mock.calls[0]?.[1]?.error;
    expect(loggedError).toBeInstanceOf(AggregateError);
    if (loggedError instanceof AggregateError) {
      expect(loggedError.errors).toEqual([redisError, dbError]);
    }
    expect(multiMock.processRef.exit).toHaveBeenCalledWith(1);
  });

  it('drains an in-flight HTTP request and survives duplicate OS SIGTERM signals in a real child process', async () => {
    const repoRoot = path.resolve(import.meta.dirname, '../../../../..');
    const appRequire = createRequire(path.join(repoRoot, 'projects/app/package.json'));
    const tsxLoaderPath = appRequire.resolve('tsx');

    const childScript = `
import http from 'node:http';
import { configureDbRuntime, closeDbRuntime } from './packages/dal/db/runtime';
import { registerDalRuntimeShutdown } from './packages/service/common/db/dalRuntime';

const server = http.createServer((_req, res) => {
  console.log('EVENT:http_req_start');
  setTimeout(() => {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok-after-drain');
    console.log('EVENT:http_req_end');
  }, 250);
});

let cleanupStarted = false;
process.on('SIGTERM', (signal) => {
  if (cleanupStarted) return;
  cleanupStarted = true;
  (async () => {
    await new Promise((resolve) => server.close(() => resolve(undefined)));
    console.log('EVENT:http_server_closed');
    process.exit(signal === 'SIGINT' ? 130 : 143);
  })();
});

configureDbRuntime({
  dialect: 'oceanbase',
  mainWriteUrl: 'mysql://root@127.0.0.1:2881/fastgpt',
  closeHandler: async () => {
    console.log('EVENT:db_close_start');
    await new Promise((resolve) => setTimeout(resolve, 200));
    console.log('EVENT:db_close_done');
  }
});

registerDalRuntimeShutdown({
  closeResources: [
    async () => {
      console.log('EVENT:redis_close_start');
      await new Promise((resolve) => setTimeout(resolve, 40));
      console.log('EVENT:redis_close_done');
    },
    closeDbRuntime
  ]
});

server.listen(0, '127.0.0.1', () => {
  const addr = server.address();
  if (addr && typeof addr === 'object') {
    console.log('PORT:' + addr.port);
  }
});
`;

    const result = await new Promise<{
      code: number | null;
      signal: NodeJS.Signals | null;
      stdout: string;
      reqStatus: number;
      reqBody: string;
    }>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        ['--import', tsxLoaderPath, '--input-type=module', '-e', childScript],
        {
          cwd: repoRoot,
          env: {
            ...process.env,
            FILE_TOKEN_KEY: 'filetokenkey',
            AES256_SECRET_KEY: 'fastgptsecret',
            INVOKE_TOKEN_SECRET: validInvokeTokenSecret
          },
          stdio: ['ignore', 'pipe', 'pipe']
        }
      );

      let stdout = '';
      let reqStatus = 0;
      let reqBody = '';
      let startedReq = false;
      let sentDuplicateSigterm = false;

      child.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        stdout += text;
        const portMatch = text.match(/PORT:(\d+)/);
        if (portMatch && !startedReq) {
          startedReq = true;
          const req = http.get(`http://127.0.0.1:${portMatch[1]}/`, (res) => {
            reqStatus = res.statusCode ?? 0;
            res.on('data', (data: Buffer) => {
              reqBody += data.toString();
            });
          });
          req.on('error', reject);
          setTimeout(() => child.kill('SIGTERM'), 50);
        }
        if (text.includes('EVENT:db_close_start') && !sentDuplicateSigterm) {
          sentDuplicateSigterm = true;
          child.kill('SIGTERM');
          setTimeout(() => child.kill('SIGTERM'), 40);
        }
      });

      child.on('error', reject);
      child.on('exit', (code, signal) => {
        resolve({ code, signal, stdout, reqStatus, reqBody });
      });
    });

    expect(result.code).toBe(143);
    expect(result.signal).toBeNull();
    expect(result.reqStatus).toBe(200);
    expect(result.reqBody).toBe('ok-after-drain');
    expect(result.stdout).toContain('EVENT:http_server_closed');
    expect(result.stdout).toContain('EVENT:redis_close_done');
    expect(result.stdout).toContain('EVENT:db_close_done');
    expect(result.stdout.indexOf('EVENT:http_server_closed')).toBeLessThan(
      result.stdout.indexOf('EVENT:db_close_start')
    );
  }, 15_000);
});
