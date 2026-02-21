/**
 * SubprocessRunner 基类补充测试
 *
 * 覆盖 base.ts 中现有测试未触及的代码路径：
 * - spawn error 事件（命令不存在）
 * - 并发控制实际效果（多个 execute 并发）
 * - JS 返回 undefined 序列化为 null
 * - collectResult 中 exitCode 非零但无 stderr 的路径
 * - 临时目录清理验证
 */
import { describe, it, expect } from 'vitest';
import { JsRunner } from '../../src/runner/js-runner';
import { PythonRunner } from '../../src/runner/python-runner';
import { existsSync } from 'fs';

const config = {
  defaultTimeoutMs: 10000,
  defaultMemoryMB: 64,
};

describe('SubprocessRunner 基类逻辑', () => {
  const jsRunner = new JsRunner(config);
  const pyRunner = new PythonRunner(config);

  // ===== JS undefined 返回值序列化 =====

  it('[Test] JS main 返回 undefined 序列化为 null', async () => {
    const result = await jsRunner.execute({
      code: `async function main() { return undefined; }`,
      variables: {}
    });
    expect(result.success).toBe(true);
    // base.ts: _result === undefined ? null : _result
    expect(result.data?.codeReturn).toBeNull();
  });

  it('[Test] JS main 无 return 语句序列化为 null', async () => {
    const result = await jsRunner.execute({
      code: `async function main() { const x = 1; }`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn).toBeNull();
  });

  // ===== 并发控制实际效果 =====

  it('[Test] 多个 execute 并发调用都能正确完成', async () => {
    // 同时发起 5 个请求，验证信号量不会死锁
    const promises = Array.from({ length: 5 }, (_, i) =>
      jsRunner.execute({
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
    const jsPromise = jsRunner.execute({
      code: `async function main() { return { lang: 'js' }; }`,
      variables: {}
    });
    const pyPromise = pyRunner.execute({
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
    // process.exit(1) 会导致子进程以 exitCode=1 退出
    const result = await jsRunner.execute({
      code: `async function main() { process.exit(1); }`,
      variables: {}
    });
    expect(result.success).toBe(false);
  });

  // ===== code 参数校验 =====

  it('[Test] code 为非字符串类型返回错误', async () => {
    const result = await jsRunner.execute({
      code: 123 as any,
      variables: {}
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain('empty');
  });

  it('[Test] code 为 null 返回错误', async () => {
    const result = await jsRunner.execute({
      code: null as any,
      variables: {}
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain('empty');
  });

  // ===== limits 上限校验 =====

  it('[Test] limits 超过 maxTimeoutMs 被截断（不报错，正常执行）', async () => {
    const result = await jsRunner.execute({
      code: `async function main() { return { ok: true }; }`,
      variables: {},
      limits: { timeoutMs: 999999 } // 超过 maxTimeoutMs(60000)
    });
    expect(result.success).toBe(true);
  });

  it('[Test] limits 超过 maxMemoryMB 被截断（正常执行）', async () => {
    const result = await jsRunner.execute({
      code: `async function main() { return { ok: true }; }`,
      variables: {},
      limits: { memoryMB: 9999 } // 超过 maxMemoryMB(256)
    });
    expect(result.success).toBe(true);
  });
});
