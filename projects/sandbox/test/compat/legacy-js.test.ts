/**
 * 旧版 JS 代码兼容性测试
 *
 * 验证新沙盒能正确执行旧版 FastGPT 生成的 JS 代码写法，包括：
 * - main(variables, {}) 两参数调用
 * - 全局 delay() / countToken() / strToBase64() / createHmac()
 * - console.log 捕获
 * - require 白名单模块（lodash, dayjs）
 * - 各种 main 函数签名
 */
import { describe, it, expect } from 'vitest';
import { JsRunner } from '../../src/runner/js-runner';

const runner = new JsRunner({
  defaultTimeoutMs: 10000,
  defaultMemoryMB: 64,
});

describe('旧版 JS 兼容性', () => {
  // ===== main 函数签名兼容 =====

  it('main(variables, {}) 两参数写法', async () => {
    const result = await runner.execute({
      code: `async function main(variables, extra) {
        return { name: variables.name, hasExtra: extra !== undefined };
      }`,
      variables: { name: 'FastGPT' }
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.name).toBe('FastGPT');
  });

  it('main({变量解构}) 写法', async () => {
    const result = await runner.execute({
      code: `async function main({ name, age }) {
        return { name, age };
      }`,
      variables: { name: 'test', age: 18 }
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn).toEqual({ name: 'test', age: 18 });
  });

  it('main() 无参数写法 — 通过闭包访问 variables', async () => {
    const result = await runner.execute({
      code: `async function main() {
        return { name: variables.name };
      }`,
      variables: { name: 'closure-test' }
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.name).toBe('closure-test');
  });

  it('非 async main 函数', async () => {
    const result = await runner.execute({
      code: `function main(v) {
        return { sum: v.a + v.b };
      }`,
      variables: { a: 10, b: 20 }
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.sum).toBe(30);
  });

  // ===== 全局内置函数兼容 =====

  it('全局 delay() 函数', async () => {
    const result = await runner.execute({
      code: `async function main() {
        const start = Date.now();
        await delay(100);
        return { elapsed: Date.now() - start };
      }`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.elapsed).toBeGreaterThanOrEqual(80);
  });

  it('全局 countToken() 函数', async () => {
    const result = await runner.execute({
      code: `async function main() {
        return { count: countToken("hello world test string") };
      }`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.count).toBeGreaterThan(0);
  });

  it('全局 strToBase64() 函数', async () => {
    const result = await runner.execute({
      code: `async function main() {
        return { b64: strToBase64("hello") };
      }`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.b64).toBe(Buffer.from('hello').toString('base64'));
  });

  it('全局 strToBase64() 带 prefix', async () => {
    const result = await runner.execute({
      code: `async function main() {
        return { b64: strToBase64("hello", "data:text/plain;base64,") };
      }`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.b64).toBe(
      'data:text/plain;base64,' + Buffer.from('hello').toString('base64')
    );
  });

  it('全局 createHmac() 函数', async () => {
    const result = await runner.execute({
      code: `async function main() {
        const r = createHmac("sha256", "my-secret");
        return { ts: r.timestamp, sign: r.sign };
      }`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.ts).toBeTruthy();
    expect(result.data?.codeReturn.sign).toBeTruthy();
  });

  // ===== console.log 兼容 =====

  it('console.log 被捕获到 log 字段', async () => {
    const result = await runner.execute({
      code: `async function main() {
        console.log("step 1");
        console.log("step 2", { key: "value" });
        return { done: true };
      }`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.log).toContain('step 1');
    expect(result.data?.log).toContain('step 2');
    expect(result.data?.log).toContain('key');
  });

  // ===== require 白名单模块 =====

  it('require lodash 正常使用', async () => {
    const result = await runner.execute({
      code: `async function main(v) {
        const _ = require('lodash');
        return { result: _.sum(v.arr) };
      }`,
      variables: { arr: [1, 2, 3, 4, 5] }
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.result).toBe(15);
  });

  it('require dayjs 正常使用', async () => {
    const result = await runner.execute({
      code: `async function main() {
        const dayjs = require('dayjs');
        return { valid: dayjs('2024-01-01').isValid() };
      }`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.valid).toBe(true);
  });

  it('require qs 正常使用', async () => {
    const result = await runner.execute({
      code: `async function main() {
        const qs = require('qs');
        return { str: qs.stringify({ a: 1, b: 2 }) };
      }`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.str).toBe('a=1&b=2');
  });

  // ===== 典型旧版代码模式 =====

  it('旧版典型写法：HTTP 请求签名', async () => {
    const result = await runner.execute({
      code: `async function main(variables, extra) {
        const hmacResult = createHmac("sha256", variables.secret);
        const token = strToBase64(variables.secret);
        return {
          timestamp: hmacResult.timestamp,
          sign: hmacResult.sign,
          token: token
        };
      }`,
      variables: { secret: 'my-webhook-secret' }
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.timestamp).toBeTruthy();
    expect(result.data?.codeReturn.sign).toBeTruthy();
    expect(result.data?.codeReturn.token).toBeTruthy();
  });

  it('旧版典型写法：数据处理 + lodash', async () => {
    const result = await runner.execute({
      code: `async function main(variables) {
        const _ = require('lodash');
        const items = variables.data;
        const grouped = _.groupBy(items, 'type');
        const counts = _.mapValues(grouped, arr => arr.length);
        return counts;
      }`,
      variables: {
        data: [
          { type: 'a', val: 1 },
          { type: 'b', val: 2 },
          { type: 'a', val: 3 }
        ]
      }
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn).toEqual({ a: 2, b: 1 });
  });

  it('旧版典型写法：字符串处理 + delay', async () => {
    const result = await runner.execute({
      code: `async function main(variables) {
        await delay(50);
        const count = countToken(variables.text);
        const encoded = strToBase64(variables.text);
        return { count, encoded, length: variables.text.length };
      }`,
      variables: { text: 'Hello FastGPT sandbox!' }
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.count).toBeGreaterThan(0);
    expect(result.data?.codeReturn.encoded).toBeTruthy();
    expect(result.data?.codeReturn.length).toBe(22);
  });

  it('返回非对象值（旧版可能返回数组）', async () => {
    const result = await runner.execute({
      code: `async function main(v) {
        return [v.a, v.b, v.a + v.b];
      }`,
      variables: { a: 1, b: 2 }
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn).toEqual([1, 2, 3]);
  });

  it('返回嵌套复杂对象', async () => {
    const result = await runner.execute({
      code: `async function main(v) {
        return {
          user: { name: v.name, tags: ['admin', 'user'] },
          meta: { count: 42, active: true }
        };
      }`,
      variables: { name: 'test' }
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.user.name).toBe('test');
    expect(result.data?.codeReturn.user.tags).toEqual(['admin', 'user']);
    expect(result.data?.codeReturn.meta.count).toBe(42);
  });
});
