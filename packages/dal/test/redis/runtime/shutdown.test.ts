import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerRedisRuntimeShutdown } from '@fastgpt/dal/redis/runtime';

type Signal = NodeJS.Signals;

const createProcessMock = () => {
  const listeners = new Map<Signal, Set<(signal: Signal) => void>>();
  const exit = vi.fn();
  const processRef = {
    on: vi.fn((signal: Signal, listener: (signal: Signal) => void) => {
      const signalListeners = listeners.get(signal) ?? new Set<(signal: Signal) => void>();
      signalListeners.add(listener);
      listeners.set(signal, signalListeners);
    }),
    removeListener: vi.fn((signal: Signal, listener: (signal: Signal) => void) => {
      listeners.get(signal)?.delete(listener);
    }),
    listeners: vi.fn((signal: Signal) => [...(listeners.get(signal) ?? [])]),
    exit
  };

  return {
    processRef,
    realExit: exit,
    emit(signal: Signal) {
      for (const listener of [...(listeners.get(signal) ?? [])]) listener(signal);
    },
    listenerCount(signal: Signal) {
      return listeners.get(signal)?.size ?? 0;
    }
  };
};

const createRuntime = (close: () => Promise<void>) => ({ close });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('registerRedisRuntimeShutdown', () => {
  it('installs idempotent SIGTERM/SIGINT handlers and closes once', async () => {
    const processMock = createProcessMock();
    const runtime = createRuntime(vi.fn(async () => undefined));
    const unregister = registerRedisRuntimeShutdown({
      runtime,
      processRef: processMock.processRef,
      exitProcess: true
    });
    const sameUnregister = registerRedisRuntimeShutdown({
      runtime,
      processRef: processMock.processRef,
      exitProcess: true
    });

    expect(sameUnregister).toBe(unregister);
    expect(processMock.processRef.on).toHaveBeenCalledTimes(2);
    expect(processMock.listenerCount('SIGTERM')).toBe(1);
    expect(processMock.listenerCount('SIGINT')).toBe(1);

    processMock.emit('SIGTERM');
    processMock.emit('SIGINT');
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(runtime.close).toHaveBeenCalledTimes(1);
    expect(processMock.processRef.exit).toHaveBeenCalledWith(0);
    expect(processMock.listenerCount('SIGTERM')).toBe(0);
    expect(processMock.listenerCount('SIGINT')).toBe(0);
  });

  it('logs close failures and exits with a failure code', async () => {
    const processMock = createProcessMock();
    const closeError = new Error('close failed');
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };
    const runtime = createRuntime(vi.fn(async () => Promise.reject(closeError)));

    registerRedisRuntimeShutdown({
      runtime,
      processRef: processMock.processRef,
      logger
    });
    processMock.emit('SIGTERM');
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(logger.error).toHaveBeenCalledWith(
      'Redis runtime close failed after process shutdown signal',
      { error: closeError }
    );
    expect(processMock.processRef.exit).toHaveBeenCalledWith(1);
  });

  it('removes handlers when explicitly unregistered and rejects an absent Runtime', () => {
    const processMock = createProcessMock();
    const runtime = createRuntime(vi.fn(async () => undefined));
    const unregister = registerRedisRuntimeShutdown({
      runtime,
      processRef: processMock.processRef,
      exitProcess: false
    });

    unregister();
    unregister();

    expect(processMock.listenerCount('SIGTERM')).toBe(0);
    expect(processMock.listenerCount('SIGINT')).toBe(0);
    expect(() =>
      registerRedisRuntimeShutdown({
        processRef: processMock.processRef
      })
    ).toThrow('Redis runtime has not been configured');
  });

  it('waits for coordinated onShutdown hook before exiting and reports hook failures', async () => {
    const processMock = createProcessMock();
    let releaseHook!: () => void;
    const hookGate = new Promise<void>((resolve) => {
      releaseHook = resolve;
    });
    const onShutdown = vi.fn(() => hookGate);
    const runtime = createRuntime(vi.fn(async () => undefined));

    registerRedisRuntimeShutdown({
      runtime,
      processRef: processMock.processRef,
      onShutdown,
      exitProcess: true
    });

    processMock.emit('SIGTERM');
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(runtime.close).toHaveBeenCalledTimes(1);
    expect(onShutdown).toHaveBeenCalledTimes(1);
    expect(processMock.processRef.exit).not.toHaveBeenCalled();

    releaseHook();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(processMock.processRef.exit).toHaveBeenCalledWith(0);

    const failMock = createProcessMock();
    const hookError = new Error('db close failed');
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const runtime2 = createRuntime(vi.fn(async () => undefined));
    registerRedisRuntimeShutdown({
      runtime: runtime2,
      processRef: failMock.processRef,
      logger,
      onShutdown: vi.fn(async () => Promise.reject(hookError)),
      exitProcess: true
    });

    failMock.emit('SIGTERM');
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(runtime2.close).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      'Redis runtime close failed after process shutdown signal',
      { error: hookError }
    );
    expect(failMock.processRef.exit).toHaveBeenCalledWith(1);
  });

  it('coordinates with an existing Next.js-style SIGTERM listener so HTTP drains before DAL closes and preserves signal exit code', async () => {
    const processMock = createProcessMock();
    const timeline: string[] = [];

    let finishHttpDrain!: () => void;
    const httpDrainGate = new Promise<void>((resolve) => {
      finishHttpDrain = resolve;
    });
    let finishDbClose!: () => void;
    const dbCloseGate = new Promise<void>((resolve) => {
      finishDbClose = resolve;
    });

    // 模拟 Next.js start-server 在 instrumentation 之前注册的默认 SIGTERM cleanup
    const nextStyleCleanup = (signal: Signal) => {
      timeline.push(`next-cleanup-start:${signal}`);
      void httpDrainGate.then(() => {
        timeline.push('next-http-drained');
        processMock.processRef.exit(signal === 'SIGINT' ? 130 : 143);
      });
    };
    processMock.processRef.on('SIGTERM', nextStyleCleanup);

    const runtime = createRuntime(
      vi.fn(async () => {
        timeline.push('redis-closed');
      })
    );
    const onShutdown = vi.fn(async () => {
      timeline.push('db-close-start');
      await dbCloseGate;
      timeline.push('db-close-done');
    });

    const unregister = registerRedisRuntimeShutdown({
      runtime,
      processRef: processMock.processRef,
      onShutdown,
      exitProcess: true,
      signals: ['SIGTERM']
    });
    // 注册后仅保留唯一协调监听器
    expect(processMock.listenerCount('SIGTERM')).toBe(1);

    processMock.emit('SIGTERM');
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(timeline).toEqual(['next-cleanup-start:SIGTERM']);
    expect(runtime.close).not.toHaveBeenCalled();
    expect(onShutdown).not.toHaveBeenCalled();
    expect(processMock.realExit).not.toHaveBeenCalled();

    // Next.js 排空 HTTP 并尝试 process.exit(143)，被协调器接管后开始关闭 Redis 与 DB
    finishHttpDrain();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(timeline).toEqual([
      'next-cleanup-start:SIGTERM',
      'next-http-drained',
      'redis-closed',
      'db-close-start'
    ]);
    expect(processMock.realExit).not.toHaveBeenCalled();

    // DB 关闭完成后才真正退出，且保留 Next.js 的 143 退出码
    finishDbClose();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(timeline).toEqual([
      'next-cleanup-start:SIGTERM',
      'next-http-drained',
      'redis-closed',
      'db-close-start',
      'db-close-done'
    ]);
    expect(processMock.realExit).toHaveBeenCalledTimes(1);
    expect(processMock.realExit).toHaveBeenCalledWith(143);
    expect(processMock.processRef.exit).toBe(processMock.realExit);
    unregister();
  });

  it('restores prior signal listeners on explicit unregister and catches logger failures without unhandled rejection', async () => {
    const restoreMock = createProcessMock();
    const prior = vi.fn();
    restoreMock.processRef.on('SIGTERM', prior);

    const unregister = registerRedisRuntimeShutdown({
      runtime: createRuntime(vi.fn(async () => undefined)),
      processRef: restoreMock.processRef,
      signals: ['SIGTERM']
    });
    unregister();

    expect(restoreMock.listenerCount('SIGTERM')).toBe(1);
    restoreMock.emit('SIGTERM');
    expect(prior).toHaveBeenCalledWith('SIGTERM');

    const throwingLoggerMock = createProcessMock();
    const throwingLogger = {
      info: vi.fn(() => {
        throw new Error('logger boom');
      }),
      warn: vi.fn(),
      error: vi.fn()
    };
    registerRedisRuntimeShutdown({
      runtime: createRuntime(vi.fn(async () => undefined)),
      processRef: throwingLoggerMock.processRef,
      logger: throwingLogger,
      signals: ['SIGTERM']
    });
    throwingLoggerMock.emit('SIGTERM');
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(throwingLoggerMock.realExit).toHaveBeenCalledWith(1);
  });

  it('prevents a late-registered listener from exiting early without blocking when it does not call exit', async () => {
    const processMock = createProcessMock();
    let releaseDb!: () => void;
    const dbGate = new Promise<void>((resolve) => {
      releaseDb = resolve;
    });

    registerRedisRuntimeShutdown({
      runtime: createRuntime(vi.fn(async () => undefined)),
      processRef: processMock.processRef,
      onShutdown: vi.fn(() => dbGate),
      signals: ['SIGTERM'],
      frameworkShutdownTimeoutMs: 5_000
    });

    // 后注册的监听器立即尝试 exit(143)，不应在 DB 关闭前抢先退出
    processMock.processRef.on('SIGTERM', () => {
      processMock.processRef.exit(143);
    });

    processMock.emit('SIGTERM');
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(processMock.realExit).not.toHaveBeenCalled();

    releaseDb();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(processMock.realExit).toHaveBeenCalledWith(143);

    // 仅记录日志、不调用 exit 的后注册监听器不应触发 5s 超时等待
    const nonExitingMock = createProcessMock();
    registerRedisRuntimeShutdown({
      runtime: createRuntime(vi.fn(async () => undefined)),
      processRef: nonExitingMock.processRef,
      signals: ['SIGTERM'],
      frameworkShutdownTimeoutMs: 5_000
    });
    const observer = vi.fn();
    nonExitingMock.processRef.on('SIGTERM', observer);

    nonExitingMock.emit('SIGTERM');
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(observer).toHaveBeenCalledWith('SIGTERM');
    expect(nonExitingMock.realExit).toHaveBeenCalledWith(0);
  });
});
