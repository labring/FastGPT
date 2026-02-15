import { describe, it, expect } from 'vitest';
import { JsRunner } from '../../src/runner/js-runner';

const runner = new JsRunner({
  defaultTimeoutMs: 10000,
  defaultMemoryMB: 64,
  defaultDiskMB: 10
});

describe('JS Security', () => {
  it('阻止 require 非白名单模块 child_process', async () => {
    const result = await runner.execute({
      code: 'async function main() { require("child_process"); return {} }',
      variables: {}
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain('not allowed');
  });

  it('阻止 require fs 模块', async () => {
    const result = await runner.execute({
      code: 'async function main() { require("fs"); return {} }',
      variables: {}
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain('not allowed');
  });

  it('阻止 require net 模块', async () => {
    const result = await runner.execute({
      code: 'async function main() { require("net"); return {} }',
      variables: {}
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain('not allowed');
  });

  it('允许 require 白名单模块 lodash', async () => {
    const result = await runner.execute({
      code: `async function main() {
        const _ = require("lodash");
        return { isFunction: typeof _.isFunction === "function" };
      }`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.isFunction).toBe(true);
  });

  it('允许 require 白名单模块 dayjs', async () => {
    const result = await runner.execute({
      code: `async function main() {
        const dayjs = require("dayjs");
        return { isValid: dayjs().isValid() };
      }`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.isValid).toBe(true);
  });

  it('阻止原型链逃逸', async () => {
    const result = await runner.execute({
      code: `async function main() {
        const proto = Object.getPrototypeOf({});
        return { hasConstructor: !!proto.constructor };
      }`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.hasConstructor).toBe(false);
  });

  it('阻止 Bun.spawn', async () => {
    const result = await runner.execute({
      code: `async function main() {
        if (typeof Bun !== 'undefined' && Bun.spawn) {
          Bun.spawn(["ls"]);
        } else {
          throw new Error("Bun.spawn is blocked");
        }
        return {};
      }`,
      variables: {}
    });
    expect(result.success).toBe(false);
  });

  it('阻止 Bun.write', async () => {
    const result = await runner.execute({
      code: `async function main() {
        if (typeof Bun !== 'undefined' && Bun.write) {
          await Bun.write("/tmp/evil.txt", "hacked");
        } else {
          throw new Error("Bun.write is blocked");
        }
        return {};
      }`,
      variables: {}
    });
    expect(result.success).toBe(false);
  });

  it('阻止路径遍历 - 读取', async () => {
    const result = await runner.execute({
      code: `async function main() {
        SystemHelper.fs.readFile("../../etc/passwd");
        return {};
      }`,
      variables: {}
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain('traversal');
  });

  it('阻止路径遍历 - 写入', async () => {
    const result = await runner.execute({
      code: `async function main() {
        SystemHelper.fs.writeFile("../../../tmp/evil.txt", "hacked");
        return {};
      }`,
      variables: {}
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain('traversal');
  });

  it('阻止绝对路径访问', async () => {
    const result = await runner.execute({
      code: `async function main() {
        SystemHelper.fs.readFile("/etc/passwd");
        return {};
      }`,
      variables: {}
    });
    expect(result.success).toBe(false);
  });

  it('磁盘配额限制', async () => {
    const result = await runner.execute({
      code: `async function main() {
        const big = "x".repeat(20 * 1024 * 1024);
        SystemHelper.fs.writeFile("big.txt", big);
        return {};
      }`,
      variables: {},
      limits: { diskMB: 10 }
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain('quota');
  });

  it('delay 超过 10s 报错', async () => {
    const result = await runner.execute({
      code: `async function main() {
        await SystemHelper.delay(20000);
        return {};
      }`,
      variables: {}
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain('10000');
  });
});
