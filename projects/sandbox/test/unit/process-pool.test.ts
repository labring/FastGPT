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
    try {
      await pool?.shutdown();
    } catch {}
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
    try {
      await pool?.shutdown();
    } catch {}
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
    await new Promise((r) => setTimeout(r, 1500));

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
      variables: {}
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain('timed out');

    // 等 respawn
    await new Promise((r) => setTimeout(r, 1500));

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
    try {
      await pool?.shutdown();
    } catch {}
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
// JS ProcessPool - Worker Ping/Pong 健康检查
// ============================================================
describe('ProcessPool Worker 健康检查 (ping/pong)', () => {
  let pool: ProcessPool;

  afterEach(async () => {
    try {
      await pool?.shutdown();
    } catch {}
  });

  it('worker 正常响应 ping 后仍可执行任务', async () => {
    pool = new ProcessPool(1);
    await pool.init();

    // 先执行一个任务确认正常
    const r1 = await pool.execute({
      code: `async function main() { return { step: 1 }; }`,
      variables: {}
    });
    expect(r1.success).toBe(true);
    expect(r1.data?.codeReturn.step).toBe(1);

    // 触发健康检查（通过 triggerHealthCheck）
    (pool as any).pingWorker((pool as any).idleWorkers[0]);

    // 等 ping/pong 完成
    await new Promise((r) => setTimeout(r, 500));

    // 再执行一个任务确认 worker 没被误杀
    const r2 = await pool.execute({
      code: `async function main() { return { step: 2 }; }`,
      variables: {}
    });
    expect(r2.success).toBe(true);
    expect(r2.data?.codeReturn.step).toBe(2);
    expect(pool.stats.total).toBe(1);
  });

  it('连续多次 ping 不影响 worker 状态', async () => {
    pool = new ProcessPool(2);
    await pool.init();

    // 对所有 idle worker 连续 ping 3 次
    for (let i = 0; i < 3; i++) {
      for (const w of [...(pool as any).idleWorkers]) {
        (pool as any).pingWorker(w);
      }
      await new Promise((r) => setTimeout(r, 300));
    }

    // 所有 worker 应该还在
    expect(pool.stats.total).toBe(2);
    expect(pool.stats.idle).toBe(2);

    // 执行任务确认功能正常
    const result = await pool.execute({
      code: `async function main() { return { alive: true }; }`,
      variables: {}
    });
    expect(result.success).toBe(true);
  });
});

// ============================================================
// JS ProcessPool - shutdown reject waiters
// ============================================================
describe('ProcessPool shutdown reject waiters', () => {
  it('shutdown 后 waitQueue 中的请求被 reject', async () => {
    const pool = new ProcessPool(1);
    await pool.init();

    // 发起一个长时间运行的任务占住唯一 worker
    const p1 = pool.execute({
      code: `async function main() { await new Promise(r => setTimeout(r, 3000)); return { done: true }; }`,
      variables: {}
    });

    // 等一下确保 p1 已经拿到 worker
    await new Promise((r) => setTimeout(r, 200));

    // 发起第二个请求，它会进入 waitQueue
    const p2 = pool.execute({
      code: `async function main() { return { queued: true }; }`,
      variables: {}
    });

    // 确认有排队请求
    expect(pool.stats.queued).toBe(1);

    // shutdown 应该 reject waitQueue 中的请求
    await pool.shutdown();

    // p2 应该被 reject
    await expect(p2).rejects.toThrow('shutting down');

    // p1 可能成功也可能因 worker 被 kill 而失败，不关心
    await p1.catch(() => {});
  });
});

// ============================================================
// JS ProcessPool - 返回值序列化与参数校验（原 base-runner.test.ts）
// ============================================================
describe('ProcessPool 返回值序列化与参数校验', () => {
  let pool: ProcessPool;

  afterEach(async () => {
    try {
      await pool?.shutdown();
    } catch {}
  });

  it('JS main 返回 undefined 序列化为 null', async () => {
    pool = new ProcessPool(1);
    await pool.init();
    const result = await pool.execute({
      code: `async function main() { return undefined; }`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn).toBeNull();
  });

  it('JS main 无 return 语句序列化为 null', async () => {
    pool = new ProcessPool(1);
    await pool.init();
    const result = await pool.execute({
      code: `async function main() { const x = 1; }`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn).toBeNull();
  });

  it('code 为非字符串类型返回错误', async () => {
    pool = new ProcessPool(1);
    await pool.init();
    const result = await pool.execute({
      code: 123 as any,
      variables: {}
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain('empty');
  });

  it('code 为 null 返回错误', async () => {
    pool = new ProcessPool(1);
    await pool.init();
    const result = await pool.execute({
      code: null as any,
      variables: {}
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain('empty');
  });
});

// ============================================================
// JS + Python 混合并发（原 base-runner.test.ts）
// ============================================================
describe('JS + Python 混合并发', () => {
  let jsPool: ProcessPool;
  let pyPool: PythonProcessPool;

  afterEach(async () => {
    try {
      await jsPool?.shutdown();
      await pyPool?.shutdown();
    } catch {}
  });

  it('JS 和 Python 混合并发执行', async () => {
    jsPool = new ProcessPool(1);
    await jsPool.init();
    pyPool = new PythonProcessPool(1);
    await pyPool.init();

    const jsPromise = jsPool.execute({
      code: `async function main() { return { lang: 'js' }; }`,
      variables: {}
    });
    const pyPromise = pyPool.execute({
      code: `def main():\n    return {'lang': 'python'}`,
      variables: {}
    });
    const [jsResult, pyResult] = await Promise.all([jsPromise, pyPromise]);
    expect(jsResult.success).toBe(true);
    expect(jsResult.data?.codeReturn.lang).toBe('js');
    expect(pyResult.success).toBe(true);
    expect(pyResult.data?.codeReturn.lang).toBe('python');
  });
});

// ============================================================
// JS ProcessPool - 健康检查失败路径
// ============================================================
describe('ProcessPool 健康检查失败路径', () => {
  let pool: ProcessPool;

  afterEach(async () => {
    try {
      await pool?.shutdown();
    } catch {}
  });

  it('ping timeout: worker 不响应 pong 时被替换', async () => {
    pool = new ProcessPool(1);
    await pool.init();
    expect(pool.stats.total).toBe(1);

    const worker = (pool as any).idleWorkers[0];
    // 拦截 stdin.write 使 ping 消息不到达 worker（但不关闭 stdin），从而触发真正的 timeout
    const origWrite = worker.proc.stdin!.write.bind(worker.proc.stdin!);
    let interceptPing = true;
    worker.proc.stdin!.write = (...args: any[]) => {
      if (interceptPing) {
        interceptPing = false;
        return true; // 假装写成功但实际不发送
      }
      return origWrite(...args);
    };

    // 触发 ping
    (pool as any).pingWorker(worker);

    // 等待 HEALTH_CHECK_TIMEOUT (5s) + respawn
    await new Promise((r) => setTimeout(r, 8000));

    // worker 应该被替换，池仍然有 1 个 worker
    expect(pool.stats.total).toBe(1);

    // 新 worker 应该可用
    const result = await pool.execute({
      code: `async function main() { return { ok: true }; }`,
      variables: {}
    });
    expect(result.success).toBe(true);
  }, 15000);

  it('stdin not writable: worker stdin 关闭时被替换', async () => {
    pool = new ProcessPool(1);
    await pool.init();
    expect(pool.stats.total).toBe(1);

    const worker = (pool as any).idleWorkers[0];
    // 销毁 stdin 使其 writable = false
    worker.proc.stdin!.destroy();

    // 触发 ping
    (pool as any).pingWorker(worker);

    // 等 respawn
    await new Promise((r) => setTimeout(r, 3000));

    expect(pool.stats.total).toBe(1);

    const result = await pool.execute({
      code: `async function main() { return { replaced: true }; }`,
      variables: {}
    });
    expect(result.success).toBe(true);
  }, 10000);

  it('health check invalid response: worker 返回错误类型时被替换', async () => {
    pool = new ProcessPool(1);
    await pool.init();
    expect(pool.stats.total).toBe(1);

    const worker = (pool as any).idleWorkers[0];
    const origWrite = worker.proc.stdin!.write.bind(worker.proc.stdin!);
    let intercepted = false;
    worker.proc.stdin!.write = (...args: any[]) => {
      if (!intercepted) {
        intercepted = true;
        setTimeout(() => worker.rl.emit('line', JSON.stringify({ type: 'wrong' })), 50);
        return true;
      }
      return origWrite(...args);
    };

    (pool as any).pingWorker(worker);

    await new Promise((r) => setTimeout(r, 3000));

    expect(pool.stats.total).toBe(1);

    const result = await pool.execute({
      code: `async function main() { return { invalidResp: true }; }`,
      variables: {}
    });
    expect(result.success).toBe(true);
  }, 10000);

  it('returnToIdle with waiter: ping 期间有等待请求时直接分配', async () => {
    pool = new ProcessPool(1);
    await pool.init();

    const worker = (pool as any).idleWorkers[0];
    (pool as any).pingWorker(worker);

    // ping 期间 worker 不在 idle 中，新请求进入 waitQueue
    // ping 成功后 returnToIdle 检查 waitQueue 并直接分配
    const p1 = pool.execute({
      code: `async function main() { return { fromWaiter: true }; }`,
      variables: {}
    });

    const result = await p1;
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.fromWaiter).toBe(true);
  });

  it('health check parse error: worker 返回非 JSON 时被替换', async () => {
    pool = new ProcessPool(1);
    await pool.init();
    expect(pool.stats.total).toBe(1);

    const worker = (pool as any).idleWorkers[0];
    const origWrite = worker.proc.stdin!.write.bind(worker.proc.stdin!);
    let intercepted = false;
    worker.proc.stdin!.write = (...args: any[]) => {
      if (!intercepted) {
        intercepted = true;
        setTimeout(() => worker.rl.emit('line', 'not-json-at-all'), 50);
        return true;
      }
      return origWrite(...args);
    };

    (pool as any).pingWorker(worker);

    await new Promise((r) => setTimeout(r, 3000));

    expect(pool.stats.total).toBe(1);

    const result = await pool.execute({
      code: `async function main() { return { parseError: true }; }`,
      variables: {}
    });
    expect(result.success).toBe(true);
  }, 10000);

  it('health check write error: stdin.write 抛异常时被替换', async () => {
    pool = new ProcessPool(1);
    await pool.init();
    expect(pool.stats.total).toBe(1);

    const worker = (pool as any).idleWorkers[0];
    // 让 stdin.write 抛异常，但 writable 仍为 true
    worker.proc.stdin!.write = () => {
      throw new Error('mock write error');
    };

    (pool as any).pingWorker(worker);

    await new Promise((r) => setTimeout(r, 3000));

    expect(pool.stats.total).toBe(1);

    const result = await pool.execute({
      code: `async function main() { return { writeError: true }; }`,
      variables: {}
    });
    expect(result.success).toBe(true);
  }, 10000);

  it('returnToIdle with waiter: ping 成功后分配给等待中的请求', async () => {
    pool = new ProcessPool(1);
    await pool.init();

    // 发起一个长任务占住 worker
    const p1 = pool.execute({
      code: `async function main() { await new Promise(r => setTimeout(r, 1000)); return { first: true }; }`,
      variables: {}
    });

    // 等 p1 拿到 worker
    await new Promise((r) => setTimeout(r, 100));

    // 发起第二个请求，它会进入 waitQueue
    const p2 = pool.execute({
      code: `async function main() { return { second: true }; }`,
      variables: {}
    });

    // 确认有排队
    expect(pool.stats.queued).toBe(1);

    // 等 p1 完成，p2 应该自动被分配
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.success).toBe(true);
    expect(r1.data?.codeReturn.first).toBe(true);
    expect(r2.success).toBe(true);
    expect(r2.data?.codeReturn.second).toBe(true);
  });
});

// ============================================================
// Python PythonProcessPool - Worker Ping/Pong 健康检查
// ============================================================
describe('PythonProcessPool Worker 健康检查 (ping/pong)', () => {
  let pool: PythonProcessPool;

  afterEach(async () => {
    try {
      await pool?.shutdown();
    } catch {}
  });

  it('worker 正常响应 ping 后仍可执行任务', async () => {
    pool = new PythonProcessPool(1);
    await pool.init();

    const r1 = await pool.execute({
      code: `def main():\n    return {'step': 1}`,
      variables: {}
    });
    expect(r1.success).toBe(true);
    expect(r1.data?.codeReturn.step).toBe(1);

    // 触发 ping
    (pool as any).pingWorker((pool as any).idleWorkers[0]);
    await new Promise((r) => setTimeout(r, 500));

    const r2 = await pool.execute({
      code: `def main():\n    return {'step': 2}`,
      variables: {}
    });
    expect(r2.success).toBe(true);
    expect(r2.data?.codeReturn.step).toBe(2);
    expect(pool.stats.total).toBe(1);
  });

  it('连续多次 ping 不影响 worker 状态', async () => {
    pool = new PythonProcessPool(2);
    await pool.init();

    for (let i = 0; i < 3; i++) {
      for (const w of [...(pool as any).idleWorkers]) {
        (pool as any).pingWorker(w);
      }
      await new Promise((r) => setTimeout(r, 300));
    }

    expect(pool.stats.total).toBe(2);
    expect(pool.stats.idle).toBe(2);

    const result = await pool.execute({
      code: `def main():\n    return {'alive': True}`,
      variables: {}
    });
    expect(result.success).toBe(true);
  });
});

// ============================================================
// Python PythonProcessPool - 健康检查失败路径
// ============================================================
describe('PythonProcessPool 健康检查失败路径', () => {
  let pool: PythonProcessPool;

  afterEach(async () => {
    try {
      await pool?.shutdown();
    } catch {}
  });

  it('ping timeout: worker 不响应 pong 时被替换', async () => {
    pool = new PythonProcessPool(1);
    await pool.init();
    expect(pool.stats.total).toBe(1);

    const worker = (pool as any).idleWorkers[0];
    // 拦截 stdin.write 使 ping 不到达 worker，触发真正的 timeout
    const origWrite = worker.proc.stdin!.write.bind(worker.proc.stdin!);
    let interceptPing = true;
    worker.proc.stdin!.write = (...args: any[]) => {
      if (interceptPing) {
        interceptPing = false;
        return true;
      }
      return origWrite(...args);
    };

    (pool as any).pingWorker(worker);

    await new Promise((r) => setTimeout(r, 8000));

    expect(pool.stats.total).toBe(1);

    const result = await pool.execute({
      code: `def main():\n    return {'ok': True}`,
      variables: {}
    });
    expect(result.success).toBe(true);
  }, 15000);

  it('stdin not writable: worker stdin 关闭时被替换', async () => {
    pool = new PythonProcessPool(1);
    await pool.init();
    expect(pool.stats.total).toBe(1);

    const worker = (pool as any).idleWorkers[0];
    worker.proc.stdin!.destroy();

    (pool as any).pingWorker(worker);

    await new Promise((r) => setTimeout(r, 3000));

    expect(pool.stats.total).toBe(1);

    const result = await pool.execute({
      code: `def main():\n    return {'replaced': True}`,
      variables: {}
    });
    expect(result.success).toBe(true);
  }, 10000);

  it('health check invalid response: worker 返回错误类型时被替换', async () => {
    pool = new PythonProcessPool(1);
    await pool.init();
    expect(pool.stats.total).toBe(1);

    const worker = (pool as any).idleWorkers[0];
    const origWrite = worker.proc.stdin!.write.bind(worker.proc.stdin!);
    let intercepted = false;
    worker.proc.stdin!.write = (...args: any[]) => {
      if (!intercepted) {
        intercepted = true;
        setTimeout(() => worker.rl.emit('line', JSON.stringify({ type: 'wrong' })), 50);
        return true;
      }
      return origWrite(...args);
    };

    (pool as any).pingWorker(worker);

    await new Promise((r) => setTimeout(r, 3000));

    expect(pool.stats.total).toBe(1);

    const result = await pool.execute({
      code: `def main():\n    return {'invalidResp': True}`,
      variables: {}
    });
    expect(result.success).toBe(true);
  }, 10000);

  it('returnToIdle with waiter: ping 期间有等待请求时直接分配', async () => {
    pool = new PythonProcessPool(1);
    await pool.init();

    const worker = (pool as any).idleWorkers[0];
    (pool as any).pingWorker(worker);

    const p1 = pool.execute({
      code: `def main():\n    return {'fromWaiter': True}`,
      variables: {}
    });

    const result = await p1;
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.fromWaiter).toBe(true);
  });

  it('health check parse error: worker 返回非 JSON 时被替换', async () => {
    pool = new PythonProcessPool(1);
    await pool.init();
    expect(pool.stats.total).toBe(1);

    const worker = (pool as any).idleWorkers[0];
    const origWrite = worker.proc.stdin!.write.bind(worker.proc.stdin!);
    let intercepted = false;
    worker.proc.stdin!.write = (...args: any[]) => {
      if (!intercepted) {
        intercepted = true;
        setTimeout(() => worker.rl.emit('line', 'not-json'), 50);
        return true;
      }
      return origWrite(...args);
    };

    (pool as any).pingWorker(worker);

    await new Promise((r) => setTimeout(r, 3000));

    expect(pool.stats.total).toBe(1);

    const result = await pool.execute({
      code: `def main():\n    return {'parseError': True}`,
      variables: {}
    });
    expect(result.success).toBe(true);
  }, 10000);

  it('health check write error: stdin.write 抛异常时被替换', async () => {
    pool = new PythonProcessPool(1);
    await pool.init();
    expect(pool.stats.total).toBe(1);

    const worker = (pool as any).idleWorkers[0];
    worker.proc.stdin!.write = () => {
      throw new Error('mock write error');
    };

    (pool as any).pingWorker(worker);

    await new Promise((r) => setTimeout(r, 3000));

    expect(pool.stats.total).toBe(1);

    const result = await pool.execute({
      code: `def main():\n    return {'writeError': True}`,
      variables: {}
    });
    expect(result.success).toBe(true);
  }, 10000);
});

// ============================================================
// Python PythonProcessPool - shutdown reject waiters
// ============================================================
describe('PythonProcessPool shutdown reject waiters', () => {
  it('shutdown 后 waitQueue 中的请求被 reject', async () => {
    const pool = new PythonProcessPool(1);
    await pool.init();

    // 发起一个长时间运行的任务占住唯一 worker
    const p1 = pool.execute({
      code: `import time\ndef main():\n    time.sleep(3)\n    return {'done': True}`,
      variables: {}
    });

    // 等一下确保 p1 已经拿到 worker
    await new Promise((r) => setTimeout(r, 200));

    // 发起第二个请求，它会进入 waitQueue
    const p2 = pool.execute({
      code: `def main():\n    return {'queued': True}`,
      variables: {}
    });

    // 确认有排队请求
    expect(pool.stats.queued).toBe(1);

    // shutdown 应该 reject waitQueue 中的请求
    await pool.shutdown();

    // p2 应该被 reject
    await expect(p2).rejects.toThrow('shutting down');

    // p1 可能成功也可能因 worker 被 kill 而失败，不关心
    await p1.catch(() => {});
  });
});

// ============================================================
// Python PythonProcessPool
// ============================================================
describe('PythonProcessPool 生命周期', () => {
  let pool: PythonProcessPool;

  afterEach(async () => {
    try {
      await pool?.shutdown();
    } catch {}
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
    try {
      await pool?.shutdown();
    } catch {}
  });

  it('超时后 worker 被 kill 并 respawn', async () => {
    pool = new PythonProcessPool(1);
    await pool.init();

    const result = await pool.execute({
      code: `def main():\n    while True:\n        pass`,
      variables: {}
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain('timed out');

    // 等 respawn
    await new Promise((r) => setTimeout(r, 2000));

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
    try {
      await pool?.shutdown();
    } catch {}
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
