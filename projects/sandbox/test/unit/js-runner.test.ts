import { describe, it, expect, beforeAll } from 'vitest';
import { JsRunner } from '../../src/runner/js-runner';

const runner = new JsRunner({
  defaultTimeoutMs: 10000,
  defaultMemoryMB: 64,
  defaultDiskMB: 10
});

describe('JsRunner', () => {
  it('执行基本代码并返回结果', async () => {
    const result = await runner.execute({
      code: 'async function main(v) { return { sum: v.a + v.b } }',
      variables: { a: 1, b: 2 }
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn).toEqual({ sum: 3 });
  });

  it('超时返回错误', async () => {
    const result = await runner.execute({
      code: 'async function main() { while(true){} }',
      variables: {},
      limits: { timeoutMs: 1000 }
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain('timed out');
  });

  it('空代码返回错误', async () => {
    const result = await runner.execute({
      code: '',
      variables: {}
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain('empty');
  });

  it('SystemHelper.countToken 可用', async () => {
    const result = await runner.execute({
      code: 'async function main() { return { count: SystemHelper.countToken("hello world") } }',
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.count).toBeGreaterThan(0);
  });

  it('SystemHelper.strToBase64 可用', async () => {
    const result = await runner.execute({
      code: `async function main() {
        return { b64: SystemHelper.strToBase64("hello", "prefix:") };
      }`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.b64).toBe('prefix:' + Buffer.from('hello').toString('base64'));
  });

  it('SystemHelper.createHmac 可用', async () => {
    const result = await runner.execute({
      code: `async function main() {
        const r = SystemHelper.createHmac("sha256", "secret");
        return { hasTimestamp: !!r.timestamp, hasSign: !!r.sign };
      }`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.hasTimestamp).toBe(true);
    expect(result.data?.codeReturn.hasSign).toBe(true);
  });

  it('SystemHelper.delay 可用', async () => {
    const result = await runner.execute({
      code: `async function main() {
        const start = Date.now();
        await SystemHelper.delay(100);
        return { elapsed: Date.now() - start };
      }`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.elapsed).toBeGreaterThanOrEqual(80);
  });

  it('SystemHelper.fs 临时文件读写', async () => {
    const result = await runner.execute({
      code: `async function main() {
        SystemHelper.fs.writeFile("test.txt", "hello sandbox");
        const content = SystemHelper.fs.readFile("test.txt");
        return { content };
      }`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.content).toBe('hello sandbox');
  });

  it('SystemHelper.fs.mkdir + readdir', async () => {
    const result = await runner.execute({
      code: `async function main() {
        SystemHelper.fs.mkdir("subdir");
        SystemHelper.fs.writeFile("subdir/a.txt", "aaa");
        const files = SystemHelper.fs.readdir("subdir");
        const exists = SystemHelper.fs.exists("subdir/a.txt");
        return { files, exists };
      }`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.files).toContain('a.txt');
    expect(result.data?.codeReturn.exists).toBe(true);
  });

  it('console.log 输出收集到 log', async () => {
    const result = await runner.execute({
      code: `async function main() {
        console.log("debug info");
        console.log("more", { key: "val" });
        return { ok: true };
      }`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.log).toContain('debug info');
    expect(result.data?.log).toContain('more');
  });

  it('向后兼容全局函数 countToken', async () => {
    const result = await runner.execute({
      code: 'async function main() { return { count: countToken("test") } }',
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.count).toBeGreaterThan(0);
  });

  it('变量正确传入', async () => {
    const result = await runner.execute({
      code: `async function main(v) {
        return { name: v.name, age: v.age, list: v.list };
      }`,
      variables: { name: 'test', age: 25, list: [1, 2, 3] }
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn).toEqual({ name: 'test', age: 25, list: [1, 2, 3] });
  });

  it('语法错误返回失败', async () => {
    const result = await runner.execute({
      code: 'async function main() { return {{{} }',
      variables: {}
    });
    expect(result.success).toBe(false);
  });

  it('运行时错误返回失败', async () => {
    const result = await runner.execute({
      code: `async function main() {
        throw new Error("custom error");
      }`,
      variables: {}
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain('custom error');
  });
});
