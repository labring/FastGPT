import { describe, it, expect, beforeAll } from 'vitest';
import { JsRunner } from '../../src/runner/js-runner';
import { PythonRunner } from '../../src/runner/python-runner';
import type { RunnerConfig } from '../../src/types';

const config: RunnerConfig = {
  defaultTimeoutMs: 15000,
  defaultMemoryMB: 64,
};

describe('基础样例 - JS', () => {
  let runner: JsRunner;
  beforeAll(() => { runner = new JsRunner(config); });

  // ===== 常见数据处理 =====

  it('字符串处理', async () => {
    const result = await runner.execute({
      code: `async function main({ text }) {
        return {
          upper: text.toUpperCase(),
          len: text.length,
          words: text.split(' ').length
        };
      }`,
      variables: { text: 'hello world foo' }
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn).toEqual({ upper: 'HELLO WORLD FOO', len: 15, words: 3 });
  });

  it('数组操作 (map/filter/reduce)', async () => {
    const result = await runner.execute({
      code: `async function main({ numbers }) {
        const doubled = numbers.map(n => n * 2);
        const evens = numbers.filter(n => n % 2 === 0);
        const sum = numbers.reduce((a, b) => a + b, 0);
        return { doubled, evens, sum };
      }`,
      variables: { numbers: [1, 2, 3, 4, 5] }
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn).toEqual({
      doubled: [2, 4, 6, 8, 10],
      evens: [2, 4],
      sum: 15
    });
  });

  it('JSON 解析和构造', async () => {
    const result = await runner.execute({
      code: `async function main({ jsonStr }) {
        const obj = JSON.parse(jsonStr);
        obj.added = true;
        return obj;
      }`,
      variables: { jsonStr: '{"name":"test","value":42}' }
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn).toEqual({ name: 'test', value: 42, added: true });
  });

  it('正则表达式提取', async () => {
    const result = await runner.execute({
      code: `async function main({ text }) {
        const emails = text.match(/[\\w.]+@[\\w.]+/g) || [];
        const phones = text.match(/\\d{3}-\\d{4}-\\d{4}/g) || [];
        return { emails, phones };
      }`,
      variables: { text: 'Contact: test@example.com or 138-1234-5678' }
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.emails).toEqual(['test@example.com']);
    expect(result.data?.codeReturn.phones).toEqual(['138-1234-5678']);
  });

  // ===== 使用白名单模块 =====

  it('lodash 数据处理', async () => {
    const result = await runner.execute({
      code: `async function main({ items }) {
        const _ = require('lodash');
        const grouped = _.groupBy(items, 'type');
        const counts = _.mapValues(grouped, arr => arr.length);
        return counts;
      }`,
      variables: { items: [
        { type: 'a', v: 1 }, { type: 'b', v: 2 },
        { type: 'a', v: 3 }, { type: 'c', v: 4 }
      ]}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn).toEqual({ a: 2, b: 1, c: 1 });
  });

  it('dayjs 日期处理', async () => {
    const result = await runner.execute({
      code: `async function main() {
        const dayjs = require('dayjs');
        const d = dayjs('2024-01-15');
        return {
          formatted: d.format('YYYY/MM/DD'),
          dayOfWeek: d.day(),
          month: d.month() + 1
        };
      }`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.formatted).toBe('2024/01/15');
    expect(result.data?.codeReturn.month).toBe(1);
  });

  it('crypto-js 加密', async () => {
    const result = await runner.execute({
      code: `async function main({ text, key }) {
        const CryptoJS = require('crypto-js');
        const encrypted = CryptoJS.AES.encrypt(text, key).toString();
        const decrypted = CryptoJS.AES.decrypt(encrypted, key).toString(CryptoJS.enc.Utf8);
        return { match: decrypted === text };
      }`,
      variables: { text: 'hello', key: 'secret' }
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.match).toBe(true);
  });

  it('uuid 生成', async () => {
    const result = await runner.execute({
      code: `async function main() {
        const { v4 } = require('uuid');
        const id = v4();
        return { id, valid: /^[0-9a-f-]{36}$/.test(id) };
      }`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.valid).toBe(true);
  });

  // ===== SystemHelper 使用 =====

  it('countToken 计算', async () => {
    const result = await runner.execute({
      code: `async function main({ text }) {
        return { tokens: SystemHelper.countToken(text) };
      }`,
      variables: { text: 'Hello, this is a test sentence.' }
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.tokens).toBeGreaterThan(0);
  });

  it('strToBase64 编码', async () => {
    const result = await runner.execute({
      code: `async function main() {
        return { encoded: SystemHelper.strToBase64('hello') };
      }`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.encoded).toBe(Buffer.from('hello').toString('base64'));
  });

  it('文件读写', async () => {
    const result = await runner.execute({
      code: `async function main() {
        SystemHelper.fs.writeFile('test.txt', 'hello world');
        const content = SystemHelper.fs.readFile('test.txt');
        return { content, exists: SystemHelper.fs.exists('test.txt') };
      }`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.content).toBe('hello world');
    expect(result.data?.codeReturn.exists).toBe(true);
  });

  // ===== async/await =====

  it('async/await + Promise', async () => {
    const result = await runner.execute({
      code: `async function main() {
        const results = await Promise.all([
          delay(100).then(() => 1),
          delay(200).then(() => 2),
          delay(100).then(() => 3)
        ]);
        return { results };
      }`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.results).toEqual([1, 2, 3]);
  });

  // ===== 错误代码样例 =====

  it('访问未定义变量', async () => {
    const result = await runner.execute({
      code: `async function main() {
        return { value: undefinedVar };
      }`,
      variables: {}
    });
    expect(result.success).toBe(false);
  });

  it('无限递归', async () => {
    const result = await runner.execute({
      code: `function recurse() { return recurse(); }
async function main() {
  return recurse();
}`,
      variables: {}
    });
    expect(result.success).toBe(false);
  });

  it('类型错误', async () => {
    const result = await runner.execute({
      code: `async function main() {
        const x = null;
        return { value: x.property };
      }`,
      variables: {}
    });
    expect(result.success).toBe(false);
  });
});

describe('基础样例 - Python', () => {
  let runner: PythonRunner;
  beforeAll(() => { runner = new PythonRunner(config); });

  // ===== 常见数据处理 =====

  it('字符串处理', async () => {
    const result = await runner.execute({
      code: `def main(vars):
    text = vars['text']
    return {
        'upper': text.upper(),
        'len': len(text),
        'words': len(text.split())
    }`,
      variables: { text: 'hello world foo' }
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn).toEqual({ upper: 'HELLO WORLD FOO', len: 15, words: 3 });
  });

  it('列表推导式', async () => {
    const result = await runner.execute({
      code: `def main(vars):
    numbers = vars['numbers']
    doubled = [n * 2 for n in numbers]
    evens = [n for n in numbers if n % 2 == 0]
    total = sum(numbers)
    return {'doubled': doubled, 'evens': evens, 'sum': total}`,
      variables: { numbers: [1, 2, 3, 4, 5] }
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn).toEqual({
      doubled: [2, 4, 6, 8, 10],
      evens: [2, 4],
      sum: 15
    });
  });

  it('字典操作', async () => {
    const result = await runner.execute({
      code: `def main(vars):
    data = vars['data']
    keys = sorted(data.keys())
    values = [data[k] for k in keys]
    merged = {**data, 'added': True}
    return {'keys': keys, 'values': values, 'merged': merged}`,
      variables: { data: { b: 2, a: 1, c: 3 } }
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.keys).toEqual(['a', 'b', 'c']);
    expect(result.data?.codeReturn.merged.added).toBe(true);
  });

  it('正则表达式提取', async () => {
    const result = await runner.execute({
      code: `import re
def main(vars):
    text = vars['text']
    emails = re.findall(r'[\\w.]+@[\\w.]+', text)
    phones = re.findall(r'\\d{3}-\\d{4}-\\d{4}', text)
    return {'emails': emails, 'phones': phones}`,
      variables: { text: 'Contact: test@example.com or 138-1234-5678' }
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.emails).toEqual(['test@example.com']);
    expect(result.data?.codeReturn.phones).toEqual(['138-1234-5678']);
  });

  // ===== 标准库使用 =====

  it('datetime 日期处理', async () => {
    const result = await runner.execute({
      code: `from datetime import datetime, timedelta
def main():
    d = datetime(2024, 1, 15)
    next_week = d + timedelta(days=7)
    return {
        'formatted': d.strftime('%Y/%m/%d'),
        'day_of_week': d.weekday(),
        'next_week': next_week.strftime('%Y/%m/%d')
    }`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.formatted).toBe('2024/01/15');
    expect(result.data?.codeReturn.next_week).toBe('2024/01/22');
  });

  it('json 处理', async () => {
    const result = await runner.execute({
      code: `import json
def main(vars):
    obj = json.loads(vars['jsonStr'])
    obj['added'] = True
    return obj`,
      variables: { jsonStr: '{"name":"test","value":42}' }
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn).toEqual({ name: 'test', value: 42, added: true });
  });

  it('hashlib 哈希计算', async () => {
    const result = await runner.execute({
      code: `import hashlib
def main():
    h = hashlib.sha256(b'hello').hexdigest()
    return {'hash': h}`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.hash).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
    );
  });

  it('collections 使用', async () => {
    const result = await runner.execute({
      code: `from collections import Counter
def main(vars):
    c = Counter(vars['items'])
    return dict(c.most_common())`,
      variables: { items: ['a', 'b', 'a', 'c', 'a', 'b'] }
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.a).toBe(3);
    expect(result.data?.codeReturn.b).toBe(2);
  });

  // ===== SystemHelper 使用 =====

  it('count_token 计算', async () => {
    const result = await runner.execute({
      code: `def main(vars):
    return {'tokens': system_helper.count_token(vars['text'])}`,
      variables: { text: 'Hello, this is a test sentence.' }
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.tokens).toBeGreaterThan(0);
  });

  it('str_to_base64 编码', async () => {
    const result = await runner.execute({
      code: `def main():
    return {'encoded': system_helper.str_to_base64('hello')}`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.encoded).toBe(Buffer.from('hello').toString('base64'));
  });

  it('文件读写', async () => {
    const result = await runner.execute({
      code: `def main():
    system_helper.fs.write_file('test.txt', 'hello world')
    content = system_helper.fs.read_file('test.txt')
    return {'content': content, 'exists': system_helper.fs.exists('test.txt')}`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.content).toBe('hello world');
    expect(result.data?.codeReturn.exists).toBe(true);
  });

  // ===== 多种 main 签名 =====

  it('main() 无参数', async () => {
    const result = await runner.execute({
      code: `def main():
    return {'ok': True}`,
      variables: { unused: 1 }
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.ok).toBe(true);
  });

  it('main(a, b) 多参数展开', async () => {
    const result = await runner.execute({
      code: `def main(name, age):
    return {'name': name, 'age': age}`,
      variables: { name: 'test', age: 25 }
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn).toEqual({ name: 'test', age: 25 });
  });

  // ===== 错误代码样例 =====

  it('访问未定义变量', async () => {
    const result = await runner.execute({
      code: `def main():
    return {'value': undefined_var}`,
      variables: {}
    });
    expect(result.success).toBe(false);
  });

  it('无限递归', async () => {
    const result = await runner.execute({
      code: `def recurse():
    return recurse()
def main():
    return recurse()`,
      variables: {}
    });
    expect(result.success).toBe(false);
  });

  it('类型错误', async () => {
    const result = await runner.execute({
      code: `def main():
    x = None
    return {'value': x['property']}`,
      variables: {}
    });
    expect(result.success).toBe(false);
  });

  it('除零错误', async () => {
    const result = await runner.execute({
      code: `def main():
    return {'value': 1 / 0}`,
      variables: {}
    });
    expect(result.success).toBe(false);
  });

  it('索引越界', async () => {
    const result = await runner.execute({
      code: `def main():
    arr = [1, 2, 3]
    return {'value': arr[10]}`,
      variables: {}
    });
    expect(result.success).toBe(false);
  });
});
