/**
 * Semaphore 竞态条件补充测试
 *
 * 覆盖现有测试未触及的边界：
 * - release 过多后再 acquire 的行为
 * - 快速交替 acquire/release
 * - 异步任务中异常后 release 是否正确
 */
import { describe, it, expect } from 'vitest';
import { Semaphore } from '../../src/utils/semaphore';

describe('Semaphore 竞态条件补充', () => {
  it('release 过多后 acquire 仍能正常工作', async () => {
    const sem = new Semaphore(2);
    // 多 release 一次，current 变为 -1
    sem.release();
    expect(sem.stats.current).toBe(-1);

    // 后续 acquire 应该仍然正常（current 从 -1 开始递增）
    await sem.acquire();
    expect(sem.stats.current).toBe(0);
    await sem.acquire();
    expect(sem.stats.current).toBe(1);
    await sem.acquire();
    expect(sem.stats.current).toBe(2);

    // 第 4 次应该排队（因为 max=2，但 current 从 -1 开始多了一个名额）
    // 实际上 current=2 < max=2 不成立，所以会排队
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

    // 混合成功和失败的任务
    const results = await Promise.all([
      task(false),
      task(true),
      task(false),
      task(true),
      task(false),
    ]);

    expect(results.filter(r => r === 'ok')).toHaveLength(3);
    expect(results.filter(r => r === 'error')).toHaveLength(2);
    expect(errors).toHaveLength(2);
    // 所有许可都已释放
    expect(sem.stats.current).toBe(0);
    expect(sem.stats.queued).toBe(0);
  });

  it('max=0 时所有 acquire 都排队', async () => {
    const sem = new Semaphore(0);
    const p1 = sem.acquire();
    const p2 = sem.acquire();
    expect(sem.stats.queued).toBe(2);
    expect(sem.stats.current).toBe(0);

    // release 唤醒排队的
    sem.release();
    await p1;
    sem.release();
    await p2;
  });

  it('并发 acquire 后批量 release', async () => {
    const sem = new Semaphore(2);
    // 先占满
    await sem.acquire();
    await sem.acquire();

    // 5 个排队
    const waiters = Array.from({ length: 5 }, () => sem.acquire());
    expect(sem.stats.queued).toBe(5);

    // 批量 release
    for (let i = 0; i < 7; i++) {
      sem.release();
    }
    await Promise.all(waiters);

    expect(sem.stats.queued).toBe(0);
    expect(sem.stats.current).toBe(0);
  });
});
