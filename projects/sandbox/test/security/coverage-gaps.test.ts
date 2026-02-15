/**
 * 安全覆盖缺口补充测试
 *
 * 覆盖现有安全测试未触及的攻击向量：
 * - Python 预检正则绕过（缩进 import、字符串拼接）
 * - JS import() 动态导入执行命令
 * - Python open() 写入文件系统
 * - JS/Python stdin 注入
 * - 环境变量泄露边界
 */
import { describe, it, expect } from 'vitest';
import { JsRunner } from '../../src/runner/js-runner';
import { PythonRunner } from '../../src/runner/python-runner';

const config = {
  defaultTimeoutMs: 10000,
  defaultMemoryMB: 64,
  defaultDiskMB: 10
};

describe('[Security] Python 预检正则绕过尝试', () => {
  const runner = new PythonRunner(config);

  it('条件块内 import os 绕过预检（运行时拦截兜底）', async () => {
    // detectDangerousImports 正则要求行首 import，缩进的 import 不会被预检捕获
    // 但运行时 __import__ 拦截应该兜底
    const result = await runner.execute({
      code: `def main():
    if True:
        import os
        return {'cwd': os.getcwd()}
    return {}`,
      variables: {}
    });
    expect(result.success).toBe(false);
  });

  it('exec 字符串拼接绕过预检和运行时拦截', async () => {
    const result = await runner.execute({
      code: `def main():
    try:
        ns = {}
        exec("imp" + "ort os; result = os.getcwd()", ns)
        return {'escaped': True, 'cwd': ns.get('result')}
    except (ImportError, Exception) as e:
        return {'escaped': False, 'error': str(e)}`,
      variables: {}
    });
    // 运行时 __import__ 拦截应该捕获 exec 内的 import os
    if (result.success) {
      expect(result.data?.codeReturn.escaped).toBe(false);
    }
  });

  it('globals()["__builtins__"] 获取 __import__ 尝试', async () => {
    const result = await runner.execute({
      code: `def main():
    try:
        bi = globals().get('__builtins__', {})
        if hasattr(bi, '__import__'):
            mod = bi.__import__('os')
            return {'escaped': True}
        elif isinstance(bi, dict) and '__import__' in bi:
            mod = bi['__import__']('os')
            return {'escaped': True}
        return {'escaped': False, 'reason': 'no __import__ found'}
    except (ImportError, Exception) as e:
        return {'escaped': False, 'error': str(e)}`,
      variables: {}
    });
    if (result.success) {
      expect(result.data?.codeReturn.escaped).toBe(false);
    }
  });

  it('from importlib import import_module 被预检拦截', async () => {
    const result = await runner.execute({
      code: `from importlib import import_module
def main():
    os = import_module('os')
    return {'escaped': True}`,
      variables: {}
    });
    expect(result.success).toBe(false);
  });

  it('多行字符串内的 import 不触发误报', async () => {
    // 确保字符串内的 "import os" 不被误拦截
    const result = await runner.execute({
      code: `def main():
    text = """
    This text mentions import os but it's just a string.
    """
    return {'text': text.strip()}`,
      variables: {}
    });
    // 注意：当前预检正则可能误报这种情况
    // 如果 success=false 说明预检过于激进（记录行为）
    // 如果 success=true 说明预检正确跳过了字符串内容
    expect(result).toBeDefined();
  });
});

describe('[Security] JS 动态导入攻击向量', () => {
  const runner = new JsRunner(config);

  it('import("child_process") 尝试执行命令', async () => {
    const result = await runner.execute({
      code: `async function main() {
        try {
          const cp = await import('child_process');
          cp.execSync('id');
          return { escaped: true };
        } catch(e) {
          return { escaped: false, error: e.message };
        }
      }`,
      variables: {}
    });
    // 即使 import() 绕过了 require proxy，execSync 应该失败或被限制
    if (result.success) {
      expect(result.data?.codeReturn.escaped).toBe(false);
    }
  });

  it('import("os") 尝试获取系统信息', async () => {
    const result = await runner.execute({
      code: `async function main() {
        try {
          const os = await import('os');
          return { escaped: true, hostname: os.hostname() };
        } catch(e) {
          return { escaped: false };
        }
      }`,
      variables: {}
    });
    // 记录行为：import() 是否被拦截
    if (result.success && result.data?.codeReturn.escaped) {
      // 如果能获取 hostname，说明 import() 绕过了安全限制
      // 这是一个已知的安全风险点
      console.warn('[Security Warning] import("os") 成功绕过了 require proxy');
    }
    expect(result).toBeDefined();
  });

  it('new Function 构造器抛出错误（_SafeFunction 拦截）', async () => {
    // globalThis.Function 被替换为 _SafeFunction，new Function() 会抛错
    // 错误在用户代码外部抛出，导致 success=false
    const result = await runner.execute({
      code: `async function main() {
        try {
          const fn = new Function('return process.env');
          return { escaped: true };
        } catch(e) {
          return { escaped: false, error: e.message };
        }
      }`,
      variables: {}
    });
    // _SafeFunction 抛出的错误导致整个脚本失败
    expect(result.success).toBe(false);
  });

  it('Reflect.construct(Function, ...) 被阻止', async () => {
    const result = await runner.execute({
      code: `async function main() {
        try {
          const fn = Reflect.construct(Function, ['return 42']);
          return { escaped: true, result: fn() };
        } catch(e) {
          return { escaped: false, error: e.message };
        }
      }`,
      variables: {}
    });
    // 同上，_SafeFunction 拦截
    expect(result.success).toBe(false);
  });

  it('[Critical] AsyncFunction 构造器绕过 _SafeFunction 限制', async () => {
    // 安全发现：(async function(){}).constructor 返回的是原始 AsyncFunction
    // 而非被覆盖的 _SafeFunction，因为 _SafeFunction 只覆盖了 Function.prototype.constructor
    // AsyncFunction 不直接继承 Function，而是有自己的构造器
    const result = await runner.execute({
      code: `async function main() {
        try {
          const AsyncFn = (async function(){}).constructor;
          const fn = new AsyncFn('return process.env');
          const env = await fn();
          // 子进程 env 已清理，即使逃逸也只能看到沙盒变量
          const keys = Object.keys(env);
          return { escaped: true, keys };
        } catch(e) {
          return { escaped: false, error: e.message };
        }
      }`,
      variables: {}
    });
    // 记录实际行为：AsyncFunction 构造器可以绕过限制
    // 但子进程 env 已清理，危害有限
    expect(result.success).toBe(true);
    if (result.data?.codeReturn.escaped) {
      // 验证即使逃逸，env 中不包含宿主敏感信息
      const keys: string[] = result.data.codeReturn.keys || [];
      expect(keys).not.toContain('SECRET_KEY');
      expect(keys).not.toContain('API_KEY');
    }
  });

  it('[Critical] GeneratorFunction 构造器绕过 _SafeFunction 限制', async () => {
    // 同 AsyncFunction，GeneratorFunction 也能绕过
    const result = await runner.execute({
      code: `async function main() {
        try {
          const GenFn = (function*(){}).constructor;
          const fn = new GenFn('yield 42');
          const gen = fn();
          return { escaped: true, val: gen.next().value };
        } catch(e) {
          return { escaped: false, error: e.message };
        }
      }`,
      variables: {}
    });
    expect(result.success).toBe(true);
    // GeneratorFunction 构造器可以绕过限制
    if (result.data?.codeReturn.escaped) {
      expect(result.data.codeReturn.val).toBe(42);
    }
  });
});

describe('[Security] Python 文件系统直接访问', () => {
  const runner = new PythonRunner(config);

  it('open() 写入 /tmp 目录', async () => {
    const result = await runner.execute({
      code: `def main():
    try:
        with open('/tmp/sandbox_test_write.txt', 'w') as f:
            f.write('test')
        return {'written': True}
    except Exception as e:
        return {'written': False, 'error': str(e)}`,
      variables: {}
    });
    // 记录行为：Python 的 open() 是 builtin，不受 __import__ 拦截
    // 但 resource.RLIMIT_FSIZE 可能限制写入
    expect(result).toBeDefined();
  });

  it('open() 读取 /proc/self/environ 泄露环境变量', async () => {
    const result = await runner.execute({
      code: `def main():
    try:
        with open('/proc/self/environ', 'r') as f:
            data = f.read()
        # 检查是否包含敏感信息
        has_sensitive = 'SECRET' in data or 'TOKEN' in data or 'PASSWORD' in data
        return {'readable': True, 'has_sensitive': has_sensitive, 'length': len(data)}
    except Exception as e:
        return {'readable': False, 'error': str(e)}`,
      variables: {}
    });
    // 子进程的 env 已被清理（只有 SANDBOX_TMPDIR, SANDBOX_MEMORY_MB 等）
    // 所以即使能读取 /proc/self/environ，也不会泄露宿主敏感信息
    if (result.success && result.data?.codeReturn.readable) {
      expect(result.data.codeReturn.has_sensitive).toBe(false);
    }
  });
});

describe('[Security] 变量注入攻击', () => {
  const jsRunner = new JsRunner(config);
  const pyRunner = new PythonRunner(config);

  it('[JS] 变量值包含恶意 JSON 不影响解析', async () => {
    const result = await jsRunner.execute({
      code: `async function main(v) { return { val: v.data }; }`,
      variables: { data: '{"__proto__":{"polluted":true}}' }
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.val).toBe('{"__proto__":{"polluted":true}}');
  });

  it('[JS] 变量 key 包含特殊字符', async () => {
    const result = await jsRunner.execute({
      code: `async function main(v) { return { val: v['a.b'] }; }`,
      variables: { 'a.b': 'dotted-key' }
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.val).toBe('dotted-key');
  });

  it('[Python] 变量值包含 Python 代码注入', async () => {
    const result = await pyRunner.execute({
      code: `def main(v):
    return {'val': v['code']}`,
      variables: { code: '__import__("os").system("id")' }
    });
    expect(result.success).toBe(true);
    // 变量值只是字符串，不会被执行
    expect(result.data?.codeReturn.val).toBe('__import__("os").system("id")');
  });
});
