import { describe, expect, it, vi } from 'vitest';
import { BullMQWorkerManager } from '../../redis/bullmq/worker-manager';

/** 只验证缓存命中时的并发同步，不创建真实 Worker，因此不依赖 Redis。 */
const createManager = () =>
  new BullMQWorkerManager({
    redisRuntime: {} as any,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any,
    closeTimeoutMs: 1_000,
    workerLifecycle: {} as any,
    getState: () => ({}) as any
  });

const createWorkerStub = (concurrency: number) => ({ concurrency }) as any;

describe('BullMQWorkerManager.getWorker', () => {
  it('applies a new concurrency to the cached worker instead of ignoring opts', () => {
    const manager = createManager();
    const worker = createWorkerStub(3);
    (manager as any).workers.set('evaluation', worker);

    const returned = manager.getWorker('evaluation', (async () => undefined) as any, {
      concurrency: 9
    });

    // 必须复用原实例：重建会打断在途任务，而并发本身支持原地调整
    expect(returned).toBe(worker);
    expect(worker.concurrency).toBe(9);
  });

  it('leaves the cached concurrency untouched when the caller does not pass one', () => {
    const manager = createManager();
    const worker = createWorkerStub(3);
    (manager as any).workers.set('evaluation', worker);

    const returned = manager.getWorker('evaluation', (async () => undefined) as any);

    expect(returned).toBe(worker);
    expect(worker.concurrency).toBe(3);
  });
});
