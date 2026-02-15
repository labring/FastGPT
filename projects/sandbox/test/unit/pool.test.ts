import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProcessPool } from '../../src/runner/pool';
import { spawn } from 'child_process';

describe('ProcessPool', () => {
  let pool: ProcessPool;

  afterEach(async () => {
    if (pool) {
      await pool.shutdown();
    }
  });

  it('创建时预热指定数量的进程', () => {
    pool = new ProcessPool(
      { poolSize: 2, maxIdleMs: 300000, maxRecycle: 50 },
      () => spawn('cat', [], { stdio: ['pipe', 'pipe', 'pipe'] })
    );
    expect(pool.stats.idle).toBe(2);
    expect(pool.stats.busy).toBe(0);
  });

  it('acquire 从池中取出进程', () => {
    pool = new ProcessPool(
      { poolSize: 2, maxIdleMs: 300000, maxRecycle: 50 },
      () => spawn('cat', [], { stdio: ['pipe', 'pipe', 'pipe'] })
    );
    const proc = pool.acquire();
    expect(proc).toBeDefined();
    expect(proc.isAlive()).toBe(true);
    expect(pool.stats.idle).toBe(1);
    expect(pool.stats.busy).toBe(1);
  });

  it('release 归还进程到池中', () => {
    pool = new ProcessPool(
      { poolSize: 2, maxIdleMs: 300000, maxRecycle: 50 },
      () => spawn('cat', [], { stdio: ['pipe', 'pipe', 'pipe'] })
    );
    const proc = pool.acquire();
    pool.release(proc);
    expect(pool.stats.busy).toBe(0);
    // 归还后 idle 应该恢复（可能是 2 或 3，取决于补充逻辑）
    expect(pool.stats.idle).toBeGreaterThanOrEqual(2);
  });

  it('池空时临时创建新进程', () => {
    pool = new ProcessPool(
      { poolSize: 1, maxIdleMs: 300000, maxRecycle: 50 },
      () => spawn('cat', [], { stdio: ['pipe', 'pipe', 'pipe'] })
    );
    const p1 = pool.acquire();
    const p2 = pool.acquire(); // 池空，临时创建
    expect(p1.isAlive()).toBe(true);
    expect(p2.isAlive()).toBe(true);
    expect(pool.stats.busy).toBe(2);
    pool.release(p1);
    pool.release(p2);
  });

  it('超过 maxRecycle 次数后销毁进程', () => {
    pool = new ProcessPool(
      { poolSize: 1, maxIdleMs: 300000, maxRecycle: 2 },
      () => spawn('cat', [], { stdio: ['pipe', 'pipe', 'pipe'] })
    );
    const p1 = pool.acquire();
    pool.release(p1); // useCount = 1
    const p2 = pool.acquire();
    pool.release(p2); // useCount = 2 → 达到 maxRecycle，销毁并补充
    expect(pool.stats.idle).toBeGreaterThanOrEqual(1);
  });

  it('shutdown 终止所有进程', async () => {
    pool = new ProcessPool(
      { poolSize: 3, maxIdleMs: 300000, maxRecycle: 50 },
      () => spawn('cat', [], { stdio: ['pipe', 'pipe', 'pipe'] })
    );
    const p1 = pool.acquire();
    await pool.shutdown();
    expect(pool.stats.idle).toBe(0);
    expect(pool.stats.busy).toBe(0);
  });
});
