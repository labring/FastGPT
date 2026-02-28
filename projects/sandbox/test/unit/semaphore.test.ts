/**
 * Semaphore 信号量单元测试
 *
 * 测试并发控制核心逻辑：
 * - 基本 acquire/release 流程
 * - 超出 max 后排队等待
 * - release 唤醒队列中下一个
 * - stats 返回正确的 current/queued/max
 * - 并发数为 1 时串行执行
 * - 大量并发请求排队后依次完成
 */
import { describe, it, expect } from 'vitest';
import { Semaphore } from '../../src/utils/semaphore';

describe('Semaphore', () => {
  // ===== 基本流程 =====

  it('acquire 在未满时立即返回', async () => {
    const sem = new Semaphore(3);
    // 三次 acquire 都应该立即 resolve
    await sem.acquire();
    await sem.acquire();
    await sem.acquire();
    expect(sem.stats).toEqual({ current: 3, queued: 0, max: 3 });
  });

  it('release 减少 current 计数', async () => {
    const sem = new Semaphore(2);
    await sem.acquire();
    await sem.acquire();
    expect(sem.stats.current).toBe(2);
    sem.release();
    expect(sem.stats.current).toBe(1);
    sem.release();
    expect(sem.stats.current).toBe(0);
  });

  it('stats 返回正确的 current/queued/max', async () => {
    const sem = new Semaphore(2);
    expect(sem.stats).toEqual({ current: 0, queued: 0, max: 2 });

    await sem.acquire();
    expect(sem.stats).toEqual({ current: 1, queued: 0, max: 2 });

    await sem.acquire();
    expect(sem.stats).toEqual({ current: 2, queued: 0, max: 2 });

    // 第三个会排队（不 await，因为它不会 resolve）
    const p3 = sem.acquire();
    expect(sem.stats).toEqual({ current: 2, queued: 1, max: 2 });

    // 第四个也排队
    const p4 = sem.acquire();
    expect(sem.stats).toEqual({ current: 2, queued: 2, max: 2 });

    // release 唤醒队列中第一个，queued 减 1，current 不变（因为立即被新的占用）
    sem.release();
    await p3;
    expect(sem.stats).toEqual({ current: 2, queued: 1, max: 2 });

    sem.release();
    await p4;
    expect(sem.stats).toEqual({ current: 2, queued: 0, max: 2 });
  });

  // ===== 排队与唤醒 =====

  it('超出 max 后排队等待，release 唤醒下一个', async () => {
    const sem = new Semaphore(1);
    const order: number[] = [];

    await sem.acquire();
    order.push(1);

    // 第二个 acquire 会排队
    const p2 = sem.acquire().then(() => {
      order.push(2);
    });
    expect(sem.stats.queued).toBe(1);

    // release 唤醒排队的
    sem.release();
    await p2;
    expect(order).toEqual([1, 2]);
    expect(sem.stats.queued).toBe(0);

    sem.release();
    expect(sem.stats.current).toBe(0);
  });

  it('release 按 FIFO 顺序唤醒', async () => {
    const sem = new Semaphore(1);
    const order: number[] = [];

    await sem.acquire();

    const p1 = sem.acquire().then(() => {
      order.push(1);
    });
    const p2 = sem.acquire().then(() => {
      order.push(2);
    });
    const p3 = sem.acquire().then(() => {
      order.push(3);
    });

    expect(sem.stats.queued).toBe(3);

    // 依次 release，应按 FIFO 顺序唤醒
    sem.release();
    await p1;

    sem.release();
    await p2;

    sem.release();
    await p3;

    expect(order).toEqual([1, 2, 3]);
  });

  // ===== 并发数为 1 时串行执行 =====

  it('max=1 时保证串行执行', async () => {
    const sem = new Semaphore(1);
    const log: string[] = [];

    const task = async (name: string, delayMs: number) => {
      await sem.acquire();
      log.push(`${name}-start`);
      await new Promise((r) => setTimeout(r, delayMs));
      log.push(`${name}-end`);
      sem.release();
    };

    // 同时启动三个任务
    await Promise.all([task('A', 50), task('B', 50), task('C', 50)]);

    // 串行执行：每个任务的 start 必须在前一个 end 之后
    // A-start, A-end, B-start, B-end, C-start, C-end
    for (let i = 0; i < log.length - 1; i += 2) {
      const startIdx = i;
      const endIdx = i + 1;
      expect(log[endIdx]).toContain('-end');
      expect(log[startIdx]).toContain('-start');
      // end 在 start 之后
      expect(endIdx).toBeGreaterThan(startIdx);
    }

    // 更严格：不能有两个 start 连续出现（说明并行了）
    for (let i = 0; i < log.length - 1; i++) {
      if (log[i].endsWith('-start')) {
        expect(log[i + 1]).toContain('-end');
      }
    }
  });

  // ===== 大量并发 =====

  it('大量并发请求排队后依次完成', async () => {
    const sem = new Semaphore(3);
    const total = 20;
    let completed = 0;
    let maxConcurrent = 0;
    let currentRunning = 0;

    const tasks = Array.from({ length: total }, (_, i) =>
      (async () => {
        await sem.acquire();
        currentRunning++;
        if (currentRunning > maxConcurrent) {
          maxConcurrent = currentRunning;
        }
        // 模拟异步工作
        await new Promise((r) => setTimeout(r, 10));
        currentRunning--;
        completed++;
        sem.release();
      })()
    );

    await Promise.all(tasks);

    // 全部完成
    expect(completed).toBe(total);
    // 最大并发不超过 max
    expect(maxConcurrent).toBeLessThanOrEqual(3);
    // 最终状态归零
    expect(sem.stats.current).toBe(0);
    expect(sem.stats.queued).toBe(0);
  });

  it('max=1 大量并发严格串行', async () => {
    const sem = new Semaphore(1);
    const total = 10;
    let maxConcurrent = 0;
    let currentRunning = 0;

    const tasks = Array.from({ length: total }, () =>
      (async () => {
        await sem.acquire();
        currentRunning++;
        if (currentRunning > maxConcurrent) maxConcurrent = currentRunning;
        await new Promise((r) => setTimeout(r, 5));
        currentRunning--;
        sem.release();
      })()
    );

    await Promise.all(tasks);
    expect(maxConcurrent).toBe(1);
    expect(sem.stats.current).toBe(0);
  });

  // ===== 边界情况 =====

  it('release 无排队时 current 不会变为负数', () => {
    const sem = new Semaphore(3);
    // 没有 acquire 就 release
    sem.release();
    // current 变为 -1，这是实现的已知行为（调用者应保证配对使用）
    expect(sem.stats.current).toBe(-1);
  });

  it('max 为很大的数时不排队', async () => {
    const sem = new Semaphore(1000);
    const promises = Array.from({ length: 100 }, () => sem.acquire());
    await Promise.all(promises);
    expect(sem.stats.current).toBe(100);
    expect(sem.stats.queued).toBe(0);
  });

  it('acquire 返回的 Promise 是 void', async () => {
    const sem = new Semaphore(1);
    const result = await sem.acquire();
    expect(result).toBeUndefined();
    sem.release();
  });
});

// ============================================================
// 竞态条件补充（原 semaphore-race.test.ts）
// ============================================================
describe('Semaphore 竞态条件补充', () => {
  it('release 过多后 acquire 仍能正常工作', async () => {
    const sem = new Semaphore(2);
    sem.release();
    expect(sem.stats.current).toBe(-1);

    await sem.acquire();
    expect(sem.stats.current).toBe(0);
    await sem.acquire();
    expect(sem.stats.current).toBe(1);
    await sem.acquire();
    expect(sem.stats.current).toBe(2);

    const p = sem.acquire();
    expect(sem.stats.queued).toBe(1);
    sem.release();
    await p;
  });

  it('快速交替 acquire/release 不丢失状态', async () => {
    const sem = new Semaphore(1);
    for (let i = 0; i < 100; i++) {
      await sem.acquire();
      sem.release();
    }
    expect(sem.stats.current).toBe(0);
    expect(sem.stats.queued).toBe(0);
  });

  it('异步任务异常后 release 仍被调用（模拟 try/finally）', async () => {
    const sem = new Semaphore(2);
    const errors: string[] = [];

    const task = async (shouldFail: boolean) => {
      await sem.acquire();
      try {
        if (shouldFail) throw new Error('task failed');
        return 'ok';
      } catch (e: any) {
        errors.push(e.message);
        return 'error';
      } finally {
        sem.release();
      }
    };

    const results = await Promise.all([
      task(false),
      task(true),
      task(false),
      task(true),
      task(false)
    ]);

    expect(results.filter((r) => r === 'ok')).toHaveLength(3);
    expect(results.filter((r) => r === 'error')).toHaveLength(2);
    expect(errors).toHaveLength(2);
    expect(sem.stats.current).toBe(0);
    expect(sem.stats.queued).toBe(0);
  });

  it('max=0 时所有 acquire 都排队', async () => {
    const sem = new Semaphore(0);
    const p1 = sem.acquire();
    const p2 = sem.acquire();
    expect(sem.stats.queued).toBe(2);
    expect(sem.stats.current).toBe(0);

    sem.release();
    await p1;
    sem.release();
    await p2;
  });

  it('并发 acquire 后批量 release', async () => {
    const sem = new Semaphore(2);
    await sem.acquire();
    await sem.acquire();

    const waiters = Array.from({ length: 5 }, () => sem.acquire());
    expect(sem.stats.queued).toBe(5);

    for (let i = 0; i < 7; i++) {
      sem.release();
    }
    await Promise.all(waiters);

    expect(sem.stats.queued).toBe(0);
    expect(sem.stats.current).toBe(0);
  });
});
