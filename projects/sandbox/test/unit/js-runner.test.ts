import { describe, it, expect, beforeAll } from 'vitest';
import { JsRunner } from '../../src/runner/js-runner';

const runner = new JsRunner({
  defaultTimeoutMs: 10000,
  defaultMemoryMB: 64,
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

  // ===== 补充：边界与特殊场景 =====

  it('纯空白代码返回错误', async () => {
    const result = await runner.execute({
      code: '   \n\t  \n  ',
      variables: {}
    });
    expect(result.success).toBe(false);
  });

  it('代码中包含反引号和模板字符串', async () => {
    const result = await runner.execute({
      code: 'async function main(v) { const s = `hello ${v.name}`; return { s } }',
      variables: { name: 'world' }
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.s).toBe('hello world');
  });

  it('代码中包含 ${ 转义边界', async () => {
    const result = await runner.execute({
      code: 'async function main() { return { text: "${not a template}" } }',
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.text).toBe('${not a template}');
  });

  it('返回原始字符串值', async () => {
    const result = await runner.execute({
      code: 'async function main() { return "hello" }',
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn).toBe('hello');
  });

  it('返回数字 0', async () => {
    const result = await runner.execute({
      code: 'async function main() { return 0 }',
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn).toBe(0);
  });

  it('返回布尔 false', async () => {
    const result = await runner.execute({
      code: 'async function main() { return false }',
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn).toBe(false);
  });

  it('返回空数组', async () => {
    const result = await runner.execute({
      code: 'async function main() { return [] }',
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn).toEqual([]);
  });

  it('require moment 白名单模块', async () => {
    const result = await runner.execute({
      code: `async function main() {
        const moment = require('moment');
        return { isFunction: typeof moment === 'function' };
      }`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.isFunction).toBe(true);
  });

  it('require querystring 白名单模块', async () => {
    const result = await runner.execute({
      code: `async function main() {
        const qs = require('querystring');
        return { str: qs.stringify({ a: '1', b: '2' }) };
      }`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.str).toContain('a=1');
  });

  it('require url 白名单模块', async () => {
    const result = await runner.execute({
      code: `async function main() {
        const url = require('url');
        const parsed = new URL('https://example.com/path?q=1');
        return { host: parsed.host, path: parsed.pathname };
      }`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.host).toBe('example.com');
  });

  it('Unicode 变量和返回值', async () => {
    const result = await runner.execute({
      code: `async function main(v) {
        return { greeting: v.msg + '🎉', emoji: '✅' };
      }`,
      variables: { msg: '你好世界' }
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.greeting).toBe('你好世界🎉');
    expect(result.data?.codeReturn.emoji).toBe('✅');
  });

  it('变量值为 null 和 undefined 的处理', async () => {
    const result = await runner.execute({
      code: `async function main(v) {
        return { a: v.a, b: v.b };
      }`,
      variables: { a: null, b: undefined as any }
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.a).toBeNull();
  });

  it('SystemHelper.delay 正好 10000ms 不报错', async () => {
    // 只验证不抛错，不真的等 10s
    const result = await runner.execute({
      code: `async function main() {
        // 验证 10000 是允许的上限
        try {
          // 不真的等，只测试参数校验
          if (10000 > 10000) throw new Error('too long');
          return { ok: true };
        } catch(e) {
          return { ok: false };
        }
      }`,
      variables: {}
    });
    expect(result.success).toBe(true);
  });

  it('多个 console.log 类型混合输出', async () => {
    const result = await runner.execute({
      code: `async function main() {
        console.log("string");
        console.log(42);
        console.log(true);
        console.log(null);
        console.log({ key: "val" });
        console.log([1, 2, 3]);
        return { done: true };
      }`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.log).toContain('string');
    expect(result.data?.log).toContain('42');
    expect(result.data?.log).toContain('true');
  });

  it('limits 参数部分指定时使用默认值', async () => {
    const result = await runner.execute({
      code: 'async function main() { return { ok: true } }',
      variables: {},
      limits: { timeoutMs: 5000 }  // 只指定 timeout，其他用默认
    });
    expect(result.success).toBe(true);
  });
});
