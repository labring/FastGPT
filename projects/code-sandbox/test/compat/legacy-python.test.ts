/**
 * 旧版 Python 代码兼容性测试
 *
 * 旧 Python 长驻 worker 已被移除；这批旧代码用例必须继续跑过
 * PythonIsolatedRunner，证明新执行器可以接住历史 Python Code 节点。
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ExecuteOptions, ExecuteResult } from '../../src/types';
import { PythonIsolatedRunner } from '../../src/isolated/python-isolated-runner';

type PythonRunner = {
  execute(options: ExecuteOptions): Promise<ExecuteResult>;
};

function legacyPythonCompatibilitySuite(name: string, getRunner: () => PythonRunner) {
  describe(name, () => {
    it('main(variables) 单参数字典写法', async () => {
      const result = await getRunner().execute({
        code: `def main(variables):
    return {"name": variables["name"], "age": variables["age"]}`,
        variables: { name: 'FastGPT', age: 3 }
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn).toEqual({ name: 'FastGPT', age: 3 });
    });

    it('main(a, b) 多参数展开写法', async () => {
      const result = await getRunner().execute({
        code: `def main(a, b):
    return {"sum": a + b}`,
        variables: { a: 10, b: 20 }
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.sum).toBe(30);
    });

    it('main(a, b, c) 三参数展开', async () => {
      const result = await getRunner().execute({
        code: `def main(a, b, c):
    return {"result": a * b + c}`,
        variables: { a: 3, b: 4, c: 5 }
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.result).toBe(17);
    });

    it('main() 无参数写法', async () => {
      const result = await getRunner().execute({
        code: `def main():
    return {"ok": True}`,
        variables: {}
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.ok).toBe(true);
    });

    it('旧版写法：main 外部直接访问全局变量', async () => {
      const result = await getRunner().execute({
        code: `prefix = name + "_suffix"
def main(name, age):
    return {"result": prefix, "name": name, "age": age}`,
        variables: { name: 'hello', age: 18 }
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.result).toBe('hello_suffix');
      expect(result.data?.codeReturn.name).toBe('hello');
      expect(result.data?.codeReturn.age).toBe(18);
    });

    it('旧版写法：无参 main 通过全局变量访问', async () => {
      const result = await getRunner().execute({
        code: `def main():
    return {"name": name, "age": age}`,
        variables: { name: 'test', age: 25 }
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn).toEqual({ name: 'test', age: 25 });
    });

    it('main 带默认参数', async () => {
      const result = await getRunner().execute({
        code: `def main(name, greeting="Hello"):
    return {"msg": f"{greeting}, {name}!"}`,
        variables: { name: 'World' }
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.msg).toBe('Hello, World!');
    });

    it('main 前置命名参数缺失但有默认值，后置参数仍按 kwargs 注入', async () => {
      const result = await getRunner().execute({
        code: `def main(a=None, b=None):
    return {"a": a if a else "无", "b": b if b else "无"}`,
        variables: { b: 'd2' }
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn).toEqual({ a: '无', b: 'd2' });
    });

    it('返回列表（旧版常见）', async () => {
      const result = await getRunner().execute({
        code: `def main(variables):
    return [variables["a"], variables["b"], variables["a"] + variables["b"]]`,
        variables: { a: 1, b: 2 }
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn).toEqual([1, 2, 3]);
    });

    it('返回嵌套字典', async () => {
      const result = await getRunner().execute({
        code: `def main(variables):
    return {
        "user": {"name": variables["name"], "tags": ["admin"]},
        "count": 42
    }`,
        variables: { name: 'test' }
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.user.name).toBe('test');
      expect(result.data?.codeReturn.count).toBe(42);
    });

    it('返回布尔值和 None 转换', async () => {
      const result = await getRunner().execute({
        code: `def main(variables):
    return {"active": True, "deleted": False, "extra": None}`,
        variables: {}
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.active).toBe(true);
      expect(result.data?.codeReturn.deleted).toBe(false);
      expect(result.data?.codeReturn.extra).toBeNull();
    });

    it('print 输出收集到 log（不影响返回值）', async () => {
      const result = await getRunner().execute({
        code: `def main(variables):
    print("debug step 1")
    print("processing", variables["name"])
    return {"done": True}`,
        variables: { name: 'test' }
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.done).toBe(true);
      expect(result.data?.log).toContain('debug step 1');
      expect(result.data?.log).toContain('processing');
    });

    it('import os 被拦截', async () => {
      const result = await getRunner().execute({
        code: `import os
def main():
    return {"cwd": os.getcwd()}`,
        variables: {}
      });
      expect(result.success).toBe(false);
      expect(result.message).toContain('os');
    });

    it('import subprocess 被拦截', async () => {
      const result = await getRunner().execute({
        code: `import subprocess
def main():
    return {"out": subprocess.check_output(["ls"])}`,
        variables: {}
      });
      expect(result.success).toBe(false);
      expect(result.message).toContain('subprocess');
    });

    it('from sys import path 被拦截', async () => {
      const result = await getRunner().execute({
        code: `from sys import path
def main():
    return {"path": path}`,
        variables: {}
      });
      expect(result.success).toBe(false);
      expect(result.message).toContain('sys');
    });

    it('import json 允许', async () => {
      const result = await getRunner().execute({
        code: `import json
def main(variables):
    data = json.dumps(variables)
    parsed = json.loads(data)
    return {"parsed": parsed}`,
        variables: { key: 'value' }
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.parsed).toEqual({ key: 'value' });
    });

    it('import math 允许', async () => {
      const result = await getRunner().execute({
        code: `import math
def main(variables):
    return {"sqrt": math.sqrt(variables["n"]), "pi": round(math.pi, 4)}`,
        variables: { n: 16 }
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.sqrt).toBe(4);
      expect(result.data?.codeReturn.pi).toBe(3.1416);
    });

    it('import re 允许', async () => {
      const result = await getRunner().execute({
        code: `import re
def main(variables):
    matches = re.findall(r'\\d+', variables["text"])
    return {"numbers": matches}`,
        variables: { text: 'abc123def456' }
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.numbers).toEqual(['123', '456']);
    });

    it('旧版典型写法：数据过滤', async () => {
      const result = await getRunner().execute({
        code: `def main(variables):
    items = variables["items"]
    filtered = [x for x in items if x["score"] >= 60]
    return {"passed": len(filtered), "total": len(items)}`,
        variables: {
          items: [
            { name: 'A', score: 80 },
            { name: 'B', score: 45 },
            { name: 'C', score: 90 },
            { name: 'D', score: 55 }
          ]
        }
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn).toEqual({ passed: 2, total: 4 });
    });

    it('旧版典型写法：字符串处理', async () => {
      const result = await getRunner().execute({
        code: `def main(variables):
    text = variables["text"]
    words = text.split()
    return {
        "word_count": len(words),
        "upper": text.upper(),
        "reversed": text[::-1]
    }`,
        variables: { text: 'hello world' }
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.word_count).toBe(2);
      expect(result.data?.codeReturn.upper).toBe('HELLO WORLD');
      expect(result.data?.codeReturn.reversed).toBe('dlrow olleh');
    });

    it('旧版典型写法：日期处理', async () => {
      const result = await getRunner().execute({
        code: `from datetime import datetime, timedelta
def main(variables):
    dt = datetime.strptime(variables["date"], "%Y-%m-%d")
    next_day = dt + timedelta(days=1)
    return {"next": next_day.strftime("%Y-%m-%d"), "weekday": dt.strftime("%A")}`,
        variables: { date: '2024-01-01' }
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.next).toBe('2024-01-02');
      expect(result.data?.codeReturn.weekday).toBe('Monday');
    });

    it('旧版典型写法：辅助函数 + main', async () => {
      const result = await getRunner().execute({
        code: `def calculate_tax(amount, rate):
    return round(amount * rate, 2)

def main(variables):
    amount = variables["amount"]
    tax = calculate_tax(amount, 0.13)
    return {"amount": amount, "tax": tax, "total": amount + tax}`,
        variables: { amount: 100 }
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn).toEqual({ amount: 100, tax: 13, total: 113 });
    });
  });
}

describe('旧版 Python 兼容性', () => {
  describe('PythonIsolatedRunner', () => {
    let runner: PythonIsolatedRunner;

    beforeAll(async () => {
      runner = new PythonIsolatedRunner(1);
      await runner.init();
    });

    afterAll(async () => {
      await runner.shutdown();
    });

    legacyPythonCompatibilitySuite('legacy cases', () => runner);
  });
});
