/**
 * 集成测试套件 - 黑盒功能测试
 *
 * 测试矩阵：输入代码 + 变量 → 预期输出
 * 覆盖真实使用场景，不关心内部实现
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { JsRunner } from '../../src/runner/js-runner';
import { PythonRunner } from '../../src/runner/python-runner';
import type { RunnerConfig } from '../../src/types';

const config: RunnerConfig = {
  defaultTimeoutMs: 15000,
  defaultMemoryMB: 64,
  defaultDiskMB: 10
};

// ============================================================
// 测试用例矩阵类型
// ============================================================
interface TestCase {
  name: string;
  code: string;
  variables?: Record<string, any>;
  limits?: { timeoutMs?: number; memoryMB?: number; diskMB?: number };
  expect: {
    success: boolean;
    codeReturn?: any;           // 精确匹配
    codeReturnMatch?: Record<string, any>; // 部分匹配
    errorMatch?: RegExp;        // 错误信息匹配
    hasLog?: boolean;           // 是否有日志输出
  };
}

function runMatrix(getRunner: () => JsRunner | PythonRunner, cases: TestCase[]) {
  for (const tc of cases) {
    it(tc.name, async () => {
      const result = await getRunner().execute({
        code: tc.code,
        variables: tc.variables || {},
        limits: tc.limits
      });

      expect(result.success).toBe(tc.expect.success);

      if (tc.expect.codeReturn !== undefined) {
        expect(result.data?.codeReturn).toEqual(tc.expect.codeReturn);
      }
      if (tc.expect.codeReturnMatch) {
        for (const [key, val] of Object.entries(tc.expect.codeReturnMatch)) {
          expect(result.data?.codeReturn?.[key]).toEqual(val);
        }
      }
      if (tc.expect.errorMatch) {
        expect(result.message).toMatch(tc.expect.errorMatch);
      }
      if (tc.expect.hasLog) {
        expect(result.data?.log).toBeTruthy();
        expect(result.data!.log!.length).toBeGreaterThan(0);
      }
    });
  }
}

// ============================================================
// JS 功能测试矩阵
// ============================================================
describe('JS 功能测试', () => {
  let runner: JsRunner;
  beforeAll(() => { runner = new JsRunner(config); });

  // --- 基础运算 ---
  describe('基础运算', () => {
    runMatrix(() => runner, [
      {
        name: '返回简单对象',
        code: `async function main() { return { hello: 'world' }; }`,
        expect: { success: true, codeReturn: { hello: 'world' } }
      },
      {
        name: '数学运算',
        code: `async function main() { return { sum: 1 + 2, product: 3 * 4, division: 10 / 3 }; }`,
        expect: { success: true, codeReturnMatch: { sum: 3, product: 12 } }
      },
      {
        name: '字符串操作',
        code: `async function main() {
          const s = 'Hello, World!';
          return { upper: s.toUpperCase(), len: s.length, includes: s.includes('World') };
        }`,
        expect: { success: true, codeReturn: { upper: 'HELLO, WORLD!', len: 13, includes: true } }
      },
      {
        name: '数组操作',
        code: `async function main() {
          const arr = [3, 1, 4, 1, 5, 9];
          return { sorted: [...arr].sort((a,b) => a-b), sum: arr.reduce((a,b) => a+b, 0), len: arr.length };
        }`,
        expect: { success: true, codeReturn: { sorted: [1, 1, 3, 4, 5, 9], sum: 23, len: 6 } }
      },
      {
        name: 'JSON 解析与序列化',
        code: `async function main() {
          const obj = { a: 1, b: [2, 3] };
          const json = JSON.stringify(obj);
          const parsed = JSON.parse(json);
          return { json, equal: JSON.stringify(parsed) === json };
        }`,
        expect: { success: true, codeReturn: { json: '{"a":1,"b":[2,3]}', equal: true } }
      },
      {
        name: '正则表达式',
        code: `async function main() {
          const text = 'Email: test@example.com, Phone: 123-456-7890';
          const email = text.match(/[\\w.]+@[\\w.]+/)?.[0];
          const phone = text.match(/\\d{3}-\\d{3}-\\d{4}/)?.[0];
          return { email, phone };
        }`,
        expect: { success: true, codeReturn: { email: 'test@example.com', phone: '123-456-7890' } }
      },
      {
        name: 'Date 操作',
        code: `async function main() {
          const d = new Date('2024-01-15T12:00:00Z');
          return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
        }`,
        expect: { success: true, codeReturn: { year: 2024, month: 1, day: 15 } }
      },
      {
        name: 'Promise.all 并发',
        code: `async function main() {
          const results = await Promise.all([
            Promise.resolve(1),
            Promise.resolve(2),
            Promise.resolve(3)
          ]);
          return { results, sum: results.reduce((a,b) => a+b, 0) };
        }`,
        expect: { success: true, codeReturn: { results: [1, 2, 3], sum: 6 } }
      },
      {
        name: 'Map 和 Set',
        code: `async function main() {
          const m = new Map([['a', 1], ['b', 2]]);
          const s = new Set([1, 2, 2, 3, 3]);
          return { mapSize: m.size, mapGet: m.get('b'), setSize: s.size };
        }`,
        expect: { success: true, codeReturn: { mapSize: 2, mapGet: 2, setSize: 3 } }
      },
    ]);
  });

  // --- 变量传递 ---
  describe('变量传递', () => {
    runMatrix(() => runner, [
      {
        name: '接收字符串变量',
        code: `async function main(v) { return { greeting: 'Hello, ' + v.name + '!' }; }`,
        variables: { name: 'Alice' },
        expect: { success: true, codeReturn: { greeting: 'Hello, Alice!' } }
      },
      {
        name: '接收数字变量',
        code: `async function main(v) { return { doubled: v.num * 2 }; }`,
        variables: { num: 21 },
        expect: { success: true, codeReturn: { doubled: 42 } }
      },
      {
        name: '接收复杂对象变量',
        code: `async function main(v) {
          const items = JSON.parse(v.items);
          return { count: items.length, first: items[0] };
        }`,
        variables: { items: '[{"id":1,"name":"foo"},{"id":2,"name":"bar"}]' },
        expect: { success: true, codeReturn: { count: 2, first: { id: 1, name: 'foo' } } }
      },
      {
        name: '空变量对象',
        code: `async function main(v) { return { keys: Object.keys(v || {}).length }; }`,
        variables: {},
        expect: { success: true, codeReturn: { keys: 0 } }
      },
      {
        name: '多个变量',
        code: `async function main(v) { return { result: v.a + ' ' + v.b + ' ' + v.c }; }`,
        variables: { a: 'hello', b: 'beautiful', c: 'world' },
        expect: { success: true, codeReturn: { result: 'hello beautiful world' } }
      },
    ]);
  });

  // --- console.log 日志 ---
  describe('日志输出', () => {
    runMatrix(() => runner, [
      {
        name: 'console.log 被捕获',
        code: `async function main() { console.log('debug info'); return { done: true }; }`,
        expect: { success: true, codeReturn: { done: true }, hasLog: true }
      },
    ]);
  });

  // --- 白名单模块 ---
  describe('白名单模块', () => {
    runMatrix(() => runner, [
      {
        name: 'require crypto-js',
        code: `async function main() {
          const CryptoJS = require('crypto-js');
          const hash = CryptoJS.MD5('hello').toString();
          return { hash };
        }`,
        expect: { success: true, codeReturnMatch: { hash: '5d41402abc4b2a76b9719d911017c592' } }
      },
      {
        name: 'require moment',
        code: `async function main() {
          const moment = require('moment');
          const d = moment('2024-01-15');
          return { formatted: d.format('YYYY/MM/DD') };
        }`,
        expect: { success: true, codeReturn: { formatted: '2024/01/15' } }
      },
      {
        name: 'require lodash',
        code: `async function main() {
          const _ = require('lodash');
          return { chunk: _.chunk([1,2,3,4,5,6], 2) };
        }`,
        expect: { success: true, codeReturn: { chunk: [[1,2],[3,4],[5,6]] } }
      },
    ]);
  });

  // --- 错误处理 ---
  describe('错误处理', () => {
    runMatrix(() => runner, [
      {
        name: '语法错误',
        code: `async function main() { return {{{ }`,
        expect: { success: false }
      },
      {
        name: '运行时异常',
        code: `async function main() { throw new Error('boom'); }`,
        expect: { success: false, errorMatch: /boom/ }
      },
      {
        name: '未定义变量',
        code: `async function main() { return { val: undefinedVar }; }`,
        expect: { success: false }
      },
      {
        name: '超时',
        code: `async function main() { while(true) {} return {}; }`,
        limits: { timeoutMs: 2000 },
        expect: { success: false }
      },
    ]);
  });

  // --- SystemHelper ---
  describe('SystemHelper', () => {
    runMatrix(() => runner, [
      {
        name: 'delay 正常延迟',
        code: `async function main() {
          const start = Date.now();
          await SystemHelper.delay(500);
          const elapsed = Date.now() - start;
          return { elapsed: elapsed >= 400 };
        }`,
        expect: { success: true, codeReturn: { elapsed: true } }
      },
      {
        name: 'fs 读写文件',
        code: `async function main() {
          SystemHelper.fs.writeFile('test.txt', 'hello sandbox');
          const content = SystemHelper.fs.readFile('test.txt');
          return { content };
        }`,
        expect: { success: true, codeReturn: { content: 'hello sandbox' } }
      },
      {
        name: 'fs 写入后读取验证',
        code: `async function main() {
          SystemHelper.fs.writeFile('a.txt', 'content_a');
          SystemHelper.fs.writeFile('b.txt', 'content_b');
          const a = SystemHelper.fs.readFile('a.txt');
          const b = SystemHelper.fs.readFile('b.txt');
          return { a, b };
        }`,
        expect: { success: true, codeReturn: { a: 'content_a', b: 'content_b' } }
      },
      {
        name: 'strToBase64 编码',
        code: `async function main() {
          const encoded = SystemHelper.strToBase64('Hello, World!');
          return { encoded };
        }`,
        expect: { success: true, codeReturn: { encoded: 'SGVsbG8sIFdvcmxkIQ==' } }
      },
    ]);
  });

  // --- 网络请求 ---
  describe('网络请求', () => {
    runMatrix(() => runner, [
      {
        name: 'httpRequest GET',
        code: `async function main() {
          const res = await httpRequest('https://httpbin.org/get?foo=bar');
          const data = JSON.parse(res.data);
          return { status: res.status, foo: data.args.foo };
        }`,
        expect: { success: true, codeReturn: { status: 200, foo: 'bar' } }
      },
      {
        name: 'httpRequest POST JSON',
        code: `async function main() {
          const res = await httpRequest('https://httpbin.org/post', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: { message: 'hello' }
          });
          const data = JSON.parse(res.data);
          return { status: res.status, body: data.json };
        }`,
        expect: { success: true, codeReturnMatch: { status: 200 } }
      },
    ]);
  });
});

// ============================================================
// Python 功能测试矩阵
// ============================================================
describe('Python 功能测试', () => {
  let runner: PythonRunner;
  beforeAll(() => { runner = new PythonRunner(config); });

  // --- 基础运算 ---
  describe('基础运算', () => {
    runMatrix(() => runner, [
      {
        name: '返回简单字典',
        code: `def main():\n    return {'hello': 'world'}`,
        expect: { success: true, codeReturn: { hello: 'world' } }
      },
      {
        name: '数学运算',
        code: `def main():\n    return {'sum': 1 + 2, 'product': 3 * 4, 'power': 2 ** 10}`,
        expect: { success: true, codeReturn: { sum: 3, product: 12, power: 1024 } }
      },
      {
        name: '字符串操作',
        code: `def main():\n    s = 'Hello, World!'\n    return {'upper': s.upper(), 'len': len(s), 'split': s.split(', ')}`,
        expect: { success: true, codeReturn: { upper: 'HELLO, WORLD!', len: 13, split: ['Hello', 'World!'] } }
      },
      {
        name: '列表操作',
        code: `def main():\n    arr = [3, 1, 4, 1, 5, 9]\n    return {'sorted': sorted(arr), 'sum': sum(arr), 'len': len(arr)}`,
        expect: { success: true, codeReturn: { sorted: [1, 1, 3, 4, 5, 9], sum: 23, len: 6 } }
      },
      {
        name: '字典推导式',
        code: `def main():\n    d = {k: v**2 for k, v in {'a': 1, 'b': 2, 'c': 3}.items()}\n    return d`,
        expect: { success: true, codeReturn: { a: 1, b: 4, c: 9 } }
      },
      {
        name: '列表推导式',
        code: `def main():\n    evens = [x for x in range(10) if x % 2 == 0]\n    return {'evens': evens}`,
        expect: { success: true, codeReturn: { evens: [0, 2, 4, 6, 8] } }
      },
      {
        name: 'try/except 异常处理',
        code: `def main():\n    try:\n        result = 1 / 0\n    except ZeroDivisionError as e:\n        return {'caught': True}\n    return {'caught': False}`,
        expect: { success: true, codeReturn: { caught: true } }
      },
    ]);
  });

  // --- 变量传递 ---
  describe('变量传递', () => {
    runMatrix(() => runner, [
      {
        name: '接收字符串变量',
        code: `def main(v):\n    return {'greeting': f"Hello, {v['name']}!"}`,
        variables: { name: 'Bob' },
        expect: { success: true, codeReturn: { greeting: 'Hello, Bob!' } }
      },
      {
        name: '接收数字变量',
        code: `def main(v):\n    return {'doubled': int(v['num']) * 2}`,
        variables: { num: '21' },
        expect: { success: true, codeReturn: { doubled: 42 } }
      },
      {
        name: '多个变量',
        code: `def main(v):\n    return {'result': f"{v['a']} {v['b']} {v['c']}"}`,
        variables: { a: 'hello', b: 'beautiful', c: 'world' },
        expect: { success: true, codeReturn: { result: 'hello beautiful world' } }
      },
    ]);
  });

  // --- 安全模块使用 ---
  describe('安全模块', () => {
    runMatrix(() => runner, [
      {
        name: 'import json',
        code: `import json\ndef main():\n    data = json.dumps({'key': 'value'}, ensure_ascii=False)\n    parsed = json.loads(data)\n    return {'data': data, 'key': parsed['key']}`,
        expect: { success: true, codeReturnMatch: { key: 'value' } }
      },
      {
        name: 'import math',
        code: `import math\ndef main():\n    return {'pi': round(math.pi, 4), 'sqrt2': round(math.sqrt(2), 4), 'e': round(math.e, 4)}`,
        expect: { success: true, codeReturn: { pi: 3.1416, sqrt2: 1.4142, e: 2.7183 } }
      },
      {
        name: 'import re',
        code: `import re\ndef main():\n    text = 'Price: $12.99, Tax: $1.30'\n    prices = re.findall(r'\\$(\\d+\\.\\d+)', text)\n    return {'prices': prices}`,
        expect: { success: true, codeReturn: { prices: ['12.99', '1.30'] } }
      },
      {
        name: 'from datetime import datetime',
        code: `from datetime import datetime\ndef main():\n    d = datetime(2024, 1, 15, 12, 0, 0)\n    return {'iso': d.isoformat(), 'year': d.year}`,
        expect: { success: true, codeReturn: { iso: '2024-01-15T12:00:00', year: 2024 } }
      },
      {
        name: 'import hashlib',
        code: `import hashlib\ndef main():\n    h = hashlib.md5(b'hello').hexdigest()\n    return {'md5': h}`,
        expect: { success: true, codeReturn: { md5: '5d41402abc4b2a76b9719d911017c592' } }
      },
      {
        name: 'import base64',
        code: `import base64\ndef main():\n    encoded = base64.b64encode(b'Hello').decode()\n    decoded = base64.b64decode(encoded).decode()\n    return {'encoded': encoded, 'decoded': decoded}`,
        expect: { success: true, codeReturn: { encoded: 'SGVsbG8=', decoded: 'Hello' } }
      },
    ]);
  });

  // --- system_helper ---
  describe('system_helper', () => {
    runMatrix(() => runner, [
      {
        name: 'fs 读写文件',
        code: `def main():\n    system_helper.fs.write_file('test.txt', 'hello sandbox')\n    content = system_helper.fs.read_file('test.txt')\n    return {'content': content}`,
        expect: { success: true, codeReturn: { content: 'hello sandbox' } }
      },
      {
        name: 'str_to_base64 编码',
        code: `def main():\n    encoded = system_helper.str_to_base64('Hello, World!')\n    return {'encoded': encoded}`,
        expect: { success: true, codeReturn: { encoded: 'SGVsbG8sIFdvcmxkIQ==' } }
      },
      {
        name: 'delay 正常延迟',
        code: `import time\ndef main():\n    start = time.time()\n    system_helper.delay(500)\n    elapsed = time.time() - start\n    return {'elapsed_ok': elapsed >= 0.4}`,
        expect: { success: true, codeReturn: { elapsed_ok: true } }
      },
    ]);
  });

  // --- 错误处理 ---
  describe('错误处理', () => {
    runMatrix(() => runner, [
      {
        name: '语法错误',
        code: `def main():\n    return {{{`,
        expect: { success: false }
      },
      {
        name: '运行时异常',
        code: `def main():\n    raise ValueError('boom')`,
        expect: { success: false, errorMatch: /boom/ }
      },
      {
        name: '未定义变量',
        code: `def main():\n    return {'val': undefined_var}`,
        expect: { success: false }
      },
      {
        name: '超时',
        code: `def main():\n    while True:\n        pass\n    return {}`,
        limits: { timeoutMs: 2000 },
        expect: { success: false }
      },
    ]);
  });

  // --- 网络请求 ---
  describe('网络请求', () => {
    runMatrix(() => runner, [
      {
        name: 'http_request GET',
        code: `import json\ndef main():\n    res = http_request('https://httpbin.org/get?foo=bar')\n    data = json.loads(res['data'])\n    return {'status': res['status'], 'foo': data['args']['foo']}`,
        expect: { success: true, codeReturn: { status: 200, foo: 'bar' } }
      },
      {
        name: 'http_request POST JSON',
        code: `import json\ndef main():\n    res = http_request('https://httpbin.org/post', method='POST', body={'message': 'hello'})\n    data = json.loads(res['data'])\n    return {'status': res['status'], 'body': data.get('json')}`,
        expect: { success: true, codeReturnMatch: { status: 200 } }
      },
    ]);
  });

  // --- 复杂场景 ---
  describe('复杂场景', () => {
    runMatrix(() => runner, [
      {
        name: '数据处理管道：解析CSV → 过滤 → 聚合',
        code: `def main(v):
    lines = v['csv'].strip().split('\\n')
    header = lines[0].split(',')
    rows = [dict(zip(header, line.split(','))) for line in lines[1:]]
    adults = [r for r in rows if int(r['age']) >= 18]
    avg_age = sum(int(r['age']) for r in adults) / len(adults)
    return {'total': len(rows), 'adults': len(adults), 'avg_age': avg_age}`,
        variables: { csv: 'name,age\nAlice,25\nBob,17\nCharlie,30\nDiana,15' },
        expect: { success: true, codeReturn: { total: 4, adults: 2, avg_age: 27.5 } }
      },
      {
        name: '递归：斐波那契',
        code: `def main():
    def fib(n):
        if n <= 1: return n
        return fib(n-1) + fib(n-2)
    return {'fib10': fib(10), 'fib20': fib(20)}`,
        expect: { success: true, codeReturn: { fib10: 55, fib20: 6765 } }
      },
      {
        name: '类定义和使用',
        code: `def main():
    class Point:
        def __init__(self, x, y):
            self.x = x
            self.y = y
        def distance(self, other):
            return ((self.x - other.x)**2 + (self.y - other.y)**2)**0.5
    p1 = Point(0, 0)
    p2 = Point(3, 4)
    return {'distance': p1.distance(p2)}`,
        expect: { success: true, codeReturn: { distance: 5.0 } }
      },
    ]);
  });
});
