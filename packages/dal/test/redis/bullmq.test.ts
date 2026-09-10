import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getConfiguredRedisBullMQRuntime,
  getRedisBullMQRuntime,
  RedisBullMQRuntime,
  type RedisBullMQRuntimeOptions
} from '../../redis/bullmq';
import { RedisRuntime, type RedisClient } from '../../redis/runtime';

const bullMQMocks = vi.hoisted(() => ({
  queues: [] as Array<{ name: string; options: Record<string, unknown> }>,
  flowProducers: [] as Array<{ options: Record<string, unknown> }>,
  workers: [] as Array<{ name: string; options: Record<string, unknown> }>,
  closeOrder: [] as string[],
  queueConstructorFailures: 0,
  flowProducerConstructorFailures: 0,
  workerConstructorFailures: 0,
  onWorkerClose: undefined as (() => void) | undefined
}));

vi.mock('bullmq', async () => {
  const { EventEmitter } = await import('node:events');

  class MockQueue extends EventEmitter {
    readonly close = vi.fn(async () => {
      bullMQMocks.closeOrder.push(`queue:${this.name}`);
    });
    readonly disconnect = vi.fn(async () => undefined);
    readonly connection = {
      disconnect: vi.fn(async () => undefined)
    };

    constructor(
      readonly name: string,
      readonly options: Record<string, unknown>
    ) {
      super();
      if (bullMQMocks.queueConstructorFailures > 0) {
        bullMQMocks.queueConstructorFailures -= 1;
        throw new Error('queue constructor failed');
      }
      bullMQMocks.queues.push(this);
    }
  }

  class MockWorker extends EventEmitter {
    readonly close = vi.fn(async (force?: boolean) => {
      bullMQMocks.closeOrder.push(`worker:${this.name}:${String(force)}`);
      bullMQMocks.onWorkerClose?.();
      this.emit('closed');
    });
    readonly resume = vi.fn(async () => undefined);
    readonly disconnect = vi.fn(async () => undefined);
    readonly connection = {
      disconnect: vi.fn(async () => undefined)
    };
    readonly blockingConnection = {
      disconnect: vi.fn(async () => undefined)
    };

    constructor(
      readonly name: string,
      readonly processor: unknown,
      readonly options: Record<string, unknown>
    ) {
      super();
      if (bullMQMocks.workerConstructorFailures > 0) {
        bullMQMocks.workerConstructorFailures -= 1;
        throw new Error('worker constructor failed');
      }
      bullMQMocks.workers.push(this);
    }
  }

  class MockFlowProducer extends EventEmitter {
    readonly close = vi.fn(async () => {
      bullMQMocks.closeOrder.push('flow-producer');
    });
    readonly disconnect = vi.fn(async () => undefined);
    readonly connection = {
      disconnect: vi.fn(async () => undefined)
    };

    constructor(readonly options: Record<string, unknown>) {
      super();
      if (bullMQMocks.flowProducerConstructorFailures > 0) {
        bullMQMocks.flowProducerConstructorFailures -= 1;
        throw new Error('flow producer constructor failed');
      }
      bullMQMocks.flowProducers.push(this);
    }
  }

  return {
    FlowProducer: MockFlowProducer,
    Queue: MockQueue,
    UnrecoverableError: class UnrecoverableError extends Error {},
    Worker: MockWorker
  };
});

const createRedisRuntimeMock = () =>
  ({
    registerBeforeCloseHook: vi.fn(() => vi.fn()),
    createQueueConnection: vi.fn(() => ({})),
    createWorkerConnection: vi.fn(() => ({})),
    releaseConnection: vi.fn(async () => undefined)
  }) as unknown as RedisRuntime;

const createBullMQRuntime = (options?: Partial<RedisBullMQRuntimeOptions>) => {
  const redisRuntime = options?.redisRuntime ?? createRedisRuntimeMock();
  const runtime = new RedisBullMQRuntime({
    redisRuntime,
    workerLifecycle: {
      restartOnClose: true,
      resumeOnPause: true
    },
    ...options
  });
  return { redisRuntime, runtime };
};

describe('RedisBullMQRuntime', () => {
  beforeEach(() => {
    bullMQMocks.queues.length = 0;
    bullMQMocks.flowProducers.length = 0;
    bullMQMocks.workers.length = 0;
    bullMQMocks.closeOrder.length = 0;
    bullMQMocks.queueConstructorFailures = 0;
    bullMQMocks.flowProducerConstructorFailures = 0;
    bullMQMocks.workerConstructorFailures = 0;
    bullMQMocks.onWorkerClose = undefined;
  });

  it('creates and reuses queues and workers by name', () => {
    const { runtime } = createBullMQRuntime();
    const processor = vi.fn();

    const queue = runtime.getQueue('datasetSync', { prefix: 'test' });
    const worker = runtime.getWorker('datasetSync', processor, { concurrency: 2 });

    expect(runtime.getQueue('datasetSync')).toBe(queue);
    expect(runtime.getWorker('datasetSync', processor)).toBe(worker);
    expect(bullMQMocks.queues[0]?.options).toMatchObject({ prefix: 'test' });
    expect(bullMQMocks.workers[0]?.options).toMatchObject({ concurrency: 2 });
  });

  it('creates and reuses one FlowProducer per Runtime', () => {
    const { redisRuntime, runtime } = createBullMQRuntime();

    const flowProducer = runtime.getFlowProducer();

    expect(runtime.getFlowProducer()).toBe(flowProducer);
    expect(bullMQMocks.flowProducers).toHaveLength(1);
    expect(redisRuntime.createQueueConnection).toHaveBeenCalledTimes(1);
  });

  it('releases the Runtime connection when a Queue or Worker constructor fails', async () => {
    const { redisRuntime, runtime } = createBullMQRuntime();
    bullMQMocks.queueConstructorFailures = 1;
    expect(() => runtime.getQueue('queue-failure')).toThrow('queue constructor failed');

    bullMQMocks.workerConstructorFailures = 1;
    expect(() => runtime.getWorker('worker-failure', vi.fn())).toThrow('worker constructor failed');

    bullMQMocks.flowProducerConstructorFailures = 1;
    expect(() => runtime.getFlowProducer()).toThrow('flow producer constructor failed');
    await Promise.resolve();

    expect(redisRuntime.releaseConnection).toHaveBeenCalledTimes(3);
  });

  it('registers the Redis hook and closes workers before queues', async () => {
    const { redisRuntime, runtime } = createBullMQRuntime();
    const processor = vi.fn();
    const queue = runtime.getQueue('datasetSync');
    runtime.getFlowProducer();
    const worker = runtime.getWorker('datasetSync', processor);
    const queueError = vi.fn();
    queue.on('error', queueError);

    expect(redisRuntime.registerBeforeCloseHook).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'bullmq', close: expect.any(Function) })
    );

    const closePromise = runtime.close();
    expect(runtime.close()).toBe(closePromise);
    await closePromise;

    expect(bullMQMocks.closeOrder).toEqual([
      'worker:datasetSync:true',
      'flow-producer',
      'queue:datasetSync'
    ]);
    expect(worker.listenerCount('error')).toBe(0);
    expect(queue.listenerCount('error')).toBe(1);
    expect(queue.listeners('error')).toContain(queueError);
    expect(runtime.getState()).toBe('closed');
    expect(() => runtime.getQueue('after-close')).toThrow('BullMQ runtime is closed');
  });

  it('runs the BullMQ before-close hook before Runtime closes its role connections', async () => {
    const clients: Array<RuntimeRedisClient> = [];

    class RuntimeRedisClient extends EventEmitter {
      status = 'ready';
      readonly options: object;
      readonly quit = vi.fn(async () => {
        bullMQMocks.closeOrder.push(`redis:${this.role}`);
        return 'OK';
      });
      readonly disconnect = vi.fn(() => undefined);
      readonly role: string;

      constructor(options: object, role: string) {
        super();
        this.options = options;
        this.role = role;
      }
    }

    const redisRuntime = new RedisRuntime({
      redisUrl: 'redis://localhost',
      clientFactory: (options) => {
        const role = clients.length === 0 ? 'queue' : clients.length === 1 ? 'flow' : 'worker';
        const client = new RuntimeRedisClient(options, role);
        clients.push(client);
        return client as unknown as RedisClient;
      }
    });
    const bullMQRuntime = new RedisBullMQRuntime({ redisRuntime });

    bullMQRuntime.getQueue('runtime-order');
    bullMQRuntime.getFlowProducer();
    bullMQRuntime.getWorker('runtime-order', vi.fn());

    await redisRuntime.close();

    expect(bullMQMocks.closeOrder).toEqual([
      'worker:runtime-order:true',
      'flow-producer',
      'queue:runtime-order',
      'redis:queue',
      'redis:flow',
      'redis:worker'
    ]);
    expect(bullMQRuntime.getState()).toBe('closed');
    clients.forEach((client) => {
      expect(client.quit).toHaveBeenCalledTimes(1);
    });
  });

  it('publishes the shutdown promise before resource close can re-enter shutdown', async () => {
    const { runtime } = createBullMQRuntime();
    runtime.getWorker('nested-close', vi.fn());
    let nestedClosePromise: Promise<void> | undefined;
    bullMQMocks.onWorkerClose = () => {
      nestedClosePromise = runtime.close();
    };

    const closePromise = runtime.close();
    await closePromise;

    expect(nestedClosePromise).toBe(closePromise);
    expect(bullMQMocks.closeOrder).toEqual(['worker:nested-close:true']);
  });

  it('still closes queues when worker manager shutdown reports an error', async () => {
    const { runtime } = createBullMQRuntime();
    runtime.getQueue('worker-close-error');
    const workerError = new Error('worker manager close failed');
    const workerManager = (runtime as unknown as { workerManager: { close: () => Promise<void> } })
      .workerManager;
    vi.spyOn(workerManager, 'close').mockRejectedValue(workerError);

    await expect(runtime.close()).rejects.toBe(workerError);

    expect(bullMQMocks.closeOrder).toEqual(['queue:worker-close-error']);
    expect(runtime.getState()).toBe('closed');
  });

  it('retries an unexpected worker close while the lifecycle policy is enabled', async () => {
    vi.useFakeTimers();
    try {
      const { redisRuntime, runtime } = createBullMQRuntime();
      const worker = runtime.getWorker('restart', vi.fn());
      bullMQMocks.workerConstructorFailures = 1;

      worker.emit('closed');
      await Promise.resolve();
      expect(bullMQMocks.workers).toHaveLength(1);
      expect(worker.listenerCount('closed')).toBe(0);
      expect(() => runtime.getWorker('restart', vi.fn())).toThrow(
        'BullMQ worker restart is restarting'
      );

      await vi.advanceTimersByTimeAsync(1_000);

      expect(bullMQMocks.workers).toHaveLength(2);
      expect(redisRuntime.releaseConnection).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('restores business listeners on a restarted worker without retaining adapter listeners', async () => {
    vi.useFakeTimers();
    try {
      const { runtime } = createBullMQRuntime();
      const worker = runtime.getWorker('listener-restart', vi.fn());
      const completed = vi.fn();
      const failed = vi.fn();
      const onceReady = vi.fn();
      worker.on('completed', completed);
      worker.on('failed', failed);
      worker.once('ready', onceReady);

      worker.emit('closed');
      await vi.advanceTimersByTimeAsync(1_000);

      const replacement = bullMQMocks.workers[1] as unknown as EventEmitter;
      expect(worker.listenerCount('closed')).toBe(0);
      expect(replacement.listenerCount('completed')).toBe(1);
      expect(replacement.listenerCount('failed')).toBe(1);
      expect(replacement.listenerCount('ready')).toBe(2);

      replacement.emit('completed', 'completed-job');
      replacement.emit('failed', 'failed-job');
      replacement.emit('ready');

      expect(completed).toHaveBeenCalledWith('completed-job');
      expect(failed).toHaveBeenCalledWith('failed-job');
      expect(onceReady).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not restart a worker after shutdown begins', async () => {
    const { runtime } = createBullMQRuntime();
    const worker = runtime.getWorker('shutdown', vi.fn());

    worker.emit('closed');
    await Promise.resolve();
    expect(bullMQMocks.workers).toHaveLength(2);

    const replacement = bullMQMocks.workers[1] as unknown as {
      emit: (event: string) => void;
    };
    const closePromise = runtime.close();
    replacement?.emit('closed');
    await closePromise;

    expect(bullMQMocks.workers).toHaveLength(2);
    expect(runtime.getState()).toBe('closed');
  });

  it('resumes a paused worker only while the runtime is running', async () => {
    vi.useFakeTimers();
    try {
      const { runtime } = createBullMQRuntime();
      const worker = runtime.getWorker('paused', vi.fn());
      worker.emit('paused');

      await vi.advanceTimersByTimeAsync(1_000);
      expect(worker.resume).toHaveBeenCalledTimes(1);

      await runtime.close();
      worker.emit('paused');
      await vi.advanceTimersByTimeAsync(1_000);
      expect(worker.resume).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('bounds worker and queue close operations', async () => {
    vi.useFakeTimers();
    try {
      const { runtime } = createBullMQRuntime({ closeTimeoutMs: 5_000 });
      const worker = runtime.getWorker('timeout', vi.fn()) as unknown as {
        close: ReturnType<typeof vi.fn>;
        disconnect: ReturnType<typeof vi.fn>;
        connection: { disconnect: ReturnType<typeof vi.fn> };
        blockingConnection: { disconnect: ReturnType<typeof vi.fn> };
      };
      const queue = runtime.getQueue('timeout') as unknown as {
        close: ReturnType<typeof vi.fn>;
        disconnect: ReturnType<typeof vi.fn>;
        connection: { disconnect: ReturnType<typeof vi.fn> };
      };
      worker.close.mockImplementationOnce(() => new Promise(() => undefined));
      queue.close.mockRejectedValueOnce(new Error('queue close failed'));

      const closePromise = runtime.close();
      await vi.advanceTimersByTimeAsync(5_000);
      await closePromise;

      expect(runtime.getState()).toBe('closed');
      expect(worker.connection.disconnect).toHaveBeenCalledWith(false);
      expect(worker.blockingConnection.disconnect).toHaveBeenCalledWith(false);
      expect(queue.connection.disconnect).toHaveBeenCalledWith(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('normalizes synchronous close errors through the same lifecycle guard', async () => {
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };
    const { runtime } = createBullMQRuntime({ logger });
    const worker = runtime.getWorker('sync-close-failure', vi.fn()) as unknown as {
      close: ReturnType<typeof vi.fn>;
    };
    const closeError = new Error('worker close failed synchronously');
    worker.close.mockImplementationOnce(() => {
      throw closeError;
    });

    await runtime.close();

    expect(logger.warn).toHaveBeenCalledWith('BullMQ worker close failed', {
      name: 'sync-close-failure',
      error: closeError
    });
    expect(runtime.getState()).toBe('closed');
  });
});

describe('getRedisBullMQRuntime', () => {
  it('reuses a process runtime and replaces it after close', async () => {
    const redisRuntime = createRedisRuntimeMock();
    const options = { redisRuntime };
    const runtime = getRedisBullMQRuntime(options);

    expect(getConfiguredRedisBullMQRuntime()).toBe(runtime);
    expect(getRedisBullMQRuntime(options)).toBe(runtime);

    await runtime.close();
    const replacement = getRedisBullMQRuntime(options);
    expect(replacement).not.toBe(runtime);
    await replacement.close();
  });

  it('rejects binding a second Redis Runtime while the current one is open', () => {
    const redisRuntime = createRedisRuntimeMock();
    const otherRedisRuntime = createRedisRuntimeMock();
    const runtime = getRedisBullMQRuntime({ redisRuntime });

    expect(() => getRedisBullMQRuntime({ redisRuntime: otherRedisRuntime })).toThrow(
      'BullMQ runtime is already bound to a different Redis runtime'
    );
    void runtime.close();
  });
});
