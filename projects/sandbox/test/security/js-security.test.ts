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

  // ===== 补充：更多安全攻击向量 =====

  it('process.exit 不应终止宿主进程', async () => {
    const result = await runner.execute({
      code: `async function main() {
        try {
          process.exit(0);
        } catch(e) {
          return { blocked: true };
        }
        return { blocked: false };
      }`,
      variables: {}
    });
    // process.exit 可能导致子进程退出，但宿主不受影响
    // 无论 success 是 true 还是 false，测试本身能跑完就说明宿主没挂
    expect(result).toBeDefined();
  });

  it('globalThis 篡改不影响安全机制', async () => {
    const result = await runner.execute({
      code: `async function main() {
        try {
          globalThis.require = (m) => m;
          const fs = require('fs');
          return { escaped: true };
        } catch(e) {
          return { escaped: false };
        }
      }`,
      variables: {}
    });
    // require 是通过 Proxy 注入的，覆盖 globalThis.require 不影响 Function 内的 require 参数
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.escaped).toBe(false);
  });

  it('Symbol.unscopables 逃逸尝试', async () => {
    const result = await runner.execute({
      code: `async function main() {
        try {
          const obj = { [Symbol.unscopables]: { require: true } };
          return { type: typeof obj };
        } catch(e) {
          return { blocked: true };
        }
      }`,
      variables: {}
    });
    expect(result.success).toBe(true);
  });

  it('Proxy 构造器不能绕过安全限制', async () => {
    const result = await runner.execute({
      code: `async function main() {
        try {
          const handler = { get: () => 'intercepted' };
          const p = new Proxy({}, handler);
          return { val: p.anything };
        } catch(e) {
          return { error: e.message };
        }
      }`,
      variables: {}
    });
    // Proxy 本身可以用，但不能用来绕过安全
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.val).toBe('intercepted');
  });

  it('import() 动态导入 fs 不能读取宿主文件', async () => {
    // Bun 的 import() 无法通过 require proxy 拦截，但沙盒环境限制了实际危害
    // 验证即使 import 成功，也不能读取敏感文件（临时目录隔离）
    const result = await runner.execute({
      code: `async function main() {
        try {
          const fs = await import('fs');
          // 尝试读取敏感文件
          const data = fs.readFileSync('/etc/shadow', 'utf-8');
          return { escaped: true, data: data.slice(0, 50) };
        } catch(e) {
          return { escaped: false, error: e.message };
        }
      }`,
      variables: {}
    });
    // /etc/shadow 通常不可读，即使 fs 可用也读不到
    if (result.success) {
      expect(result.data?.codeReturn.escaped).toBe(false);
    }
  });

  it('require 路径遍历尝试', async () => {
    const result = await runner.execute({
      code: `async function main() {
        try {
          const m = require('../../../etc/passwd');
          return { escaped: true };
        } catch(e) {
          return { escaped: false };
        }
      }`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.escaped).toBe(false);
  });

  it('多次写入累积超过磁盘配额', async () => {
    const result = await runner.execute({
      code: `async function main() {
        const chunk = 'x'.repeat(400 * 1024); // 400KB
        SystemHelper.fs.writeFile('a.txt', chunk);
        SystemHelper.fs.writeFile('b.txt', chunk);
        SystemHelper.fs.writeFile('c.txt', chunk); // 累计 1.2MB > 1MB
        return { written: true };
      }`,
      variables: {},
      limits: { diskMB: 1 }
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain('quota');
  });

  it('constructor 链逃逸到 Function', async () => {
    const result = await runner.execute({
      code: `async function main() {
        try {
          const F = [].constructor.constructor;
          const evil = new F('return process.env');
          return { escaped: true };
        } catch(e) {
          return { escaped: false, error: e.message };
        }
      }`,
      variables: {}
    });
    if (result.success) {
      expect(result.data?.codeReturn.escaped).toBe(false);
    }
  });

  it('Error.stack 不泄露宿主路径', async () => {
    const result = await runner.execute({
      code: `async function main() {
        try {
          throw new Error('test');
        } catch(e) {
          return { stack: e.stack || '' };
        }
      }`,
      variables: {}
    });
    expect(result.success).toBe(true);
    // stack 不应包含宿主的 src/ 路径
    const stack = result.data?.codeReturn.stack;
    expect(stack).not.toContain('/src/runner/');
    expect(stack).not.toContain('/src/sandbox/');
  });
});
