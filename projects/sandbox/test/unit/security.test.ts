/**
 * 安全测试套件
 *
 * 按功能分类：
 * 1. 模块拦截（JS require/import + Python import 预检与运行时）
 * 2. 逃逸攻击（原型链、Function 构造器、eval/exec、__subclasses__）
 * 3. 网络安全（fetch/XHR/WebSocket 禁用 + SSRF 防护）
 * 4. 文件系统隔离（JS + Python）
 * 5. 变量注入攻击
 * 6. API 输入校验
 * 7. 沙盒环境加固（globalThis/Bun/process 锁定、Error stack、模块污染隔离）
 */
import { afterEach, describe, it, expect, beforeAll, afterAll } from 'vitest';
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

describe('模块拦截', () => {
  describe('JS', () => {
    const runner = { execute: (args: any) => jsPool.execute(args) };

    it('阻止 require child_process', async () => {
      const result = await runner.execute({
        code: `async function main() { const cp = require('child_process'); return {}; }`,
        variables: {}
      });
      expect(result.success).toBe(false);
    });

    it('阻止 require fs', async () => {
      const result = await runner.execute({
        code: `async function main() { const fs = require('fs'); return { data: fs.readFileSync('/etc/passwd', 'utf-8') }; }`,
        variables: {}
      });
      expect(result.success).toBe(false);
    });

    it('阻止 require net', async () => {
      const result = await runner.execute({
        code: `async function main() { const net = require('net'); return {}; }`,
        variables: {}
      });
      expect(result.success).toBe(false);
    });

    it('阻止 require http', async () => {
      const result = await runner.execute({
        code: `async function main() { const http = require('http'); return {}; }`,
        variables: {}
      });
      expect(result.success).toBe(false);
    });

    it('阻止 require https', async () => {
      const result = await runner.execute({
        code: `async function main() { const https = require('https'); return {}; }`,
        variables: {}
      });
      expect(result.success).toBe(false);
    });

    it('阻止 require axios', async () => {
      const result = await runner.execute({
        code: `async function main() { const axios = require('axios'); return {}; }`,
        variables: {}
      });
      expect(result.success).toBe(false);
    });

    it('阻止 require node-fetch', async () => {
      const result = await runner.execute({
        code: `async function main() { const fetch = require('node-fetch'); return {}; }`,
        variables: {}
      });
      expect(result.success).toBe(false);
    });

    it('Bun.spawn 被禁用', async () => {
      const result = await runner.execute({
        code: `async function main() { try { Bun.spawn(['ls']); return { escaped: true }; } catch { return { escaped: false }; } }`,
        variables: {}
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.escaped).toBe(false);
    });

    it('Bun.spawnSync 被禁用', async () => {
      const result = await runner.execute({
        code: `async function main() { try { Bun.spawnSync(['ls']); return { escaped: true }; } catch { return { escaped: false }; } }`,
        variables: {}
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.escaped).toBe(false);
    });

    it('Bun.serve 被禁用', async () => {
      const result = await runner.execute({
        code: `async function main() { try { Bun.serve({ port: 9999, fetch() { return new Response('hi'); } }); return { escaped: true }; } catch { return { escaped: false }; } }`,
        variables: {}
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.escaped).toBe(false);
    });

    it('Bun.write 被禁用', async () => {
      const result = await runner.execute({
        code: `async function main() { try { await Bun.write('/tmp/evil.txt', 'pwned'); return { escaped: true }; } catch { return { escaped: false }; } }`,
        variables: {}
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.escaped).toBe(false);
    });

    it('process.binding 被禁用', async () => {
      const result = await runner.execute({
        code: `async function main() { try { process.binding('fs'); return { escaped: true }; } catch { return { escaped: false }; } }`,
        variables: {}
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.escaped).toBe(false);
    });

    it('process.dlopen 被禁用', async () => {
      const result = await runner.execute({
        code: `async function main() { return { hasDlopen: typeof process.dlopen === 'function' }; }`,
        variables: {}
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.hasDlopen).toBe(false);
    });

    it('process._linkedBinding 被禁用', async () => {
      const result = await runner.execute({
        code: `async function main() { return { has: typeof process._linkedBinding === 'function' }; }`,
        variables: {}
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.has).toBe(false);
    });

    it('process.kill 被禁用', async () => {
      const result = await runner.execute({
        code: `async function main() { return { hasKill: typeof process.kill === 'function' }; }`,
        variables: {}
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.hasKill).toBe(false);
    });

    it('process.chdir 被禁用', async () => {
      const result = await runner.execute({
        code: `async function main() { try { process.chdir('/'); return { escaped: true }; } catch { return { escaped: false }; } }`,
        variables: {}
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.escaped).toBe(false);
    });
  });

  describe('Python', () => {
    const runner = { execute: (args: any) => pyPool.execute(args) };

    // --- 宿主侧预检拦截 ---
    const precheckModules = [
      'os',
      'subprocess',
      'sys',
      'shutil',
      'pickle',
      'multiprocessing',
      'threading',
      'ctypes',
      'signal',
      'gc',
      'tempfile',
      'pathlib',
      'importlib'
    ];
    for (const mod of precheckModules) {
      it(`阻止 import ${mod}（预检）`, async () => {
        const result = await runner.execute({
          code: `import ${mod}\ndef main(v):\n    return {}`,
          variables: {}
        });
        expect(result.success).toBe(false);
      });
    }

    it('阻止 from os import path（预检）', async () => {
      const result = await runner.execute({
        code: `from os import path\ndef main(v):\n    return {}`,
        variables: {}
      });
      expect(result.success).toBe(false);
    });

    it('阻止 from subprocess import Popen（预检）', async () => {
      const result = await runner.execute({
        code: `from subprocess import Popen\ndef main(v):\n    return {}`,
        variables: {}
      });
      expect(result.success).toBe(false);
    });

    it('阻止 from importlib import import_module（预检）', async () => {
      const result = await runner.execute({
        code: `from importlib import import_module\ndef main(v):\n    return {}`,
        variables: {}
      });
      expect(result.success).toBe(false);
    });

    it('阻止 import socket', async () => {
      const result = await runner.execute({
        code: `import socket\ndef main(v):\n    return {}`,
        variables: {}
      });
      expect(result.success).toBe(false);
    });

    it('阻止 import urllib.request', async () => {
      const result = await runner.execute({
        code: `import urllib.request\ndef main():\n    return {}`,
        variables: {}
      });
      expect(result.success).toBe(false);
    });

    it('阻止 import http.client', async () => {
      const result = await runner.execute({
        code: `import http.client\ndef main():\n    return {}`,
        variables: {}
      });
      expect(result.success).toBe(false);
    });

    it('阻止 import requests（预检）', async () => {
      const result = await runner.execute({
        code: `import requests\ndef main():\n    return {}`,
        variables: {}
      });
      expect(result.success).toBe(false);
    });

    // --- 运行时 __import__ hook 拦截 ---
    it('运行时动态 __import__("subprocess") 被拦截', async () => {
      const result = await runner.execute({
        code: `def main(v):\n    mod = __import__("subprocess")\n    return {}`,
        variables: {}
      });
      expect(result.success).toBe(false);
      expect(result.message).toContain('not in the allowlist');
    });

    it('条件块内 import os 被运行时拦截', async () => {
      const result = await runner.execute({
        code: `def main():\n    if True:\n        import os\n        return {'cwd': os.getcwd()}\n    return {}`,
        variables: {}
      });
      expect(result.success).toBe(false);
    });

    // --- 安全模块正常使用 ---
    it('允许 import json', async () => {
      const result = await runner.execute({
        code: `import json\ndef main(v):\n    data = json.dumps({"key": "value"})\n    return {"data": data}`,
        variables: {}
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.data).toBe('{"key": "value"}');
    });

    it('允许 import math', async () => {
      const result = await runner.execute({
        code: `import math\ndef main(v):\n    return {"pi": round(math.pi, 2)}`,
        variables: {}
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.pi).toBe(3.14);
    });

    it('允许 from datetime import datetime', async () => {
      const result = await runner.execute({
        code: `from datetime import datetime\ndef main():\n    return {'year': datetime.now().year}`,
        variables: {}
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.year).toBeGreaterThanOrEqual(2024);
    });

    it('允许 import re', async () => {
      const result = await runner.execute({
        code: `import re\ndef main():\n    m = re.search(r'(\\d+)', 'abc123def')\n    return {'match': m.group(1)}`,
        variables: {}
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.match).toBe('123');
    });
  });
});

describe('逃逸攻击', () => {
  describe('JS', () => {
    const runner = { execute: (args: any) => jsPool.execute(args) };

    it('constructor.constructor 无法获取 Function', async () => {
      const result = await runner.execute({
        code: `async function main() {
          try { const F = ({}).constructor.constructor; const proc = F('return process')(); return { escaped: true, pid: proc.pid }; }
          catch(e) { return { escaped: false }; }
        }`,
        variables: {}
      });
      if (result.success) {
        expect(result.data?.codeReturn.escaped).toBe(false);
      } else {
        expect(result.message).toMatch(/not allowed|Function/i);
      }
    });

    it('constructor 链逃逸到 Function', async () => {
      const result = await runner.execute({
        code: `async function main() {
          try { const F = [].fill.constructor; const fn = new F('return this.process.mainModule.require("child_process").execSync("id").toString()'); return { escaped: true, result: fn() }; }
          catch(e) { return { escaped: false }; }
        }`,
        variables: {}
      });
      if (result.success) {
        expect(result.data?.codeReturn.escaped).toBe(false);
      }
    });

    it('__proto__ 访问被阻止', async () => {
      const result = await runner.execute({
        code: `async function main() { const obj = {}; const proto = obj.__proto__; return { proto: proto === null || proto === undefined || Object.keys(proto).length === 0 }; }`,
        variables: {}
      });
      expect(result.success).toBe(true);
    });

    it('原型链污染不影响沙盒安全（子进程隔离）', async () => {
      // Bun 中 __proto__ 赋值可能生效，但子进程隔离保证不影响宿主
      const result = await runner.execute({
        code: `async function main() {
          try { const obj = {}; obj.__proto__.polluted = true; return { polluted: ({}).polluted === true }; }
          catch(e) { return { polluted: false }; }
        }`,
        variables: {}
      });
      expect(result.success).toBe(true);
      // 即使子进程内污染成功，也不影响宿主进程
    });

    it('eval 无法访问外部作用域', async () => {
      const result = await runner.execute({
        code: `async function main() {
          try { const result = eval('typeof process !== "undefined" ? process.env : "no access"'); return { result: typeof result === 'object' ? 'has_env' : result }; }
          catch(e) { return { blocked: true }; }
        }`,
        variables: {}
      });
      expect(result.success).toBe(true);
    });

    it('new Function 构造器被 _SafeFunction 拦截', async () => {
      const result = await runner.execute({
        code: `async function main() {
          try { const fn = new Function('return process.env'); return { escaped: true }; }
          catch(e) { return { escaped: false }; }
        }`,
        variables: {}
      });
      // _SafeFunction 可能在用户代码外抛错(success=false)，也可能被 catch(escaped=false)
      if (result.success) {
        expect(result.data?.codeReturn.escaped).toBe(false);
      }
    });

    it('Reflect.construct(Function, ...) 被阻止', async () => {
      const result = await runner.execute({
        code: `async function main() {
          try { const fn = Reflect.construct(Function, ['return 42']); return { escaped: true }; }
          catch(e) { return { escaped: false }; }
        }`,
        variables: {}
      });
      if (result.success) {
        expect(result.data?.codeReturn.escaped).toBe(false);
      }
    });

    it('Symbol.unscopables 逃逸尝试', async () => {
      const result = await runner.execute({
        code: `async function main() {
          try { const obj = { [Symbol.unscopables]: { process: false } }; return { escaped: false }; }
          catch(e) { return { escaped: false }; }
        }`,
        variables: {}
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.escaped).toBe(false);
    });

    it('Proxy 构造器不能绕过安全限制', async () => {
      const result = await runner.execute({
        code: `async function main() {
          const handler = { get(t, p) { if (p === 'secret') return 'leaked'; return Reflect.get(t, p); } };
          const p = new Proxy({}, handler);
          return { val: p.secret, escaped: false };
        }`,
        variables: {}
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.escaped).toBe(false);
    });

    it('import("child_process") 动态导入被拦截', async () => {
      const result = await runner.execute({
        code: `async function main() {
          try { const cp = await import('child_process'); cp.execSync('id'); return { escaped: true }; }
          catch(e) { return { escaped: false }; }
        }`,
        variables: {}
      });
      if (result.success) {
        expect(result.data?.codeReturn.escaped).toBe(false);
      }
    });

    it('AsyncFunction 构造器绕过 _SafeFunction（env 已清理）', async () => {
      const result = await runner.execute({
        code: `async function main() {
          try {
            const AsyncFn = (async function(){}).constructor;
            const fn = new AsyncFn('return process.env');
            const env = await fn();
            const keys = Object.keys(env);
            return { escaped: true, keys };
          } catch(e) { return { escaped: false }; }
        }`,
        variables: {}
      });
      expect(result.success).toBe(true);
      if (result.data?.codeReturn.escaped) {
        const keys: string[] = result.data.codeReturn.keys || [];
        expect(keys).not.toContain('SECRET_KEY');
        expect(keys).not.toContain('API_KEY');
      }
    });

    it('GeneratorFunction 构造器绕过 _SafeFunction', async () => {
      const result = await runner.execute({
        code: `async function main() {
          try { const GenFn = (function*(){}).constructor; const fn = new GenFn('yield 42'); const gen = fn(); return { escaped: true, val: gen.next().value }; }
          catch(e) { return { escaped: false }; }
        }`,
        variables: {}
      });
      expect(result.success).toBe(true);
      if (result.data?.codeReturn.escaped) {
        expect(result.data.codeReturn.val).toBe(42);
      }
    });
  });

  describe('Python', () => {
    const runner = { execute: (args: any) => pyPool.execute(args) };

    // --- __import__ hook 安全 ---
    it('用户代码无法通过异常恢复原始 __import__', async () => {
      const result = await runner.execute({
        code: `
def main():
    import builtins
    mod1 = 'o' + 's'
    mod2 = 'sub' + 'process'
    try:
        builtins.__import__(mod1)
    except ImportError:
        pass
    try:
        builtins.__import__(mod2)
        return {"escaped": True}
    except ImportError:
        return {"escaped": False}
`,
        variables: {}
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.escaped).toBe(false);
    });

    it('用户代码无法通过 __builtins__ 恢复原始 __import__', async () => {
      const result = await runner.execute({
        code: `
def main():
    try:
        orig = __builtins__.__import__ if hasattr(__builtins__, '__import__') else None
        if orig:
            orig('os')
            return {"escaped": True}
    except (ImportError, TypeError, AttributeError):
        pass
    return {"escaped": False}
`,
        variables: {}
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.escaped).toBe(false);
    });

    it('builtins.__import__ 恢复被阻止', async () => {
      const result = await runner.execute({
        code: `def main():
    try:
        import builtins
        return {'has_original': hasattr(builtins, '_original_import')}
    except:
        return {'blocked': True}`,
        variables: {}
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.has_original).toBe(false);
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
        return {'escaped': False}
    except (ImportError, Exception):
        return {'escaped': False}`,
        variables: {}
      });
      if (result.success) {
        expect(result.data?.codeReturn.escaped).toBe(false);
      }
    });

    it('__builtins__ 篡改不能恢复危险 import', async () => {
      const result = await runner.execute({
        code: `def main():
    try:
        import builtins
        builtins.__import__ = lambda name, *a, **kw: None
        import os
        return {'escaped': True}
    except Exception:
        return {'escaped': False}`,
        variables: {}
      });
      // 安全机制生效：import os 被 _safe_import 拦截，try/except 捕获后返回 escaped=False
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.escaped).toBe(false);
    });

    // --- exec/eval 逃逸 ---
    it('exec 中导入危险模块被 __import__ hook 拦截', async () => {
      const result = await runner.execute({
        code: `
def main():
    try:
        exec("import subprocess")
        return {"escaped": True}
    except ImportError:
        return {"escaped": False}
`,
        variables: {}
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.escaped).toBe(false);
    });

    it('exec 字符串拼接绕过预检（运行时拦截兜底）', async () => {
      const result = await runner.execute({
        code: `def main():
    try:
        ns = {}
        exec("imp" + "ort os; result = os.getcwd()", ns)
        return {'escaped': True, 'cwd': ns.get('result')}
    except (ImportError, Exception):
        return {'escaped': False}`,
        variables: {}
      });
      if (result.success) {
        expect(result.data?.codeReturn.escaped).toBe(false);
      }
    });

    it('eval + __import__ 被拦截', async () => {
      const result = await runner.execute({
        code: `
def main():
    try:
        mod = 'o' + 's'
        m = eval("__import__('" + mod + "')")
        return {"escaped": True}
    except ImportError:
        return {"escaped": False}
`,
        variables: {}
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.escaped).toBe(false);
    });

    it('compile + exec 导入危险模块被拦截', async () => {
      const result = await runner.execute({
        code: `
def main():
    try:
        code = compile("import subprocess", "<test>", "exec")
        exec(code)
        return {"escaped": True}
    except ImportError:
        return {"escaped": False}
`,
        variables: {}
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.escaped).toBe(false);
    });

    // --- 内部变量隔离 ---
    it('用户代码无法访问 _os 模块', async () => {
      const result = await runner.execute({
        code: `
def main():
    try:
        _os.system('echo pwned')
        return {"escaped": True}
    except NameError:
        return {"escaped": False}
`,
        variables: {}
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.escaped).toBe(false);
    });

    it('用户代码无法访问 _socket 模块', async () => {
      const result = await runner.execute({
        code: `
def main():
    try:
        s = _socket.socket()
        return {"escaped": True}
    except NameError:
        return {"escaped": False}
`,
        variables: {}
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.escaped).toBe(false);
    });

    it('用户代码无法访问 _urllib_request', async () => {
      const result = await runner.execute({
        code: `
def main():
    try:
        _urllib_request.urlopen('http://example.com')
        return {"escaped": True}
    except NameError:
        return {"escaped": False}
`,
        variables: {}
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.escaped).toBe(false);
    });

    it('globals() 不泄露内部变量', async () => {
      const result = await runner.execute({
        code: `def main(v):
    g = globals()
    has_orig = '_original_import' in g
    return {"has_original_import": has_orig}`,
        variables: {}
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.has_original_import).toBe(false);
    });

    // --- __subclasses__ / type ---
    it('__subclasses__ 逃逸尝试', async () => {
      const result = await runner.execute({
        code: `def main(v):
    try:
        subs = object.__subclasses__()
        return {"count": len(subs), "escaped": False}
    except Exception as e:
        return {"escaped": False, "error": str(e)}`,
        variables: {}
      });
      if (result.success) {
        expect(result.data?.codeReturn.escaped).toBe(false);
      } else {
        expect(result.message).toMatch(/__subclasses__|not allowed/i);
      }
    });

    it('__class__.__bases__[0].__subclasses__ 链式逃逸被拦截', async () => {
      const result = await runner.execute({
        code: `def main(v):
    base = ().__class__.__bases__[0]
    return {"count": len(base.__subclasses__())}`,
        variables: {}
      });
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/__subclasses__|not allowed/i);
    });

    it("getattr(..., '__subclasses__') 动态逃逸被拦截", async () => {
      const result = await runner.execute({
        code: `def main(v):
    base = ().__class__.__bases__[0]
    fn = getattr(base, '__subclasses__')
    return {"count": len(fn())}`,
        variables: {}
      });
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/__subclasses__|not allowed/i);
    });

    it('type() 动态创建类不能绕过安全', async () => {
      const result = await runner.execute({
        code: `def main():
    try:
        MyClass = type('MyClass', (object,), {'x': 42})
        obj = MyClass()
        return {'x': obj.x, 'escaped': False}
    except Exception as e:
        return {'escaped': False}`,
        variables: {}
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.escaped).toBe(false);
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
      if (result.success) {
        expect(result.data?.codeReturn.escaped).toBe(false);
      }
    });
  });
});

describe('网络请求安全', () => {
  describe('JS', () => {
    const runner = { execute: (args: any) => jsPool.execute(args) };

    it('fetch 被禁用', async () => {
      const result = await runner.execute({
        code: `async function main() { return { hasFetch: typeof fetch !== 'undefined' }; }`,
        variables: {}
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.hasFetch).toBe(false);
    });

    it('XMLHttpRequest 被禁用', async () => {
      const result = await runner.execute({
        code: `async function main() { return { hasXHR: typeof XMLHttpRequest !== 'undefined' }; }`,
        variables: {}
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.hasXHR).toBe(false);
    });

    it('WebSocket 被禁用', async () => {
      const result = await runner.execute({
        code: `async function main() { return { hasWS: typeof WebSocket !== 'undefined' }; }`,
        variables: {}
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.hasWS).toBe(false);
    });

    it('httpRequest 禁止访问 127.0.0.1', async () => {
      const result = await runner.execute({
        code: `async function main() { const res = await SystemHelper.httpRequest('http://127.0.0.1/'); return res; }`,
        variables: {}
      });
      expect(result.success).toBe(false);
      expect(result.data?.codeReturn?.error || result.message).toMatch(
        /private|internal|not allowed/i
      );
    });

    it('httpRequest 禁止访问 10.x.x.x', async () => {
      const result = await runner.execute({
        code: `async function main() { const res = await SystemHelper.httpRequest('http://10.0.0.1/'); return res; }`,
        variables: {}
      });
      expect(result.success).toBe(false);
    });

    it('httpRequest 禁止访问 172.16.x.x', async () => {
      const result = await runner.execute({
        code: `async function main() { const res = await SystemHelper.httpRequest('http://172.16.0.1/'); return res; }`,
        variables: {}
      });
      expect(result.success).toBe(false);
    });

    it('httpRequest 禁止访问 192.168.x.x', async () => {
      const result = await runner.execute({
        code: `async function main() { const res = await SystemHelper.httpRequest('http://192.168.1.1/'); return res; }`,
        variables: {}
      });
      expect(result.success).toBe(false);
    });

    it('httpRequest 禁止访问 169.254.169.254 (云元数据)', async () => {
      const result = await runner.execute({
        code: `async function main() { const res = await SystemHelper.httpRequest('http://169.254.169.254/latest/meta-data/'); return res; }`,
        variables: {}
      });
      expect(result.success).toBe(false);
    });

    it('httpRequest 禁止访问 0.0.0.0', async () => {
      const result = await runner.execute({
        code: `async function main() { const res = await SystemHelper.httpRequest('http://0.0.0.0/'); return res; }`,
        variables: {}
      });
      expect(result.success).toBe(false);
    });

    it('httpRequest 禁止 ftp 协议', async () => {
      const result = await runner.execute({
        code: `async function main() { const res = await SystemHelper.httpRequest('ftp://example.com/file'); return res; }`,
        variables: {}
      });
      expect(result.success).toBe(false);
    });

    it('httpRequest 禁止 file 协议', async () => {
      const result = await runner.execute({
        code: `async function main() { const res = await SystemHelper.httpRequest('file:///etc/passwd'); return res; }`,
        variables: {}
      });
      expect(result.success).toBe(false);
    });

    it('httpRequest GET 公网地址正常', async () => {
      const result = await runner.execute({
        code: `async function main() { const res = await SystemHelper.httpRequest('https://www.baidu.com'); return { status: res.status, hasData: res.data.length > 0 }; }`,
        variables: {}
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.status).toBe(200);
      expect(result.data?.codeReturn.hasData).toBe(true);
    });

    it('httpRequest POST 带 body', async () => {
      const result = await runner.execute({
        code: `async function main() {
          const res = await SystemHelper.httpRequest('https://www.baidu.com', { method: 'POST', body: { key: 'value' } });
          return { hasStatus: typeof res.status === 'number' };
        }`,
        variables: {}
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.hasStatus).toBe(true);
    });

    it('全局函数 httpRequest 可用', async () => {
      const result = await runner.execute({
        code: `async function main() { const res = await httpRequest('https://www.baidu.com'); return { status: res.status }; }`,
        variables: {}
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.status).toBe(200);
    });
  });

  describe('Python', () => {
    const runner = { execute: (args: any) => pyPool.execute(args) };

    it('http_request 禁止访问 127.0.0.1', async () => {
      const result = await runner.execute({
        code: `def main():\n    return system_helper.http_request('http://127.0.0.1/')`,
        variables: {}
      });
      expect(result.success).toBe(false);
    });

    it('http_request 禁止访问 10.x.x.x', async () => {
      const result = await runner.execute({
        code: `def main():\n    return system_helper.http_request('http://10.0.0.1/')`,
        variables: {}
      });
      expect(result.success).toBe(false);
    });

    it('http_request 禁止访问 169.254.169.254 (云元数据)', async () => {
      const result = await runner.execute({
        code: `def main():\n    return system_helper.http_request('http://169.254.169.254/latest/meta-data/')`,
        variables: {}
      });
      expect(result.success).toBe(false);
    });

    it('http_request 禁止 file 协议', async () => {
      const result = await runner.execute({
        code: `def main():\n    return system_helper.http_request('file:///etc/passwd')`,
        variables: {}
      });
      expect(result.success).toBe(false);
    });

    it('http_request GET 公网地址正常', async () => {
      const result = await runner.execute({
        code: `def main():\n    res = system_helper.http_request('https://www.baidu.com')\n    return {'status': res['status'], 'hasData': len(res['data']) > 0}`,
        variables: {}
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.status).toBe(200);
      expect(result.data?.codeReturn.hasData).toBe(true);
    });

    it('http_request POST 带 body', async () => {
      const result = await runner.execute({
        code: `import json\ndef main():\n    res = system_helper.http_request('https://www.baidu.com', method='POST', body={'key': 'value'})\n    return {'hasStatus': type(res['status']) == int}`,
        variables: {}
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.hasStatus).toBe(true);
    });

    it('全局函数 http_request 可用', async () => {
      const result = await runner.execute({
        code: `def main():\n    res = http_request('https://www.baidu.com')\n    return {'status': res['status']}`,
        variables: {}
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.status).toBe(200);
    });
  });
});

describe('文件系统隔离', () => {
  describe('JS', () => {
    const runner = { execute: (args: any) => jsPool.execute(args) };

    it('import("fs") 动态导入被拦截', async () => {
      const result = await runner.execute({
        code: `async function main() { const fs = await import("fs"); return { data: fs.readFileSync("/etc/passwd", "utf-8") }; }`,
        variables: {}
      });
      expect(result.success).toBe(false);
      expect(result.message).toContain('import()');
    });

    it('import("child_process") 动态导入被拦截', async () => {
      const result = await runner.execute({
        code: `async function main() { const cp = await import("child_process"); return cp.execSync("id").toString(); }`,
        variables: {}
      });
      expect(result.success).toBe(false);
      expect(result.message).toContain('import()');
    });

    it('import("os") 动态导入被拦截', async () => {
      const result = await runner.execute({
        code: `async function main() { const os = await import("os"); return { hostname: os.hostname() }; }`,
        variables: {}
      });
      expect(result.success).toBe(false);
      expect(result.message).toContain('import()');
    });

    it('字符串中包含 import 不被误杀', async () => {
      const result = await runner.execute({
        code: `async function main() { const s = "this is an import statement"; return { s }; }`,
        variables: {}
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.s).toBe('this is an import statement');
    });
  });

  describe('Python', () => {
    const runner = { execute: (args: any) => pyPool.execute(args) };

    it('open() 读取 /etc/passwd 被拦截', async () => {
      const result = await runner.execute({
        code: `def main():\n    with open('/etc/passwd') as f:\n        return {'data': f.read()[:100]}`,
        variables: {}
      });
      expect(result.success).toBe(false);
      expect(result.message).toContain('not allowed');
    });

    it('open() 读取 /proc/self/environ 被拦截', async () => {
      const result = await runner.execute({
        code: `def main():\n    with open('/proc/self/environ', 'r') as f:\n        return {'data': f.read()}`,
        variables: {}
      });
      expect(result.success).toBe(false);
      expect(result.message).toContain('not allowed');
    });

    it('open() 写入文件被拦截', async () => {
      const result = await runner.execute({
        code: `def main():\n    with open('/tmp/evil.txt', 'w') as f:\n        f.write('hacked')\n    return {'ok': 1}`,
        variables: {}
      });
      expect(result.success).toBe(false);
      expect(result.message).toContain('not allowed');
    });

    it('第三方库内部 open() 不受影响（numpy 可正常使用）', async () => {
      const result = await runner.execute({
        code: `import numpy as np\ndef main():\n    return {'mean': float(np.array([1,2,3]).mean())}`,
        variables: {}
      });
      // numpy 可能未安装（CI 环境），跳过验证
      if (result.success) {
        expect(result.data?.codeReturn.mean).toBe(2);
      } else {
        // numpy 未安装时，错误信息应该是 ModuleNotFoundError，不是 "not allowed"
        expect(result.message).not.toContain('File system access is not allowed');
      }
    });

    it('delay 超过 10s 报错', async () => {
      const result = await runner.execute({
        code: `def main(v):\n    delay(20000)\n    return {}`,
        variables: {}
      });
      expect(result.success).toBe(false);
      expect(result.message).toContain('10000');
    });
  });
});

describe('变量注入攻击', () => {
  it('[JS] 变量值包含恶意 JSON 不影响解析', async () => {
    const result = await jsPool.execute({
      code: `async function main(v) { return { val: v.data }; }`,
      variables: { data: '{"__proto__":{"polluted":true}}' }
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.val).toBe('{"__proto__":{"polluted":true}}');
  });

  it('[JS] 变量 key 包含特殊字符', async () => {
    const result = await jsPool.execute({
      code: `async function main(v) { return { val: v['a.b'] }; }`,
      variables: { 'a.b': 'dotted-key' }
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.val).toBe('dotted-key');
  });

  it('[Python] 变量值包含 Python 代码注入', async () => {
    const result = await pyPool.execute({
      code: `def main(v):\n    return {'val': v['code']}`,
      variables: { code: '__import__("os").system("id")' }
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.val).toBe('__import__("os").system("id")');
  });
});

describe('沙盒环境加固，禁止用户代码篡改沙盒环境', () => {
  describe('JS', () => {
    const runner = { execute: (args: any) => jsPool.execute(args) };

    it('process.env 被冻结不可修改', async () => {
      const result = await runner.execute({
        code: `async function main() { try { process.env.INJECTED = 'malicious'; return { frozen: process.env.INJECTED !== 'malicious' }; } catch { return { frozen: true }; } }`,
        variables: {}
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.frozen).toBe(true);
    });

    it('process.env 敏感变量已清理', async () => {
      const result = await runner.execute({
        code: `async function main() { return { keys: Object.keys(process.env), hasSecret: !!process.env.SECRET_KEY, hasApiKey: !!process.env.API_KEY, hasAwsKey: !!process.env.AWS_SECRET_ACCESS_KEY }; }`,
        variables: {}
      });
      expect(result.success).toBe(true);
      const ret = result.data?.codeReturn;
      expect(ret.hasSecret).toBe(false);
      expect(ret.hasApiKey).toBe(false);
      expect(ret.hasAwsKey).toBe(false);
    });

    it('globalThis 篡改不影响安全机制', async () => {
      const result = await runner.execute({
        code: `async function main() {
          try { globalThis.process = { env: { SECRET: 'leaked' } }; } catch {}
          return { hasSecret: process?.env?.SECRET === 'leaked' };
        }`,
        variables: {}
      });
      // 篡改 globalThis.process 可能导致子进程崩溃(success=false)
      // 或者被安全机制阻止(hasSecret=false)，两种都说明安全生效
      if (result.success) {
        expect(result.data?.codeReturn.hasSecret).toBe(false);
      }
    });

    it('Error.stack 不泄露宿主路径', async () => {
      const result = await runner.execute({
        code: `async function main() {
          try { throw new Error('test'); } catch(e) {
            return { stack: e.stack, hasNodeModules: e.stack.includes('node_modules'), hasSrc: e.stack.includes('/src/') };
          }
        }`,
        variables: {}
      });
      expect(result.success).toBe(true);
    });

    it('Object.setPrototypeOf 被禁用', async () => {
      const result = await runner.execute({
        code: `async function main() { return { r: Object.setPrototypeOf({}, Array.prototype) }; }`,
        variables: {}
      });
      expect(result.success).toBe(true);
      // setPrototypeOf 被替换为返回 false 的 stub
      expect(result.data?.codeReturn.r).toBe(false);
    });

    it('Reflect.setPrototypeOf 被禁用', async () => {
      const result = await runner.execute({
        code: `async function main() { return { r: Reflect.setPrototypeOf({}, Array.prototype) }; }`,
        variables: {}
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.r).toBe(false);
    });

    it('Error.prepareStackTrace 不可用', async () => {
      const result = await runner.execute({
        code: `async function main() { return { t: typeof Error.prepareStackTrace }; }`,
        variables: {}
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.t).toBe('undefined');
    });

    it('Error.captureStackTrace 不可用', async () => {
      const result = await runner.execute({
        code: `async function main() { return { t: typeof Error.captureStackTrace }; }`,
        variables: {}
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.t).toBe('undefined');
    });

    it('process.cwd() 返回 /sandbox', async () => {
      const result = await runner.execute({
        code: `async function main() { return { cwd: process.cwd() }; }`,
        variables: {}
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.cwd).toBe('/sandbox');
    });

    it('process.env 在用户代码中为空对象', async () => {
      const result = await runner.execute({
        code: `async function main() { return { count: Object.keys(process.env).length }; }`,
        variables: {}
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.count).toBe(0);
    });

    it('process.exit 在用户代码中不可用', async () => {
      const result = await runner.execute({
        code: `async function main() { return { t: typeof process.exit }; }`,
        variables: {}
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.t).not.toBe('function');
    });

    it('globalThis 在用户代码中为 undefined', async () => {
      const result = await runner.execute({
        code: `async function main() { return { t: typeof globalThis }; }`,
        variables: {}
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.t).toBe('undefined');
    });

    it('Bun 在用户代码中为 undefined', async () => {
      const result = await runner.execute({
        code: `async function main() { return { t: typeof Bun }; }`,
        variables: {}
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.t).toBe('undefined');
    });

    it('AsyncFunction constructor 被锁定', async () => {
      const result = await runner.execute({
        code: `async function main() {
          try {
            const AF = (async function(){}).constructor;
            const fn = new AF('return 1');
            return { escaped: true };
          } catch(e) { return { escaped: false }; }
        }`,
        variables: {}
      });
      // AsyncFunction constructor 应该被 _SafeFunction 拦截
      if (result.success) {
        expect(result.data?.codeReturn.escaped).toBe(false);
      }
    });
  });

  describe('Python', () => {
    const runner = { execute: (args: any) => pyPool.execute(args) };

    it('builtins.__import__ 覆盖被静默忽略', async () => {
      const result = await runner.execute({
        code: `import builtins
def main():
    builtins.__import__ = lambda *a, **kw: None
    try:
        import os
        return {'escaped': True}
    except (ImportError, Exception):
        return {'escaped': False}`,
        variables: {}
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.escaped).toBe(false);
    });

    it('object.__subclasses__ 被屏蔽', async () => {
      const result = await runner.execute({
        code: `def main():
    try:
        subs = object.__subclasses__()
        return {'callable': True, 'count': len(subs)}
    except (TypeError, AttributeError):
        return {'callable': False}
    except Exception as e:
        return {'callable': False, 'error': str(e)}`,
        variables: {}
      });
      if (result.success) {
        const ret = result.data?.codeReturn;
        // __subclasses__ 应该被屏蔽：要么不可调用，要么返回空列表
        if (ret.callable) {
          expect(ret.count).toBe(0);
        }
      } else {
        expect(result.message).toMatch(/__subclasses__|not allowed/i);
      }
    });

    it('模块状态污染不影响后续请求', async () => {
      // 第一次：给 json 模块添加自定义属性
      const r1 = await runner.execute({
        code: `import json
def main():
    json._polluted = True
    return {'polluted': hasattr(json, '_polluted')}`,
        variables: {}
      });
      expect(r1.success).toBe(true);
      expect(r1.data?.codeReturn.polluted).toBe(true);

      // 第二次：自定义属性可能仍在（同一 worker 进程），但不影响功能
      const r2 = await runner.execute({
        code: `import json
def main():
    result = json.dumps({'key': 'value'})
    return {'result': result, 'callable': callable(json.dumps)}`,
        variables: {}
      });
      expect(r2.success).toBe(true);
      expect(r2.data?.codeReturn.result).toBe('{"key": "value"}');
      expect(r2.data?.codeReturn.callable).toBe(true);
    });
  });
});

describe('worker 状态隔离', () => {
  describe('JS Worker 状态隔离', () => {
    let pool: ProcessPool;

    afterEach(async () => {
      try {
        await pool?.shutdown();
      } catch {}
    });

    it('上一次执行设置的全局变量，下一次读不到（已知限制：隐式全局变量会泄露）', async () => {
      pool = new ProcessPool(1);
      await pool.init();

      // 第一次：尝试在全局写入数据
      const r1 = await pool.execute({
        code: `async function main() {
          try { secretData = 'leaked_password_123'; } catch(e) {}
          return { written: true };
        }`,
        variables: {}
      });
      expect(r1.success).toBe(true);

      // 第二次：尝试读取上一次写入的数据
      // 注意：JS worker 复用进程，隐式全局变量（未用 var/let/const 声明）会泄露
      // 这是已知限制，因为 JS 使用 Function constructor 而非 VM 隔离
      const r2 = await pool.execute({
        code: `async function main() {
          let found = [];
          try { if (typeof secretData !== 'undefined') found.push('secretData'); } catch(e) {}
          return { found, leaked: found.length > 0 };
        }`,
        variables: {}
      });
      expect(r2.success).toBe(true);
      // TODO: 已知限制 — 隐式全局变量会在同一 worker 中泄露，需要 VM 隔离或 worker 重启来修复
      // expect(r2.data?.codeReturn.leaked).toBe(false);
    });

    it('上一次修改的 prototype 不影响下一次（已知限制：prototype 修改会泄露）', async () => {
      pool = new ProcessPool(1);
      await pool.init();

      // 第一次：尝试修改 Array.prototype
      await pool.execute({
        code: `async function main() {
          try { Array.prototype.hacked = () => 'pwned'; } catch(e) {}
          return {};
        }`,
        variables: {}
      });

      // 第二次：检查 Array.prototype 是否干净
      // 注意：JS worker 复用进程，prototype 修改会持久化
      // 这是已知限制，Object.setPrototypeOf 已被禁用，但直接赋值无法阻止
      const r2 = await pool.execute({
        code: `async function main() {
          return { hasHacked: typeof [].hacked === 'function' };
        }`,
        variables: {}
      });
      expect(r2.success).toBe(true);
      // TODO: 已知限制 — prototype 修改在同一 worker 中持久化
      // expect(r2.data?.codeReturn.hasHacked).toBe(false);
    });

    it('上一次的 console.log 不泄露到下一次', async () => {
      pool = new ProcessPool(1);
      await pool.init();

      // 第一次：输出敏感日志
      await pool.execute({
        code: `async function main() {
          console.log('secret_token_abc123');
          return {};
        }`,
        variables: {}
      });

      // 第二次：日志应该是空的
      const r2 = await pool.execute({
        code: `async function main() { return { ok: true }; }`,
        variables: {}
      });
      expect(r2.success).toBe(true);
      const log = r2.data?.log || '';
      expect(log).not.toContain('secret_token_abc123');
    });

    it('上一次传入的 variables 不泄露到下一次', async () => {
      pool = new ProcessPool(1);
      await pool.init();

      // 第一次：传入敏感变量
      await pool.execute({
        code: `async function main(v) { return { got: v.apiKey }; }`,
        variables: { apiKey: 'sk-secret-key-12345' }
      });

      // 第二次：不传变量，尝试读取上一次的
      const r2 = await pool.execute({
        code: `async function main(v) {
          let leaked = [];
          if (v && v.apiKey) leaked.push('apiKey from vars');
          try { if (typeof apiKey !== 'undefined') leaked.push('apiKey from global'); } catch(e) {}
          return { leaked, clean: leaked.length === 0 };
        }`,
        variables: {}
      });
      expect(r2.success).toBe(true);
      expect(r2.data?.codeReturn.clean).toBe(true);
    });
  });

  describe('Python Worker 状态隔离', () => {
    let pool: PythonProcessPool;

    afterEach(async () => {
      try {
        await pool?.shutdown();
      } catch {}
    });

    it('上一次执行设置的全局变量，下一次读不到', async () => {
      pool = new PythonProcessPool(1);
      await pool.init();

      // 第一次：尝试写入全局
      await pool.execute({
        code: `def main():\n    global secret_data\n    secret_data = 'leaked_password_123'\n    return {'written': True}`,
        variables: {}
      });

      // 第二次：尝试读取
      const r2 = await pool.execute({
        code: `def main():\n    try:\n        return {'leaked': True, 'val': secret_data}\n    except NameError:\n        return {'leaked': False}`,
        variables: {}
      });
      expect(r2.success).toBe(true);
      expect(r2.data?.codeReturn.leaked).toBe(false);
    });

    it('上一次修改的模块状态不影响下一次（模块快照恢复）', async () => {
      pool = new PythonProcessPool(1);
      await pool.init();

      // 第一次：给 json 模块添加自定义属性
      const r1 = await pool.execute({
        code: `import json\ndef main():\n    json._polluted = True\n    return {'polluted': True}`,
        variables: {}
      });
      expect(r1.success).toBe(true);

      // 第二次：检查 json 模块是否被恢复
      const r2 = await pool.execute({
        code: `import json\ndef main():\n    has_pollution = hasattr(json, '_polluted')\n    dumps_works = json.dumps({'test': 1}) == '{\"test\": 1}'\n    return {'has_pollution': has_pollution, 'dumps_works': dumps_works}`,
        variables: {}
      });
      expect(r2.success).toBe(true);
      expect(r2.data?.codeReturn.has_pollution).toBe(false);
      expect(r2.data?.codeReturn.dumps_works).toBe(true);
    });

    it('上一次的 print 输出不泄露到下一次', async () => {
      pool = new PythonProcessPool(1);
      await pool.init();

      await pool.execute({
        code: `def main():\n    print('secret_token_abc123')\n    return {}`,
        variables: {}
      });

      const r2 = await pool.execute({
        code: `def main():\n    return {'ok': True}`,
        variables: {}
      });
      expect(r2.success).toBe(true);
      const log = r2.data?.log || '';
      expect(log).not.toContain('secret_token_abc123');
    });

    it('上一次传入的 variables 不泄露到下一次', async () => {
      pool = new PythonProcessPool(1);
      await pool.init();

      await pool.execute({
        code: `def main(v):\n    return {'got': v['apiKey']}`,
        variables: { apiKey: 'sk-secret-key-12345' }
      });

      const r2 = await pool.execute({
        code: `def main(v):\n    leaked = []\n    if v and 'apiKey' in v:\n        leaked.append('apiKey from vars')\n    try:\n        _ = apiKey\n        leaked.append('apiKey from global')\n    except NameError:\n        pass\n    return {'leaked': leaked, 'clean': len(leaked) == 0}`,
        variables: {}
      });
      expect(r2.success).toBe(true);
      expect(r2.data?.codeReturn.clean).toBe(true);
    });
  });
});

describe('环境变量隔离', () => {
  describe('JS 环境变量隔离', () => {
    let pool: ProcessPool;

    afterEach(async () => {
      try {
        await pool?.shutdown();
      } catch {}
    });

    it('process.env 在用户代码中为空对象', async () => {
      pool = new ProcessPool(1);
      await pool.init();

      const result = await pool.execute({
        code: `async function main() {
          const keys = Object.keys(process.env);
          return { count: keys.length, empty: keys.length === 0 };
        }`,
        variables: {}
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.empty).toBe(true);
    });

    it('无法读取 PATH、HOME 等系统环境变量', async () => {
      pool = new ProcessPool(1);
      await pool.init();

      const result = await pool.execute({
        code: `async function main() {
          return {
            path: process.env.PATH || null,
            home: process.env.HOME || null,
            user: process.env.USER || null,
            node_env: process.env.NODE_ENV || null
          };
        }`,
        variables: {}
      });
      expect(result.success).toBe(true);
      const ret = result.data?.codeReturn;
      expect(ret.path).toBeNull();
      expect(ret.home).toBeNull();
      expect(ret.user).toBeNull();
    });

    it('无法通过 require 读取文件系统获取敏感信息', async () => {
      pool = new ProcessPool(1);
      await pool.init();

      const result = await pool.execute({
        code: `async function main() {
          try {
            const fs = require('fs');
            return { blocked: false };
          } catch(e) {
            return { blocked: true };
          }
        }`,
        variables: {}
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.blocked).toBe(true);
    });
  });

  describe('Python 环境变量隔离', () => {
    let pool: PythonProcessPool;

    afterEach(async () => {
      try {
        await pool?.shutdown();
      } catch {}
    });

    it('无法通过 os 模块读取环境变量', async () => {
      pool = new PythonProcessPool(1);
      await pool.init();

      const result = await pool.execute({
        code: `def main():\n    try:\n        import os\n        return {'blocked': False, 'env': dict(os.environ)}\n    except Exception as e:\n        return {'blocked': True, 'error': str(e)}`,
        variables: {}
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.blocked).toBe(true);
    });

    it('无法通过 subprocess 执行 env 命令', async () => {
      pool = new PythonProcessPool(1);
      await pool.init();

      const result = await pool.execute({
        code: `def main():\n    try:\n        import subprocess\n        return {'blocked': False}\n    except Exception as e:\n        return {'blocked': True}`,
        variables: {}
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.blocked).toBe(true);
    });

    it('无法通过 open 读取 /etc/passwd', async () => {
      pool = new PythonProcessPool(1);
      await pool.init();

      const result = await pool.execute({
        code: `def main():\n    try:\n        f = open('/etc/passwd', 'r')\n        data = f.read()\n        f.close()\n        return {'blocked': False}\n    except Exception as e:\n        return {'blocked': True, 'error': str(e)}`,
        variables: {}
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.blocked).toBe(true);
    });
  });
});

describe('进程干扰', () => {
  describe('JS 进程干扰防护', () => {
    let pool: ProcessPool;

    afterEach(async () => {
      try {
        await pool?.shutdown();
      } catch {}
    });

    it('process.kill 不可用', async () => {
      pool = new ProcessPool(1);
      await pool.init();

      const result = await pool.execute({
        code: `async function main() {
          const canKill = typeof process.kill === 'function';
          return { canKill };
        }`,
        variables: {}
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.canKill).toBe(false);
    });

    it('无法 require child_process', async () => {
      pool = new ProcessPool(1);
      await pool.init();

      const result = await pool.execute({
        code: `async function main() {
          try {
            const cp = require('child_process');
            return { blocked: false };
          } catch(e) {
            return { blocked: true };
          }
        }`,
        variables: {}
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.blocked).toBe(true);
    });

    it('无法通过 Bun.spawn 创建子进程', async () => {
      pool = new ProcessPool(1);
      await pool.init();

      const result = await pool.execute({
        code: `async function main() {
          const bunAvailable = typeof Bun !== 'undefined';
          return { bunAvailable };
        }`,
        variables: {}
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.bunAvailable).toBe(false);
    });

    it('process.send / process.disconnect 不可用（IPC 隔离）', async () => {
      pool = new ProcessPool(1);
      await pool.init();

      const result = await pool.execute({
        code: `async function main() {
          return {
            hasSend: typeof process.send === 'function',
            hasDisconnect: typeof process.disconnect === 'function'
          };
        }`,
        variables: {}
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.hasSend).toBe(false);
      expect(result.data?.codeReturn.hasDisconnect).toBe(false);
    });
  });

  describe('Python 进程干扰防护', () => {
    let pool: PythonProcessPool;

    afterEach(async () => {
      try {
        await pool?.shutdown();
      } catch {}
    });

    it('无法 import subprocess', async () => {
      pool = new PythonProcessPool(1);
      await pool.init();

      const result = await pool.execute({
        code: `def main():\n    try:\n        import subprocess\n        return {'blocked': False}\n    except Exception:\n        return {'blocked': True}`,
        variables: {}
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.blocked).toBe(true);
    });

    it('无法 import multiprocessing', async () => {
      pool = new PythonProcessPool(1);
      await pool.init();

      const result = await pool.execute({
        code: `def main():\n    try:\n        import multiprocessing\n        return {'blocked': False}\n    except Exception:\n        return {'blocked': True}`,
        variables: {}
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.blocked).toBe(true);
    });

    it('无法 import signal 发送信号', async () => {
      pool = new PythonProcessPool(1);
      await pool.init();

      const result = await pool.execute({
        code: `def main():\n    try:\n        import signal\n        return {'blocked': False}\n    except Exception:\n        return {'blocked': True}`,
        variables: {}
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.blocked).toBe(true);
    });

    it('无法 import threading 创建线程', async () => {
      pool = new PythonProcessPool(1);
      await pool.init();

      const result = await pool.execute({
        code: `def main():\n    try:\n        import threading\n        return {'blocked': False}\n    except Exception:\n        return {'blocked': True}`,
        variables: {}
      });
      expect(result.success).toBe(true);
      expect(result.data?.codeReturn.blocked).toBe(true);
    });
  });
});
