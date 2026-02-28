import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ProcessPool } from '../../src/pool/process-pool';
import { PythonProcessPool } from '../../src/pool/python-process-pool';

let jsPool: ProcessPool;
let pyPool: PythonProcessPool;

beforeAll(async () => {
  jsPool = new ProcessPool(1);
  await jsPool.init();
  pyPool = new PythonProcessPool(1);
  await pyPool.init();
});

afterAll(async () => {
  await jsPool.shutdown();
  await pyPool.shutdown();
});

describe('边界测试 - JS', () => {
  // ===== 空/特殊代码 =====

  it('空代码（无 main 函数）', async () => {
    const result = await jsPool.execute({ code: '', variables: {} });
    expect(result.success).toBe(false);
  });

  it('main 不是函数', async () => {
    const result = await jsPool.execute({
      code: `const main = 42;`,
      variables: {}
    });
    expect(result.success).toBe(false);
  });

  it('main 返回 undefined', async () => {
    const result = await jsPool.execute({
      code: `async function main() { }`,
      variables: {}
    });
    expect(result.success).toBe(true);
  });

  it('main 返回 null', async () => {
    const result = await jsPool.execute({
      code: `async function main() { return null; }`,
      variables: {}
    });
    expect(result.success).toBe(true);
  });

  // ===== 大数据 =====

  it('大量 console.log 输出', async () => {
    const result = await jsPool.execute({
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
    const result = await jsPool.execute({
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

  it('特殊字符变量', async () => {
    const result = await jsPool.execute({
      code: `async function main(vars) {
        return { name: vars.name };
      }`,
      variables: { name: '你好\n"world"<script>alert(1)</script>' }
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.name).toBe('你好\n"world"<script>alert(1)</script>');
  });

  it('嵌套对象变量', async () => {
    const result = await jsPool.execute({
      code: `async function main(vars) {
        return { deep: vars.a.b.c };
      }`,
      variables: { a: { b: { c: 42 } } }
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.deep).toBe(42);
  });

  it('数组变量', async () => {
    const result = await jsPool.execute({
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
  // ===== 空/特殊代码 =====

  it('空代码', async () => {
    const result = await pyPool.execute({ code: '', variables: {} });
    expect(result.success).toBe(false);
  });

  it('main 不是函数', async () => {
    const result = await pyPool.execute({
      code: `main = 42`,
      variables: {}
    });
    expect(result.success).toBe(false);
  });

  it('main 返回 None', async () => {
    const result = await pyPool.execute({
      code: `def main():
    pass`,
      variables: {}
    });
    expect(result.success).toBe(true);
  });

  // ===== 大数据 =====

  it('大量 print 输出', async () => {
    const result = await pyPool.execute({
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
    const result = await pyPool.execute({
      code: `def main():
    arr = list(range(10000))
    return {'count': len(arr), 'first': arr[0], 'last': arr[-1]}`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.count).toBe(10000);
  });

  // ===== 变量传递 =====

  it('特殊字符变量', async () => {
    const result = await pyPool.execute({
      code: `def main(vars):
    return {'name': vars['name']}`,
      variables: { name: '你好\n"world"<script>alert(1)</script>' }
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.name).toBe('你好\n"world"<script>alert(1)</script>');
  });

  it('嵌套字典变量', async () => {
    const result = await pyPool.execute({
      code: `def main(vars):
    return {'deep': vars['a']['b']['c']}`,
      variables: { a: { b: { c: 42 } } }
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.deep).toBe(42);
  });

  it('列表变量', async () => {
    const result = await pyPool.execute({
      code: `def main(vars):
    return {'len': len(vars['items']), 'first': vars['items'][0]}`,
      variables: { items: [1, 2, 3] }
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.len).toBe(3);
  });

  // ===== 类型处理 =====

  it('返回非 JSON 可序列化对象（set）', async () => {
    const result = await pyPool.execute({
      code: `def main():
    return {'items': list({1, 2, 3})}`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.items).toHaveLength(3);
  });

  it('返回 datetime 对象（default=str 处理）', async () => {
    const result = await pyPool.execute({
      code: `from datetime import datetime
def main():
    return {'now': datetime(2024, 1, 1, 12, 0, 0)}`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.now).toContain('2024');
  });

  // ===== 补充：更多边界场景 =====

  it('超长变量字符串', async () => {
    const longStr = 'a'.repeat(100000);
    const result = await pyPool.execute({
      code: `def main(v):
    return {'len': len(v['text'])}`,
      variables: { text: longStr }
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.len).toBe(100000);
  });

  it('变量包含特殊 JSON 字符', async () => {
    const result = await pyPool.execute({
      code: `def main(v):
    return {'text': v['text']}`,
      variables: { text: 'line1\nline2\ttab\\backslash"quote' }
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.text).toContain('line1');
    expect(result.data?.codeReturn.text).toContain('\\');
  });

  it('返回浮点数精度', async () => {
    const result = await pyPool.execute({
      code: `def main():
    return {'val': 0.1 + 0.2}`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.val).toBeCloseTo(0.3, 10);
  });

  it('返回非常大的整数', async () => {
    const result = await pyPool.execute({
      code: `def main():
    return {'big': 2 ** 53}`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.big).toBe(9007199254740992);
  });

  it('缺少必需参数的 main 函数', async () => {
    const result = await pyPool.execute({
      code: `def main(a, b, c):
    return {'sum': a + b + c}`,
      variables: { a: 1, b: 2 } // 缺少 c
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain('Missing');
  });
});

describe('边界测试 - JS 补充', () => {
  it('超长变量字符串', async () => {
    const longStr = 'a'.repeat(100000);
    const result = await jsPool.execute({
      code: `async function main(v) {
        return { len: v.text.length };
      }`,
      variables: { text: longStr }
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.len).toBe(100000);
  });

  it('变量包含特殊 JSON 字符', async () => {
    const result = await jsPool.execute({
      code: `async function main(v) {
        return { text: v.text };
      }`,
      variables: { text: 'line1\nline2\ttab\\backslash"quote' }
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.text).toContain('line1');
  });

  it('返回浮点数精度', async () => {
    const result = await jsPool.execute({
      code: `async function main() {
        return { val: 0.1 + 0.2 };
      }`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.val).toBeCloseTo(0.3, 10);
  });

  it('Promise.reject 被正确捕获', async () => {
    const result = await jsPool.execute({
      code: `async function main() {
        await Promise.reject(new Error('rejected'));
      }`,
      variables: {}
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain('rejected');
  });

  it('setTimeout 在沙盒中可用', async () => {
    const result = await jsPool.execute({
      code: `async function main() {
        return new Promise(resolve => {
          setTimeout(() => resolve({ ok: true }), 50);
        });
      }`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.ok).toBe(true);
  });

  it('JSON 循环引用返回错误', async () => {
    const result = await jsPool.execute({
      code: `async function main() {
        const obj = {};
        obj.self = obj;
        return obj;
      }`,
      variables: {}
    });
    // JSON.stringify 循环引用会抛错
    expect(result.success).toBe(false);
  });

  it('缺少 main 函数', async () => {
    const result = await jsPool.execute({
      code: `const x = 42;`,
      variables: {}
    });
    expect(result.success).toBe(false);
  });

  it('async 函数中 try/catch 正常工作', async () => {
    const result = await jsPool.execute({
      code: `async function main() {
        try {
          JSON.parse('invalid json');
        } catch(e) {
          return { caught: true, msg: e.message };
        }
      }`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.caught).toBe(true);
  });
});
