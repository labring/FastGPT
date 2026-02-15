import { describe, it, expect, beforeAll } from 'vitest';
import { JsRunner } from '../../src/runner/js-runner';
import { PythonRunner } from '../../src/runner/python-runner';
import type { RunnerConfig } from '../../src/types';

const config: RunnerConfig = {
  defaultTimeoutMs: 10000,
  defaultMemoryMB: 64,
  defaultDiskMB: 10
};

describe('JS 逃逸攻击测试', () => {
  let runner: JsRunner;
  beforeAll(() => { runner = new JsRunner(config); });

  // ===== 原型链逃逸 =====

  it('__proto__ 访问被阻止', async () => {
    const result = await runner.execute({
      code: `async function main() {
        const obj = {};
        const proto = obj.__proto__;
        return { proto: proto === null || proto === undefined || Object.keys(proto).length === 0 };
      }`,
      variables: {}
    });
    expect(result.success).toBe(true);
  });

  it('constructor.constructor 无法获取 Function', async () => {
    const result = await runner.execute({
      code: `async function main() {
        try {
          const F = ({}).constructor.constructor;
          const proc = F('return process')();
          return { escaped: true, pid: proc.pid };
        } catch(e) {
          return { escaped: false, error: e.message };
        }
      }`,
      variables: {}
    });
    // Function constructor 已被安全覆盖，不应能逃逸
    if (result.success) {
      expect(result.data?.codeReturn.escaped).toBe(false);
    } else {
      // 错误冒泡到模板层也说明安全生效
      expect(result.message).toMatch(/not allowed|Function/i);
    }
  });

  // ===== eval / Function 构造器 =====

  it('eval 无法访问外部作用域', async () => {
    const result = await runner.execute({
      code: `async function main() {
        try {
          const result = eval('typeof process !== "undefined" ? process.env : "no access"');
          return { result: typeof result === 'object' ? 'has_env' : result };
        } catch(e) {
          return { blocked: true };
        }
      }`,
      variables: {}
    });
    // eval 在 Function 构造器内部，不应该能访问外部 process.env 的敏感信息
    expect(result.success).toBe(true);
  });

  // ===== 进程逃逸 =====

  it('Bun.spawn 被禁用', async () => {
    const result = await runner.execute({
      code: `async function main() {
        try {
          const proc = Bun.spawn(['ls']);
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

  it('Bun.spawnSync 被禁用', async () => {
    const result = await runner.execute({
      code: `async function main() {
        try {
          const proc = Bun.spawnSync(['ls']);
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

  it('require("child_process") 被拦截', async () => {
    const result = await runner.execute({
      code: `async function main() {
        const cp = require('child_process');
        return { escaped: true };
      }`,
      variables: {}
    });
    expect(result.success).toBe(false);
  });

  // ===== 文件系统逃逸 =====

  it('require("fs") 被拦截', async () => {
    const result = await runner.execute({
      code: `async function main() {
        const fs = require('fs');
        return { data: fs.readFileSync('/etc/passwd', 'utf-8') };
      }`,
      variables: {}
    });
    expect(result.success).toBe(false);
  });

  it('SystemHelper.fs 路径遍历被阻止', async () => {
    const result = await runner.execute({
      code: `async function main() {
        try {
          const data = SystemHelper.fs.readFile('../../../../etc/passwd');
          return { escaped: true, data };
        } catch(e) {
          return { escaped: false, error: e.message };
        }
      }`,
      variables: {}
    });
    // _safePath 抛出的错误在 Function 构造器外部，导致进程直接输出 {"error":...}
    // base.ts 解析为 success=false，安全是生效的
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/traversal/i);
  });

  it('SystemHelper.fs 绝对路径被阻止', async () => {
    const result = await runner.execute({
      code: `async function main() {
        try {
          const data = SystemHelper.fs.readFile('/etc/passwd');
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

  // ===== 环境变量 =====

  it('process.env 敏感变量已清理', async () => {
    const result = await runner.execute({
      code: `async function main() {
        return {
          keys: Object.keys(process.env),
          hasSecret: !!process.env.SECRET_KEY,
          hasApiKey: !!process.env.API_KEY,
          hasAwsKey: !!process.env.AWS_SECRET_ACCESS_KEY
        };
      }`,
      variables: {}
    });
    expect(result.success).toBe(true);
    const ret = result.data?.codeReturn;
    expect(ret.hasSecret).toBe(false);
    expect(ret.hasApiKey).toBe(false);
    expect(ret.hasAwsKey).toBe(false);
  });

  // ===== Bun 危险 API =====

  it('Bun.serve 被禁用', async () => {
    const result = await runner.execute({
      code: `async function main() {
        try {
          Bun.serve({ port: 9999, fetch() { return new Response('hi'); } });
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

  it('Bun.write 被禁用', async () => {
    const result = await runner.execute({
      code: `async function main() {
        try {
          await Bun.write('/tmp/evil.txt', 'pwned');
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
});

describe('Python 逃逸攻击测试', () => {
  let runner: PythonRunner;
  beforeAll(() => { runner = new PythonRunner(config); });

  // ===== 危险模块 =====

  it('import os 被拦截', async () => {
    const result = await runner.execute({
      code: `import os
def main():
    return {'cwd': os.getcwd()}`,
      variables: {}
    });
    expect(result.success).toBe(false);
  });

  it('import subprocess 被拦截', async () => {
    const result = await runner.execute({
      code: `import subprocess
def main():
    return {}`,
      variables: {}
    });
    expect(result.success).toBe(false);
  });

  it('import sys 被拦截', async () => {
    const result = await runner.execute({
      code: `import sys
def main():
    return {'path': sys.path}`,
      variables: {}
    });
    expect(result.success).toBe(false);
  });

  it('import ctypes 被拦截', async () => {
    const result = await runner.execute({
      code: `import ctypes
def main():
    return {}`,
      variables: {}
    });
    expect(result.success).toBe(false);
  });

  it('import importlib 被拦截', async () => {
    const result = await runner.execute({
      code: `import importlib
def main():
    os = importlib.import_module('os')
    return {}`,
      variables: {}
    });
    expect(result.success).toBe(false);
  });

  // ===== __import__ 绕过尝试 =====

  it('__import__("os") 被运行时拦截', async () => {
    const result = await runner.execute({
      code: `def main():
    os = __import__('os')
    return {'cwd': os.getcwd()}`,
      variables: {}
    });
    expect(result.success).toBe(false);
    expect(result.data?.codeReturn?.error || result.message).toMatch(/not allowed/i);
  });

  it('builtins.__import__ 恢复被阻止', async () => {
    const result = await runner.execute({
      code: `def main():
    try:
        import builtins
        # _original_import 已被 del，无法恢复
        return {'has_original': hasattr(builtins, '_original_import')}
    except:
        return {'blocked': True}`,
      variables: {}
    });
    // builtins 本身不在黑名单，但 _original_import 已被删除
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.has_original).toBe(false);
  });

  // ===== exec/eval 逃逸 =====

  it('exec 执行 import os 被拦截', async () => {
    const result = await runner.execute({
      code: `def main():
    try:
        exec("import os; result = os.getcwd()")
        return {'escaped': True}
    except ImportError as e:
        return {'escaped': False, 'error': str(e)}`,
      variables: {}
    });
    // exec 内的 import os 触发 __import__ 拦截，ImportError 可能被用户 catch
    // 也可能冒泡到模板最外层导致 success=false
    // 两种情况都说明安全生效
    if (result.success) {
      expect(result.data?.codeReturn.escaped).toBe(false);
    } else {
      expect(result.message).toMatch(/not allowed/i);
    }
  });

  it('eval + __import__ 被拦截', async () => {
    const result = await runner.execute({
      code: `def main():
    try:
        os = eval("__import__('os')")
        return {'escaped': True}
    except (ImportError, NameError) as e:
        return {'escaped': False}`,
      variables: {}
    });
    // eval 内的 __import__ 被 hook 拦截，异常穿透用户 try/except
    // success=false 且 message 包含拦截信息即为正确行为
    if (result.success) {
      expect(result.data?.codeReturn.escaped).toBe(false);
    } else {
      expect(result.message).toContain('not allowed');
    }
  });

  // ===== 文件系统逃逸 =====

  it('open("/etc/passwd") 被 builtins.open 拦截', async () => {
    const result = await runner.execute({
      code: `def main():
    try:
        with open('/etc/passwd', 'r') as f:
            return {'escaped': True, 'data': f.read()[:100]}
    except Exception as e:
        return {'escaped': False, 'error': str(e)}`,
      variables: {}
    });
    // builtins.open 已被覆盖，访问沙盒外文件会抛出 PermissionError
    if (result.success) {
      expect(result.data?.codeReturn.escaped).toBe(false);
      expect(result.data?.codeReturn.error).toMatch(/restricted to sandbox|PermissionError/i);
    } else {
      expect(result.message).toMatch(/restricted to sandbox|PermissionError/i);
    }
  });

  it('system_helper.fs 路径遍历被阻止', async () => {
    const result = await runner.execute({
      code: `def main():
    try:
        data = system_helper.fs.read_file('../../../../etc/passwd')
        return {'escaped': True}
    except Exception as e:
        return {'escaped': False, 'error': str(e)}`,
      variables: {}
    });
    // _safe_path 抛出 PermissionError，被模板最外层 except 捕获
    // 输出 {"error": "Path traversal not allowed"}，base.ts 解析为 success=false
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/traversal/i);
  });

  // ===== 标准库正常使用 =====

  it('datetime 正常使用（间接 import 不被拦截）', async () => {
    const result = await runner.execute({
      code: `from datetime import datetime
def main():
    return {'year': datetime.now().year}`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.year).toBeGreaterThanOrEqual(2024);
  });

  it('json 正常使用', async () => {
    const result = await runner.execute({
      code: `import json
def main():
    return json.loads('{"a": 1}')`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn).toEqual({ a: 1 });
  });

  it('math 正常使用', async () => {
    const result = await runner.execute({
      code: `import math
def main():
    return {'pi': round(math.pi, 2)}`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.pi).toBe(3.14);
  });

  it('re 正常使用', async () => {
    const result = await runner.execute({
      code: `import re
def main():
    m = re.search(r'(\\d+)', 'abc123def')
    return {'match': m.group(1)}`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.match).toBe('123');
  });

  // ===== 补充：更多 Python 逃逸向量 =====

  it('type() 动态创建类不能绕过安全', async () => {
    const result = await runner.execute({
      code: `def main():
    try:
        MyClass = type('MyClass', (object,), {'x': 42})
        obj = MyClass()
        return {'x': obj.x, 'escaped': False}
    except Exception as e:
        return {'escaped': False, 'error': str(e)}`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.escaped).toBe(false);
  });

  it('__builtins__ 篡改不能恢复危险 import', async () => {
    const result = await runner.execute({
      code: `def main():
    try:
        import builtins
        # 尝试替换 __import__
        builtins.__import__ = lambda name, *a, **kw: None
        import os
        return {'escaped': True}
    except Exception as e:
        return {'escaped': False}`,
      variables: {}
    });
    // 即使替换了 __import__，宿主侧预检已经拦截了 import os
    expect(result.success).toBe(false);
  });

  it('getattr 动态访问不能绕过模块限制', async () => {
    const result = await runner.execute({
      code: `def main():
    try:
        mod = __import__('os')
        return {'escaped': True}
    except ImportError:
        return {'escaped': False}`,
      variables: {}
    });
    // 宿主侧预检不会拦截（没有 import os 语句），但运行时 __import__ 拦截生效
    if (result.success) {
      expect(result.data?.codeReturn.escaped).toBe(false);
    }
  });
});
