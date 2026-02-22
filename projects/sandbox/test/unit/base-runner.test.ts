/**
 * SubprocessRunner 基类补充测试（迁移到进程池）
 *
 * 覆盖进程池中的代码路径：
 * - 并发控制实际效果（多个 execute 并发）
 * - JS 返回 undefined 序列化为 null
 * - code 参数校验
 * - limits 上限校验
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ProcessPool } from '../../src/pool/process-pool';
import { PythonProcessPool } from '../../src/pool/python-process-pool';

let jsPool: ProcessPool;
let pyPool: PythonProcessPool;
beforeAll(async () => {
  jsPool = new ProcessPool(1); await jsPool.init();
  pyPool = new PythonProcessPool(1); await pyPool.init();
});
afterAll(async () => {
  await jsPool.shutdown();
  await pyPool.shutdown();
});

describe('SubprocessRunner 基类逻辑', () => {

  // ===== JS undefined 返回值序列化 =====

  it('[Test] JS main 返回 undefined 序列化为 null', async () => {
    const result = await jsPool.execute({
      code: `async function main() { return undefined; }`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn).toBeNull();
  });

  it('[Test] JS main 无 return 语句序列化为 null', async () => {
    const result = await jsPool.execute({
      code: `async function main() { const x = 1; }`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn).toBeNull();
  });

  // ===== 并发控制实际效果 =====

  it('[Test] 多个 execute 并发调用都能正确完成', async () => {
    const promises = Array.from({ length: 5 }, (_, i) =>
      jsPool.execute({
        code: `async function main(v) { return { idx: v.idx }; }`,
        variables: { idx: i }
      })
    );
    const results = await Promise.all(promises);
    for (let i = 0; i < 5; i++) {
      expect(results[i].success).toBe(true);
      expect(results[i].data?.codeReturn.idx).toBe(i);
    }
  });

  it('[Test] JS 和 Python 混合并发执行', async () => {
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

  // ===== exitCode 非零路径 =====

  it('[Test] JS 进程非零退出码返回错误', async () => {
    const result = await jsPool.execute({
      code: `async function main() { process.exit(1); }`,
      variables: {}
    });
    expect(result.success).toBe(false);
  });

  // ===== code 参数校验 =====

  it('[Test] code 为非字符串类型返回错误', async () => {
    const result = await jsPool.execute({
      code: 123 as any,
      variables: {}
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain('empty');
  });

  it('[Test] code 为 null 返回错误', async () => {
    const result = await jsPool.execute({
      code: null as any,
      variables: {}
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain('empty');
  });

  // ===== limits 上限校验 =====

  it('[Test] limits 超过 maxTimeoutMs 被截断（不报错，正常执行）', async () => {
    const result = await jsPool.execute({
      code: `async function main() { return { ok: true }; }`,
      variables: {},
      limits: { timeoutMs: 999999 }
    });
    expect(result.success).toBe(true);
  });

  it('[Test] limits 超过 maxMemoryMB 被截断（正常执行）', async () => {
    const result = await jsPool.execute({
      code: `async function main() { return { ok: true }; }`,
      variables: {},
      limits: { memoryMB: 9999 }
    });
    expect(result.success).toBe(true);
  });
});
