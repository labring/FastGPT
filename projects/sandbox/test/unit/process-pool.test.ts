/**
 * ProcessPool / PythonProcessPool 单元测试
 *
 * 覆盖进程池核心逻辑：
 * - 生命周期（init / shutdown / stats）
 * - Worker 崩溃自动恢复（respawn）
 * - 池满排队行为
 * - 并发正确性
 * - shutdown 后行为
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProcessPool } from '../../src/pool/process-pool';
import { PythonProcessPool } from '../../src/pool/python-process-pool';

// ============================================================
// JS ProcessPool
// ============================================================
describe('ProcessPool 生命周期', () => {
  let pool: ProcessPool;

  afterEach(async () => {
    try { await pool?.shutdown(); } catch {}
  });

  it('init 后 stats 正确', async () => {
    pool = new ProcessPool(2);
    await pool.init();
    const s = pool.stats;
    expect(s.total).toBe(2);
    expect(s.idle).toBe(2);
    expect(s.busy).toBe(0);
    expect(s.queued).toBe(0);
    expect(s.poolSize).toBe(2);
  });

  it('shutdown 后 stats 归零', async () => {
    pool = new ProcessPool(2);
    await pool.init();
    await pool.shutdown();
    const s = pool.stats;
    expect(s.total).toBe(0);
    expect(s.idle).toBe(0);
    expect(s.busy).toBe(0);
  });

  it('execute 后 worker 归还到 idle', async () => {
    pool = new ProcessPool(1);
    await pool.init();
    await pool.execute({
      code: `async function main() { return { ok: true }; }`,
      variables: {}
    });
    const s = pool.stats;
    expect(s.idle).toBe(1);
    expect(s.busy).toBe(0);
  });
});

describe('ProcessPool Worker 恢复', () => {
  let pool: ProcessPool;

  afterEach(async () => {
    try { await pool?.shutdown(); } catch {}
  });

  it('worker 崩溃后自动 respawn，后续请求正常', async () => {
    pool = new ProcessPool(1);
    await pool.init();
    expect(pool.stats.total).toBe(1);

    // 让 worker 崩溃（process.exit）
    const result = await pool.execute({
      code: `async function main() { process.exit(1); }`,
      variables: {}
    });
    expect(result.success).toBe(false);

    // 等 respawn 完成
    await new Promise(r => setTimeout(r, 1500));

    // 新 worker 应该可用
    const result2 = await pool.execute({
      code: `async function main() { return { recovered: true }; }`,
      variables: {}
    });
    expect(result2.success).toBe(true);
    expect(result2.data?.codeReturn.recovered).toBe(true);
  });

  it('超时后 worker 被 kill 并 respawn', async () => {
    pool = new ProcessPool(1);
    await pool.init();

    const result = await pool.execute({
      code: `async function main() { while(true) {} }`,
      variables: {},
      limits: { timeoutMs: 500 }
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain('timed out');

    // 等 respawn
    await new Promise(r => setTimeout(r, 1500));

    const result2 = await pool.execute({
      code: `async function main() { return { ok: true }; }`,
      variables: {}
    });
    expect(result2.success).toBe(true);
  });
});

describe('ProcessPool 并发与排队', () => {
  let pool: ProcessPool;

  afterEach(async () => {
    try { await pool?.shutdown(); } catch {}
  });

  it('pool size=2，3 个并发请求，1 个排队', async () => {
    pool = new ProcessPool(2);
    await pool.init();

    // 3 个并发，每个 sleep 200ms
    const promises = Array.from({ length: 3 }, (_, i) =>
      pool.execute({
        code: `async function main(v) { await new Promise(r => setTimeout(r, 200)); return { idx: v.idx }; }`,
        variables: { idx: i }
      })
    );

    const results = await Promise.all(promises);
    for (let i = 0; i < 3; i++) {
      expect(results[i].success).toBe(true);
      expect(results[i].data?.codeReturn.idx).toBe(i);
    }
  });

  it('pool size=1，10 个并发请求全部正确完成（串行排队）', async () => {
    pool = new ProcessPool(1);
    await pool.init();

    const promises = Array.from({ length: 10 }, (_, i) =>
      pool.execute({
        code: `async function main(v) { return { n: v.n * 2 }; }`,
        variables: { n: i }
      })
    );

    const results = await Promise.all(promises);
    for (let i = 0; i < 10; i++) {
      expect(results[i].success).toBe(true);
      expect(results[i].data?.codeReturn.n).toBe(i * 2);
    }
  });

  it('pool size=2，并发中 1 个崩溃不影响其他请求', async () => {
    pool = new ProcessPool(2);
    await pool.init();

    const p1 = pool.execute({
      code: `async function main() { process.exit(1); }`,
      variables: {}
    });
    const p2 = pool.execute({
      code: `async function main() { return { ok: true }; }`,
      variables: {}
    });

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.success).toBe(false);
    expect(r2.success).toBe(true);
    expect(r2.data?.codeReturn.ok).toBe(true);
  });
});

// ============================================================
// Python PythonProcessPool
// ============================================================
describe('PythonProcessPool 生命周期', () => {
  let pool: PythonProcessPool;

  afterEach(async () => {
    try { await pool?.shutdown(); } catch {}
  });

  it('init 后 stats 正确', async () => {
    pool = new PythonProcessPool(2);
    await pool.init();
    const s = pool.stats;
    expect(s.total).toBe(2);
    expect(s.idle).toBe(2);
    expect(s.busy).toBe(0);
    expect(s.queued).toBe(0);
    expect(s.poolSize).toBe(2);
  });

  it('shutdown 后 stats 归零', async () => {
    pool = new PythonProcessPool(2);
    await pool.init();
    await pool.shutdown();
    const s = pool.stats;
    expect(s.total).toBe(0);
    expect(s.idle).toBe(0);
    expect(s.busy).toBe(0);
  });

  it('execute 后 worker 归还到 idle', async () => {
    pool = new PythonProcessPool(1);
    await pool.init();
    await pool.execute({
      code: `def main():\n    return {'ok': True}`,
      variables: {}
    });
    const s = pool.stats;
    expect(s.idle).toBe(1);
    expect(s.busy).toBe(0);
  });
});

describe('PythonProcessPool Worker 恢复', () => {
  let pool: PythonProcessPool;

  afterEach(async () => {
    try { await pool?.shutdown(); } catch {}
  });

  it('超时后 worker 被 kill 并 respawn', async () => {
    pool = new PythonProcessPool(1);
    await pool.init();

    const result = await pool.execute({
      code: `import time\ndef main():\n    time.sleep(60)\n    return {}`,
      variables: {},
      limits: { timeoutMs: 500 }
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain('timed out');

    // 等 respawn
    await new Promise(r => setTimeout(r, 2000));

    const result2 = await pool.execute({
      code: `def main():\n    return {'ok': True}`,
      variables: {}
    });
    expect(result2.success).toBe(true);
  });
});

describe('PythonProcessPool 并发与排队', () => {
  let pool: PythonProcessPool;

  afterEach(async () => {
    try { await pool?.shutdown(); } catch {}
  });

  it('pool size=2，3 个并发请求，1 个排队', async () => {
    pool = new PythonProcessPool(2);
    await pool.init();

    const promises = Array.from({ length: 3 }, (_, i) =>
      pool.execute({
        code: `import time\ndef main(variables):\n    time.sleep(0.2)\n    return {'idx': variables['idx']}`,
        variables: { idx: i }
      })
    );

    const results = await Promise.all(promises);
    for (let i = 0; i < 3; i++) {
      expect(results[i].success).toBe(true);
      expect(results[i].data?.codeReturn.idx).toBe(i);
    }
  });

  it('pool size=1，10 个并发请求全部正确完成（串行排队）', async () => {
    pool = new PythonProcessPool(1);
    await pool.init();

    const promises = Array.from({ length: 10 }, (_, i) =>
      pool.execute({
        code: `def main(variables):\n    return {'n': variables['n'] * 2}`,
        variables: { n: i }
      })
    );

    const results = await Promise.all(promises);
    for (let i = 0; i < 10; i++) {
      expect(results[i].success).toBe(true);
      expect(results[i].data?.codeReturn.n).toBe(i * 2);
    }
  });
});
