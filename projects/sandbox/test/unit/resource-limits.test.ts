/**
 * 资源限制测试
 *
 * 覆盖：
 * - 内存限制 ulimit（仅 Linux 生效，macOS 跳过）
 * - CPU 密集型超时（JS / Python）
 * - 运行时长限制（wall-clock timeout 验证）
 * - 网络请求限制（次数、请求体大小、响应大小）
 */
import { describe, it, expect, afterEach } from 'vitest';
import { ProcessPool } from '../../src/pool/process-pool';
import { PythonProcessPool } from '../../src/pool/python-process-pool';
import { config } from '../../src/config';
import { platform } from 'os';

const isLinux = platform() === 'linux';

// ============================================================
// 1. 内存限制（仅 Linux）
// ============================================================
describe.skipIf(!isLinux)('内存限制 (Linux only)', () => {
  let pool: ProcessPool;

  afterEach(async () => {
    try {
      await pool?.shutdown();
    } catch {}
  });

  it('JS 分配超大内存导致 worker 被 kill 后自动 respawn', async () => {
    pool = new ProcessPool(1);
    await pool.init();
    expect(pool.stats.total).toBe(1);

    // 尝试分配超过 maxMemoryMB 的内存
    const allocMB = config.maxMemoryMB + 100;
    const result = await pool.execute({
      code: `async function main() {
        const arr = [];
        for (let i = 0; i < ${allocMB}; i++) {
          arr.push(Buffer.alloc(1024 * 1024));
        }
        // 持有内存并等待，让内存轮询检测有机会发现超限
        await new Promise(r => setTimeout(r, 5000));
        return { allocated: arr.length };
      }`,
      variables: {}
    });
    expect(result.success).toBe(false);

    // 等 respawn
    await new Promise((r) => setTimeout(r, 2000));

    // 新 worker 应该可用
    const result2 = await pool.execute({
      code: `async function main() { return { recovered: true }; }`,
      variables: {}
    });
    expect(result2.success).toBe(true);
    expect(result2.data?.codeReturn.recovered).toBe(true);
  }, 30000);
});

describe.skipIf(!isLinux)('Python 内存限制 (Linux only)', () => {
  let pool: PythonProcessPool;

  afterEach(async () => {
    try {
      await pool?.shutdown();
    } catch {}
  });

  it('Python 分配超大内存导致 worker 被 kill 后自动 respawn', async () => {
    pool = new PythonProcessPool(1);
    await pool.init();
    expect(pool.stats.total).toBe(1);

    const allocMB = config.maxMemoryMB + 100;
    const result = await pool.execute({
      code: `def main():\n    data = bytearray(${allocMB} * 1024 * 1024)\n    return {'size': len(data)}`,
      variables: {}
    });
    expect(result.success).toBe(false);

    // 等 respawn
    await new Promise((r) => setTimeout(r, 2000));

    const result2 = await pool.execute({
      code: `def main():\n    return {'recovered': True}`,
      variables: {}
    });
    expect(result2.success).toBe(true);
    expect(result2.data?.codeReturn.recovered).toBe(true);
  }, 30000);
});

// ============================================================
// 2. CPU 限制
// ============================================================
describe('JS CPU 密集型超时', () => {
  let pool: ProcessPool;

  afterEach(async () => {
    try {
      await pool?.shutdown();
    } catch {}
  });

  it('纯计算死循环被超时终止', async () => {
    pool = new ProcessPool(1);
    await pool.init();

    const start = Date.now();
    const result = await pool.execute({
      code: `async function main() { while(true) { Math.random(); } }`,
      variables: {}
    });
    const elapsed = Date.now() - start;

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/timed out|timeout/i);
    // 应该在合理时间内被终止（超时 + 一些余量）
    expect(elapsed).toBeLessThan(30000);
  });

  it('CPU 密集型计算（大量数学运算）被超时终止', async () => {
    pool = new ProcessPool(1);
    await pool.init();

    const result = await pool.execute({
      code: `async function main() {
        let x = 0;
        while(true) {
          x += Math.sin(x) * Math.cos(x);
        }
      }`,
      variables: {}
    });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/timed out|timeout/i);
  });

  it('CPU 超时后 worker 恢复正常', async () => {
    pool = new ProcessPool(1);
    await pool.init();

    await pool.execute({
      code: `async function main() { while(true) {} }`,
      variables: {}
    });

    await new Promise((r) => setTimeout(r, 1500));

    const r2 = await pool.execute({
      code: `async function main() { return { ok: true }; }`,
      variables: {}
    });
    expect(r2.success).toBe(true);
  });
});

describe('Python CPU 密集型超时', () => {
  let pool: PythonProcessPool;

  afterEach(async () => {
    try {
      await pool?.shutdown();
    } catch {}
  });

  it('纯计算死循环被超时终止', async () => {
    pool = new PythonProcessPool(1);
    await pool.init();

    const start = Date.now();
    const result = await pool.execute({
      code: `import math\ndef main():\n    x = 0\n    while True:\n        x += math.sin(x) * math.cos(x)`,
      variables: {}
    });
    const elapsed = Date.now() - start;

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/timed out|timeout/i);
    expect(elapsed).toBeLessThan(30000);
  });

  it('CPU 超时后 worker 恢复正常', async () => {
    pool = new PythonProcessPool(1);
    await pool.init();

    await pool.execute({
      code: `def main():\n    while True:\n        pass`,
      variables: {}
    });

    await new Promise((r) => setTimeout(r, 2000));

    const r2 = await pool.execute({
      code: `def main():\n    return {'ok': True}`,
      variables: {}
    });
    expect(r2.success).toBe(true);
  });
});

// ============================================================
// 3. 运行时长限制（wall-clock timeout）
// ============================================================
describe('JS 运行时长限制', () => {
  let pool: ProcessPool;

  afterEach(async () => {
    try {
      await pool?.shutdown();
    } catch {}
  });

  it('sleep 超过 maxTimeoutMs 被终止', async () => {
    pool = new ProcessPool(1);
    await pool.init();

    const start = Date.now();
    const result = await pool.execute({
      code: `async function main() {
        await new Promise(r => setTimeout(r, ${config.maxTimeoutMs + 30000}));
        return { done: true };
      }`,
      variables: {}
    });
    const elapsed = Date.now() - start;

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/timed out|timeout/i);
    // 实际耗时应在 maxTimeoutMs 附近（加上 2s 余量），不会等到 sleep 结束
    expect(elapsed).toBeLessThan(config.maxTimeoutMs + 10000);
  });

  it('在超时范围内完成的代码正常返回', async () => {
    pool = new ProcessPool(1);
    await pool.init();

    const result = await pool.execute({
      code: `async function main() {
        await new Promise(r => setTimeout(r, 100));
        return { elapsed: true };
      }`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.elapsed).toBe(true);
  });

  it('delay() 超过 10s 上限被拒绝', async () => {
    pool = new ProcessPool(1);
    await pool.init();

    const result = await pool.execute({
      code: `async function main() {
        await delay(15000);
        return { done: true };
      }`,
      variables: {}
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain('10000');
  });
});

describe('Python 运行时长限制', () => {
  let pool: PythonProcessPool;

  afterEach(async () => {
    try {
      await pool?.shutdown();
    } catch {}
  });

  it('sleep 超过超时限制被终止', async () => {
    pool = new PythonProcessPool(1);
    await pool.init();

    const start = Date.now();
    const result = await pool.execute({
      code: `import time\ndef main():\n    time.sleep(${Math.ceil(config.maxTimeoutMs / 1000) + 30})\n    return {'done': True}`,
      variables: {}
    });
    const elapsed = Date.now() - start;

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/timed out|timeout/i);
    expect(elapsed).toBeLessThan(config.maxTimeoutMs + 10000);
  });

  it('在超时范围内完成的代码正常返回', async () => {
    pool = new PythonProcessPool(1);
    await pool.init();

    const result = await pool.execute({
      code: `import time\ndef main():\n    time.sleep(0.1)\n    return {'elapsed': True}`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.elapsed).toBe(true);
  });

  it('delay() 超过 10s 上限被拒绝', async () => {
    pool = new PythonProcessPool(1);
    await pool.init();

    const result = await pool.execute({
      code: `def main():\n    delay(15000)\n    return {'done': True}`,
      variables: {}
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// 4. 网络请求次数限制
// ============================================================
describe('JS 网络请求次数限制', () => {
  let pool: ProcessPool;

  afterEach(async () => {
    try {
      await pool?.shutdown();
    } catch {}
  });

  it(`第 maxRequests+1 次请求被拒绝（计数器验证）`, async () => {
    pool = new ProcessPool(1);
    await pool.init();

    // 快速消耗计数器：每次 httpRequest 调用会先 ++requestCount 再发起网络请求
    // 即使网络请求失败（DNS/连接），计数器也已递增
    // 为避免超时，用循环快速调用并 catch 所有错误，只关注 limit 错误
    const result = await pool.execute({
      code: `async function main() {
        let limitError = null;
        for (let i = 0; i < ${config.maxRequests + 1}; i++) {
          try {
            await httpRequest('http://0.0.0.0:1');
          } catch(e) {
            if (e.message.includes('limit') || e.message.includes('Limit')) {
              limitError = { idx: i, msg: e.message };
              break;
            }
          }
        }
        return { limitError };
      }`,
      variables: {}
    });
    expect(result.success).toBe(true);
    const le = result.data?.codeReturn.limitError;
    expect(le).not.toBeNull();
    expect(le.idx).toBe(config.maxRequests);
    expect(le.msg).toMatch(/limit/i);
  });

  it('请求计数每次执行重置', async () => {
    pool = new ProcessPool(1);
    await pool.init();

    // 第一次执行：消耗一些计数
    await pool.execute({
      code: `async function main() {
        for (let i = 0; i < 3; i++) {
          try { await httpRequest('http://0.0.0.0:1'); } catch(e) {}
        }
        return {};
      }`,
      variables: {}
    });

    // 第二次执行：计数应该重置，第一次请求不会触发 limit
    const r2 = await pool.execute({
      code: `async function main() {
        let limitHit = false;
        try { await httpRequest('http://0.0.0.0:1'); } catch(e) {
          if (e.message.includes('limit') || e.message.includes('Limit')) limitHit = true;
        }
        return { limitHit };
      }`,
      variables: {}
    });
    expect(r2.success).toBe(true);
    expect(r2.data?.codeReturn.limitHit).toBe(false);
  });
});

describe('Python 网络请求次数限制', () => {
  let pool: PythonProcessPool;

  afterEach(async () => {
    try {
      await pool?.shutdown();
    } catch {}
  });

  it(`第 maxRequests+1 次请求被拒绝（计数器验证）`, async () => {
    pool = new PythonProcessPool(1);
    await pool.init();

    const result = await pool.execute({
      code: `def main():\n    limit_error = None\n    for i in range(${config.maxRequests + 1}):\n        try:\n            http_request('http://0.0.0.0:1')\n        except Exception as e:\n            if 'limit' in str(e).lower():\n                limit_error = {'idx': i, 'msg': str(e)}\n                break\n    return {'limit_error': limit_error}`,
      variables: {}
    });
    expect(result.success).toBe(true);
    const le = result.data?.codeReturn.limit_error;
    expect(le).not.toBeNull();
    expect(le.idx).toBe(config.maxRequests);
    expect(le.msg.toLowerCase()).toContain('limit');
  });

  it('请求计数每次执行重置', async () => {
    pool = new PythonProcessPool(1);
    await pool.init();

    await pool.execute({
      code: `def main():\n    for i in range(3):\n        try:\n            http_request('http://0.0.0.0:1')\n        except:\n            pass\n    return {}`,
      variables: {}
    });

    const r2 = await pool.execute({
      code: `def main():\n    limit_hit = False\n    try:\n        http_request('http://0.0.0.0:1')\n    except Exception as e:\n        if 'limit' in str(e).lower():\n            limit_hit = True\n    return {'limit_hit': limit_hit}`,
      variables: {}
    });
    expect(r2.success).toBe(true);
    expect(r2.data?.codeReturn.limit_hit).toBe(false);
  });
});

// ============================================================
// 5. 网络请求大小限制
// ============================================================
describe('JS 请求体大小限制', () => {
  let pool: ProcessPool;

  afterEach(async () => {
    try {
      await pool?.shutdown();
    } catch {}
  });

  it('请求体超过 maxRequestBodySize 被拒绝', async () => {
    pool = new ProcessPool(1);
    await pool.init();

    // maxRequestBodySize 单位是 MB，生成超过限制的 body
    const sizeMB = config.maxRequestBodySize;
    const result = await pool.execute({
      code: `async function main() {
        const bigBody = 'x'.repeat(${sizeMB} * 1024 * 1024 + 1);
        try {
          await httpRequest('https://example.com', { method: 'POST', body: bigBody });
          return { blocked: false };
        } catch(e) {
          return { blocked: true, msg: e.message };
        }
      }`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.blocked).toBe(true);
    expect(result.data?.codeReturn.msg).toMatch(/body.*large|too large/i);
  });

  it('请求体在限制内正常发送（不因大小被拒）', async () => {
    pool = new ProcessPool(1);
    await pool.init();

    const result = await pool.execute({
      code: `async function main() {
        const smallBody = JSON.stringify({ data: 'hello' });
        try {
          await httpRequest('https://example.com', { method: 'POST', body: smallBody });
          return { sizeOk: true };
        } catch(e) {
          // 网络错误可以接受，但不应该是 body too large
          return { sizeOk: !e.message.includes('too large'), msg: e.message };
        }
      }`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.sizeOk).toBe(true);
  });
});

describe('Python 请求体大小限制', () => {
  let pool: PythonProcessPool;

  afterEach(async () => {
    try {
      await pool?.shutdown();
    } catch {}
  });

  it('请求体超过 maxRequestBodySize 被拒绝', async () => {
    pool = new PythonProcessPool(1);
    await pool.init();

    const sizeMB = config.maxRequestBodySize;
    const result = await pool.execute({
      code: `def main():\n    big_body = 'x' * (${sizeMB} * 1024 * 1024 + 1)\n    try:\n        http_request('https://example.com', method='POST', body=big_body)\n        return {'blocked': False}\n    except Exception as e:\n        return {'blocked': True, 'msg': str(e)}`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.blocked).toBe(true);
    expect(result.data?.codeReturn.msg).toMatch(/body.*large|too large/i);
  });

  it('请求体在限制内正常发送（不因大小被拒）', async () => {
    pool = new PythonProcessPool(1);
    await pool.init();

    const result = await pool.execute({
      code: `def main():\n    try:\n        http_request('https://example.com', method='POST', body='hello')\n        return {'size_ok': True}\n    except Exception as e:\n        return {'size_ok': 'too large' not in str(e).lower(), 'msg': str(e)}`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.size_ok).toBe(true);
  });
});

// ============================================================
// 6. 网络协议限制
// ============================================================
describe('JS 网络协议限制', () => {
  let pool: ProcessPool;

  afterEach(async () => {
    try {
      await pool?.shutdown();
    } catch {}
  });

  it('ftp:// 协议被拒绝', async () => {
    pool = new ProcessPool(1);
    await pool.init();

    const result = await pool.execute({
      code: `async function main() {
        try {
          await httpRequest('ftp://example.com/file');
          return { blocked: false };
        } catch(e) {
          return { blocked: true, msg: e.message };
        }
      }`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.blocked).toBe(true);
    expect(result.data?.codeReturn.msg).toMatch(/protocol/i);
  });

  it('file:// 协议被拒绝', async () => {
    pool = new ProcessPool(1);
    await pool.init();

    const result = await pool.execute({
      code: `async function main() {
        try {
          await httpRequest('file:///etc/passwd');
          return { blocked: false };
        } catch(e) {
          return { blocked: true, msg: e.message };
        }
      }`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.blocked).toBe(true);
  });
});

describe('Python 网络协议限制', () => {
  let pool: PythonProcessPool;

  afterEach(async () => {
    try {
      await pool?.shutdown();
    } catch {}
  });

  it('ftp:// 协议被拒绝', async () => {
    pool = new PythonProcessPool(1);
    await pool.init();

    const result = await pool.execute({
      code: `def main():\n    try:\n        http_request('ftp://example.com/file')\n        return {'blocked': False}\n    except Exception as e:\n        return {'blocked': True, 'msg': str(e)}`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.blocked).toBe(true);
    expect(result.data?.codeReturn.msg.toLowerCase()).toContain('protocol');
  });

  it('file:// 协议被拒绝', async () => {
    pool = new PythonProcessPool(1);
    await pool.init();

    const result = await pool.execute({
      code: `def main():\n    try:\n        http_request('file:///etc/passwd')\n        return {'blocked': False}\n    except Exception as e:\n        return {'blocked': True}`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.blocked).toBe(true);
  });
});
