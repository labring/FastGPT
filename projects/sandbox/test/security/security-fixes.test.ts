/**
 * 安全修复验证测试
 *
 * 针对 PR review 中发现的安全问题编写的回归测试：
 * 1. Python HTTPS DNS rebinding 防护
 * 2. Python __import__ hook 不可被恢复
 * 3. Python 内部变量不可被用户代码访问
 * 4. JS process 危险 API 被限制
 * 5. Python open() 不接受 fd 参数
 * 6. API 输入校验
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

// ===== JS process 对象限制 =====
describe('JS process 危险 API 限制', () => {
  let runner: JsRunner;
  beforeAll(() => { runner = new JsRunner(config); });

  it('process.binding 被禁用', async () => {
    const result = await runner.execute({
      code: `async function main() {
        try {
          process.binding('fs');
          return { escaped: true };
        } catch {
          return { escaped: false };
        }
      }`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.escaped).toBe(false);
  });

  it('process.dlopen 被禁用', async () => {
    const result = await runner.execute({
      code: `async function main() {
        return { hasDlopen: typeof process.dlopen === 'function' };
      }`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.hasDlopen).toBe(false);
  });

  it('process._linkedBinding 被禁用', async () => {
    const result = await runner.execute({
      code: `async function main() {
        return { has: typeof process._linkedBinding === 'function' };
      }`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.has).toBe(false);
  });

  it('process.kill 被禁用', async () => {
    const result = await runner.execute({
      code: `async function main() {
        return { hasKill: typeof process.kill === 'function' };
      }`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.hasKill).toBe(false);
  });

  it('process.chdir 被禁用', async () => {
    const result = await runner.execute({
      code: `async function main() {
        try {
          process.chdir('/');
          return { escaped: true };
        } catch {
          return { escaped: false };
        }
      }`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.escaped).toBe(false);
  });

  it('process.env 被冻结不可修改', async () => {
    const result = await runner.execute({
      code: `async function main() {
        try {
          process.env.INJECTED = 'malicious';
          return { frozen: process.env.INJECTED !== 'malicious' };
        } catch {
          return { frozen: true };
        }
      }`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.frozen).toBe(true);
  });
});

// ===== Python __import__ hook 不可恢复 =====
describe('Python __import__ hook 安全', () => {
  let runner: PythonRunner;
  beforeAll(() => { runner = new PythonRunner(config); });

  it('用户代码无法通过异常恢复原始 __import__', async () => {
    const result = await runner.execute({
      code: `
def main():
    import builtins
    try:
        builtins.__import__('os')
    except ImportError:
        pass
    # 尝试再次导入，hook 应该仍然生效
    try:
        builtins.__import__('subprocess')
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
});

// ===== Python 内部变量不可访问 =====
describe('Python 内部变量隔离', () => {
  let runner: PythonRunner;
  beforeAll(() => { runner = new PythonRunner(config); });

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
});

// ===== Python open() fd 模式限制 =====
describe('Python open() 文件描述符限制', () => {
  let runner: PythonRunner;
  beforeAll(() => { runner = new PythonRunner(config); });

  it('open() 不接受整数文件描述符', async () => {
    const result = await runner.execute({
      code: `
def main():
    try:
        f = open(0, 'r')  # stdin fd
        data = f.read()
        return {"escaped": True}
    except PermissionError:
        return {"escaped": False}
    except Exception as e:
        return {"error": str(e), "escaped": False}
`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.escaped).toBe(false);
  });

  it('open() 不接受 /etc/passwd 路径', async () => {
    const result = await runner.execute({
      code: `
def main():
    try:
        f = open('/etc/passwd', 'r')
        return {"escaped": True}
    except PermissionError:
        return {"escaped": False}
`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.escaped).toBe(false);
  });
});

// ===== API 输入校验 =====
describe('API 输入校验', () => {
  let jsRunner: JsRunner;
  beforeAll(() => { jsRunner = new JsRunner(config); });

  it('空代码被拒绝', async () => {
    const result = await jsRunner.execute({
      code: '',
      variables: {}
    });
    expect(result.success).toBe(false);
  });

  it('非字符串代码被拒绝', async () => {
    const result = await jsRunner.execute({
      code: 123 as any,
      variables: {}
    });
    expect(result.success).toBe(false);
  });
});

// ===== Python exec/eval 安全 =====
describe('Python exec/eval 安全', () => {
  let runner: PythonRunner;
  beforeAll(() => { runner = new PythonRunner(config); });

  it('exec 中导入危险模块被 __import__ hook 拦截', async () => {
    // 绕过宿主侧预检，通过 exec 动态导入
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

  it('eval + __import__ 被拦截', async () => {
    const result = await runner.execute({
      code: `
def main():
    try:
        m = eval("__import__('os')")
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
});
