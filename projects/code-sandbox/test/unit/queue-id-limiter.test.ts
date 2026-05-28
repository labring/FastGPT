import { describe, expect, it } from 'vitest';
import { QueueIdLimiter } from '../../src/utils/queue-id-limiter';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const flush = () => delay(0);

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('QueueIdLimiter', () => {
  it('未启用时不按 queueId 排队', async () => {
    const limiter = new QueueIdLimiter();
    let running = 0;
    let maxRunning = 0;

    await Promise.all(
      Array.from({ length: 3 }, () =>
        limiter.run('same-queue', async () => {
          running++;
          maxRunning = Math.max(maxRunning, running);
          await delay(10);
          running--;
        })
      )
    );

    expect(maxRunning).toBe(3);
    expect(limiter.stats).toMatchObject({
      enabled: false,
      queueCount: 0,
      queues: []
    });
  });

  it('同一个 queueId 超出并发后按 FIFO 排队', async () => {
    const limiter = new QueueIdLimiter(1);
    const firstGate = createDeferred();
    const secondGate = createDeferred();
    const order: string[] = [];

    const first = limiter.run('team-a', async () => {
      order.push('first-start');
      await firstGate.promise;
      order.push('first-end');
      return 'first';
    });
    await flush();

    const second = limiter.run('team-a', async () => {
      order.push('second-start');
      await secondGate.promise;
      order.push('second-end');
      return 'second';
    });

    const third = limiter.run('team-a', async () => {
      order.push('third-start');
      return 'third';
    });

    await flush();
    expect(order).toEqual(['first-start']);
    expect(limiter.stats.queues).toEqual([{ queueId: 'team-a', running: 1, queued: 2 }]);

    firstGate.resolve();
    await first;
    await flush();
    expect(order).toEqual(['first-start', 'first-end', 'second-start']);
    expect(limiter.stats.queues).toEqual([{ queueId: 'team-a', running: 1, queued: 1 }]);

    secondGate.resolve();
    await Promise.all([second, third]);

    expect(order).toEqual([
      'first-start',
      'first-end',
      'second-start',
      'second-end',
      'third-start'
    ]);
    expect(limiter.stats.queueCount).toBe(0);
  });

  it('不同 queueId 之间互不阻塞', async () => {
    const limiter = new QueueIdLimiter(1);
    const gate = createDeferred();
    const order: string[] = [];

    const first = limiter.run('team-a', async () => {
      order.push('team-a-start');
      await gate.promise;
    });
    await flush();

    await limiter.run('team-b', async () => {
      order.push('team-b-start');
    });

    expect(order).toEqual(['team-a-start', 'team-b-start']);
    gate.resolve();
    await first;
    expect(limiter.stats.queueCount).toBe(0);
  });

  it('queueId 为空时不排队', async () => {
    const limiter = new QueueIdLimiter(1);
    let running = 0;
    let maxRunning = 0;

    await Promise.all(
      Array.from({ length: 3 }, () =>
        limiter.run(undefined, async () => {
          running++;
          maxRunning = Math.max(maxRunning, running);
          await delay(10);
          running--;
        })
      )
    );

    expect(maxRunning).toBe(3);
    expect(limiter.stats.queueCount).toBe(0);
  });
});
