import { describe, it, expect, beforeAll } from 'vitest';
import { JsRunner } from '../../src/runner/js-runner';
import { PythonRunner } from '../../src/runner/python-runner';
import type { RunnerConfig } from '../../src/types';

const config: RunnerConfig = {
  defaultTimeoutMs: 10000,
  defaultMemoryMB: 64,
  defaultDiskMB: 10
};

const strictConfig: RunnerConfig = {
  defaultTimeoutMs: 3000,
  defaultMemoryMB: 32,
  defaultDiskMB: 1
};

describe('边界测试 - JS', () => {
  let runner: JsRunner;
  let strictRunner: JsRunner;
  beforeAll(() => {
    runner = new JsRunner(config);
    strictRunner = new JsRunner(strictConfig);
  });

  // ===== 空/错误代码 =====

  it('空代码（无 main 函数）', async () => {
    const result = await runner.execute({ code: '', variables: {} });
    expect(result.success).toBe(false);
  });

  it('语法错误', async () => {
    const result = await runner.execute({
      code: `function main( { return {}; }`,
      variables: {}
    });
    expect(result.success).toBe(false);
  });

  it('运行时异常', async () => {
    const result = await runner.execute({
      code: `async function main() {
        throw new Error('test error');
      }`,
      variables: {}
    });
    expect(result.success).toBe(false);
    expect(result.data?.codeReturn?.error || result.message).toMatch(/test error/);
  });

  it('main 不是函数', async () => {
    const result = await runner.execute({
      code: `const main = 42;`,
      variables: {}
    });
    expect(result.success).toBe(false);
  });

  it('main 返回 undefined', async () => {
    const result = await runner.execute({
      code: `async function main() { }`,
      variables: {}
    });
    expect(result.success).toBe(true);
  });

  it('main 返回 null', async () => {
    const result = await runner.execute({
      code: `async function main() { return null; }`,
      variables: {}
    });
    expect(result.success).toBe(true);
  });

  // ===== 资源限制 =====

  it('超时被终止', async () => {
    const result = await strictRunner.execute({
      code: `async function main() {
        while(true) {}
      }`,
      variables: {}
    });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/timeout|timed out/i);
  });

  it('磁盘配额超限', async () => {
    const result = await strictRunner.execute({
      code: `async function main() {
        // 1MB 限制，写 2MB
        const big = 'x'.repeat(2 * 1024 * 1024);
        SystemHelper.fs.writeFile('big.txt', big);
        return { written: true };
      }`,
      variables: {}
    });
    expect(result.success).toBe(false);
    expect(result.data?.codeReturn?.error || result.message).toMatch(/quota|limit/i);
  });

  // ===== 大数据 =====

  it('大量 console.log 输出', async () => {
    const result = await runner.execute({
      code: `async function main() {
        for (let i = 0; i < 1000; i++) {
          console.log('line ' + i);
        }
        return { done: true };
      }`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.log).toContain('line 0');
    expect(result.data?.log).toContain('line 999');
  });

  it('大对象返回', async () => {
    const result = await runner.execute({
      code: `async function main() {
        const arr = [];
        for (let i = 0; i < 10000; i++) arr.push(i);
        return { count: arr.length, first: arr[0], last: arr[9999] };
      }`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.count).toBe(10000);
  });

  // ===== 变量传递 =====

  it('空变量', async () => {
    const result = await runner.execute({
      code: `async function main(vars) {
        return { keys: Object.keys(vars) };
      }`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.keys).toEqual([]);
  });

  it('特殊字符变量', async () => {
    const result = await runner.execute({
      code: `async function main(vars) {
        return { name: vars.name };
      }`,
      variables: { name: '你好\n"world"<script>alert(1)</script>' }
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.name).toBe('你好\n"world"<script>alert(1)</script>');
  });

  it('嵌套对象变量', async () => {
    const result = await runner.execute({
      code: `async function main(vars) {
        return { deep: vars.a.b.c };
      }`,
      variables: { a: { b: { c: 42 } } }
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.deep).toBe(42);
  });

  it('数组变量', async () => {
    const result = await runner.execute({
      code: `async function main(vars) {
        return { len: vars.items.length, first: vars.items[0] };
      }`,
      variables: { items: [1, 2, 3] }
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.len).toBe(3);
  });
});

describe('边界测试 - Python', () => {
  let runner: PythonRunner;
  let strictRunner: PythonRunner;
  beforeAll(() => {
    runner = new PythonRunner(config);
    strictRunner = new PythonRunner(strictConfig);
  });

  // ===== 空/错误代码 =====

  it('空代码', async () => {
    const result = await runner.execute({ code: '', variables: {} });
    expect(result.success).toBe(false);
  });

  it('语法错误', async () => {
    const result = await runner.execute({
      code: `def main(
    return {}`,
      variables: {}
    });
    expect(result.success).toBe(false);
  });

  it('运行时异常', async () => {
    const result = await runner.execute({
      code: `def main():
    raise ValueError('test error')`,
      variables: {}
    });
    expect(result.success).toBe(false);
    expect(result.data?.codeReturn?.error || result.message).toMatch(/test error/);
  });

  it('main 不是函数', async () => {
    const result = await runner.execute({
      code: `main = 42`,
      variables: {}
    });
    expect(result.success).toBe(false);
  });

  it('main 返回 None', async () => {
    const result = await runner.execute({
      code: `def main():
    pass`,
      variables: {}
    });
    expect(result.success).toBe(true);
  });

  // ===== 资源限制 =====

  it('超时被终止', async () => {
    const result = await strictRunner.execute({
      code: `def main():
    while True:
        pass`,
      variables: {}
    });
    expect(result.success).toBe(false);
    // Python 死循环被 CPU 资源限制 kill 后，进程无输出
    expect(result.message).toMatch(/timeout|timed out|killed|no output/i);
  });

  // ===== 大数据 =====

  it('大量 print 输出', async () => {
    const result = await runner.execute({
      code: `def main():
    for i in range(1000):
        print(f'line {i}')
    return {'done': True}`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.log).toContain('line 0');
    expect(result.data?.log).toContain('line 999');
  });

  it('大列表返回', async () => {
    const result = await runner.execute({
      code: `def main():
    arr = list(range(10000))
    return {'count': len(arr), 'first': arr[0], 'last': arr[-1]}`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.count).toBe(10000);
  });

  // ===== 变量传递 =====

  it('空变量', async () => {
    const result = await runner.execute({
      code: `def main(vars):
    return {'keys': list(vars.keys())}`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.keys).toEqual([]);
  });

  it('特殊字符变量', async () => {
    const result = await runner.execute({
      code: `def main(vars):
    return {'name': vars['name']}`,
      variables: { name: '你好\n"world"<script>alert(1)</script>' }
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.name).toBe('你好\n"world"<script>alert(1)</script>');
  });

  it('嵌套字典变量', async () => {
    const result = await runner.execute({
      code: `def main(vars):
    return {'deep': vars['a']['b']['c']}`,
      variables: { a: { b: { c: 42 } } }
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.deep).toBe(42);
  });

  it('列表变量', async () => {
    const result = await runner.execute({
      code: `def main(vars):
    return {'len': len(vars['items']), 'first': vars['items'][0]}`,
      variables: { items: [1, 2, 3] }
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.len).toBe(3);
  });

  // ===== 类型处理 =====

  it('返回非 JSON 可序列化对象（set）', async () => {
    const result = await runner.execute({
      code: `def main():
    return {'items': list({1, 2, 3})}`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.items).toHaveLength(3);
  });

  it('返回 datetime 对象（default=str 处理）', async () => {
    const result = await runner.execute({
      code: `from datetime import datetime
def main():
    return {'now': datetime(2024, 1, 1, 12, 0, 0)}`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.now).toContain('2024');
  });
});
