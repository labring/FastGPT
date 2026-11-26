import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerRedisRuntimeShutdown } from '@fastgpt/dal/redis/runtime';

type Signal = NodeJS.Signals;

const createProcessMock = () => {
  const listeners = new Map<Signal, Set<() => void>>();
  const processRef = {
    on: vi.fn((signal: Signal, listener: () => void) => {
      const signalListeners = listeners.get(signal) ?? new Set<() => void>();
      signalListeners.add(listener);
      listeners.set(signal, signalListeners);
    }),
    removeListener: vi.fn((signal: Signal, listener: () => void) => {
      listeners.get(signal)?.delete(listener);
    }),
    exit: vi.fn()
  };

  return {
    processRef,
    emit(signal: Signal) {
      for (const listener of listeners.get(signal) ?? []) listener();
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
});
