import { describe, expect, it, beforeEach, vi } from 'vitest';

const bullMQMocks = vi.hoisted(() => ({
  queues: [] as any[],
  workers: [] as any[],
  closeOrder: [] as string[],
  workerConstructorFailures: 0,
  queueConstructorFailures: 0,
  onWorkerClose: undefined as (() => void) | undefined
}));

vi.unmock('@fastgpt/service/common/bullmq');
vi.mock('bullmq', async () => {
  const { EventEmitter } = await import('node:events');

  class MockQueue extends EventEmitter {
    readonly name: string;
    readonly options: Record<string, unknown>;
    readonly close = vi.fn(async () => {
      bullMQMocks.closeOrder.push(`queue:${this.name}`);
    });

    constructor(name: string, options: Record<string, unknown>) {
      super();
      if (bullMQMocks.queueConstructorFailures > 0) {
        bullMQMocks.queueConstructorFailures -= 1;
        throw new Error('queue constructor failed');
      }
      this.name = name;
      this.options = options;
      bullMQMocks.queues.push(this);
    }
  }

  class MockWorker extends EventEmitter {
    readonly name: string;
    readonly processor: unknown;
    readonly options: Record<string, unknown>;
    readonly close = vi.fn(async (force?: boolean) => {
      bullMQMocks.closeOrder.push(`worker:${this.name}:${String(force)}`);
      bullMQMocks.onWorkerClose?.();
      this.emit('closed');
    });
    readonly resume = vi.fn(async () => undefined);

    constructor(name: string, processor: unknown, options: Record<string, unknown>) {
      super();
      if (bullMQMocks.workerConstructorFailures > 0) {
        bullMQMocks.workerConstructorFailures -= 1;
        throw new Error('worker constructor failed');
      }
      this.name = name;
      this.processor = processor;
      this.options = options;
      bullMQMocks.workers.push(this);
    }
  }

  return {
    Queue: MockQueue,
    Worker: MockWorker,
    UnrecoverableError: class UnrecoverableError extends Error {}
  };
});

const createRuntimeMock = () => ({
  registerBeforeCloseHook: vi.fn(),
  createQueueConnection: vi.fn(() => ({})),
  createWorkerConnection: vi.fn(() => ({})),
  releaseConnection: vi.fn(async () => undefined)
});

describe('BullMQ runtime lifecycle', () => {
  let bullMQ: typeof import('@fastgpt/service/common/bullmq');

  beforeEach(async () => {
    vi.resetModules();
    bullMQMocks.queues.length = 0;
    bullMQMocks.workers.length = 0;
    bullMQMocks.closeOrder.length = 0;
    bullMQMocks.workerConstructorFailures = 0;
    bullMQMocks.queueConstructorFailures = 0;
    bullMQMocks.onWorkerClose = undefined;
    global.bullMQRuntimeContext = undefined;
    global.redisRuntime = createRuntimeMock() as any;
    bullMQ = await import('@fastgpt/service/common/bullmq');
  });

  it('reuses the process context and object pools after a module reload', async () => {
    const queue = bullMQ.getQueue(bullMQ.QueueNames.datasetDelete);
    const context = global.bullMQRuntimeContext;

    vi.resetModules();
    const reloadedBullMQ = await import('@fastgpt/service/common/bullmq');

    expect(global.bullMQRuntimeContext).toBe(context);
    expect(reloadedBullMQ.queues).toBe(context?.queues);
    expect(reloadedBullMQ.workers).toBe(context?.workers);
    expect(reloadedBullMQ.getQueue(reloadedBullMQ.QueueNames.datasetDelete)).toBe(queue);
  });

  it('releases the Runtime connection when a BullMQ constructor fails', async () => {
    const { getQueue, QueueNames } = bullMQ;
    bullMQMocks.queueConstructorFailures = 1;

    expect(() => getQueue(QueueNames.appDelete)).toThrow('queue constructor failed');
    await Promise.resolve();

    expect(global.redisRuntime?.releaseConnection).toHaveBeenCalledTimes(1);
    expect(bullMQ.queues.has(QueueNames.appDelete)).toBe(false);
  });

  it('registers a Redis before-close hook and closes workers before queues', async () => {
    const { closeBullMQConnections, getBullMQRuntimeState, getQueue, getWorker, QueueNames } =
      bullMQ;
    const processor = vi.fn();
    const queue = getQueue(QueueNames.datasetSync);
    const worker = getWorker(QueueNames.datasetSync, processor);
    queue.emit('error', new Error('queue event'));
    worker.emit('ready');
    worker.emit('error', new Error('worker event'));

    expect(getQueue(QueueNames.datasetSync)).toBe(queue);
    expect(getWorker(QueueNames.datasetSync, processor)).toBe(worker);
    expect(global.redisRuntime?.registerBeforeCloseHook).toHaveBeenCalledWith({
      name: 'bullmq',
      close: closeBullMQConnections
    });

    const closePromise = closeBullMQConnections();
    expect(closeBullMQConnections()).toBe(closePromise);
    await closePromise;

    expect(bullMQMocks.closeOrder).toEqual([
      `worker:${QueueNames.datasetSync}:true`,
      `queue:${QueueNames.datasetSync}`
    ]);
    expect(bullMQ.queues.size).toBe(0);
    expect(bullMQ.workers.size).toBe(0);
    expect(getBullMQRuntimeState()).toBe('closed');
    expect(() => getQueue(QueueNames.evaluation)).toThrow('BullMQ runtime is closed');
    expect(bullMQMocks.workers).toHaveLength(1);
  });

  it('publishes the shutdown promise before resource close can re-enter shutdown', async () => {
    const { closeBullMQConnections, getWorker, QueueNames } = bullMQ;
    getWorker(QueueNames.teamDelete, vi.fn());
    let nestedClosePromise: Promise<void> | undefined;
    bullMQMocks.onWorkerClose = () => {
      nestedClosePromise = closeBullMQConnections();
    };

    const closePromise = closeBullMQConnections();
    await closePromise;

    expect(nestedClosePromise).toBe(closePromise);
    expect(bullMQMocks.closeOrder).toEqual([`worker:${QueueNames.teamDelete}:true`]);
  });

  it('retries an unexpected worker restart while the adapter is running', async () => {
    vi.useFakeTimers();
    try {
      const { getWorker, QueueNames } = bullMQ;
      const worker = getWorker(QueueNames.collectionUpdate, vi.fn()) as any;
      bullMQMocks.workerConstructorFailures = 1;

      worker.emit('closed');
      await Promise.resolve();
      expect(bullMQMocks.workers).toHaveLength(1);

      await vi.advanceTimersByTimeAsync(1_000);

      expect(bullMQMocks.workers).toHaveLength(2);
      expect(bullMQ.workers.get(QueueNames.collectionUpdate)).toBe(bullMQMocks.workers[1]);
      expect(global.redisRuntime?.releaseConnection).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('restarts an unexpectedly closed worker only while the adapter is running', async () => {
    const { getWorker, QueueNames } = bullMQ;
    const worker = getWorker(QueueNames.evaluation, vi.fn()) as any;

    worker.emit('closed');
    await Promise.resolve();

    expect(bullMQMocks.workers).toHaveLength(2);
    const replacement = bullMQMocks.workers[1];
    expect(bullMQ.workers.get(QueueNames.evaluation)).toBe(replacement);

    global.bullMQRuntimeContext!.lifecycle = 'shutting-down';
    replacement.emit('closed');
    await Promise.resolve();

    expect(bullMQMocks.workers).toHaveLength(2);
    expect(bullMQ.workers.has(QueueNames.evaluation)).toBe(false);
  });

  it('resumes a paused worker only while the adapter remains running', async () => {
    const { getWorker, QueueNames } = bullMQ;
    vi.useFakeTimers();
    try {
      const worker = getWorker(QueueNames.s3FileDelete, vi.fn()) as any;
      worker.emit('paused');

      await vi.advanceTimersByTimeAsync(1_000);
      expect(worker.resume).toHaveBeenCalledTimes(1);

      global.bullMQRuntimeContext!.lifecycle = 'shutting-down';
      worker.emit('paused');

      await vi.advanceTimersByTimeAsync(1_000);

      expect(worker.resume).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('bounds resource close and completes shutdown when BullMQ close hangs', async () => {
    const { closeBullMQConnections, getBullMQRuntimeState, getQueue, getWorker, QueueNames } =
      bullMQ;
    vi.useFakeTimers();
    try {
      const worker = getWorker(QueueNames.agentSkillDelete, vi.fn()) as any;
      const queue = getQueue(QueueNames.agentSkillDelete) as any;
      worker.close.mockImplementationOnce(() => new Promise(() => undefined));
      queue.close.mockRejectedValueOnce(new Error('queue close failed'));

      const closePromise = closeBullMQConnections();
      await vi.advanceTimersByTimeAsync(5_000);
      await closePromise;

      expect(getBullMQRuntimeState()).toBe('closed');
      expect(bullMQ.queues.size).toBe(0);
      expect(bullMQ.workers.size).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
