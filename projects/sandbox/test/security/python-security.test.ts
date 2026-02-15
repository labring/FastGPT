import { describe, it, expect } from 'vitest';
import { PythonRunner } from '../../src/runner/python-runner';

const runner = new PythonRunner({
  defaultTimeoutMs: 10000,
  defaultMemoryMB: 64,
  defaultDiskMB: 10
});

describe('Python Security', () => {
  it('阻止 import os（宿主侧预检）', async () => {
    const result = await runner.execute({
      code: 'import os\ndef main(v):\n    return {}',
      variables: {}
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain('not allowed');
  });

  it('阻止 import subprocess（宿主侧预检）', async () => {
    const result = await runner.execute({
      code: 'import subprocess\ndef main(v):\n    return {}',
      variables: {}
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain('not allowed');
  });

  it('阻止 import sys（宿主侧预检）', async () => {
    const result = await runner.execute({
      code: 'import sys\ndef main(v):\n    return {}',
      variables: {}
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain('not allowed');
  });

  it('阻止 import shutil（宿主侧预检）', async () => {
    const result = await runner.execute({
      code: 'import shutil\ndef main(v):\n    return {}',
      variables: {}
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain('not allowed');
  });

  it('阻止 import socket', async () => {
    const result = await runner.execute({
      code: 'import socket\ndef main(v):\n    return {}',
      variables: {}
    });
    expect(result.success).toBe(false);
  });

  it('阻止 from os import path（宿主侧预检）', async () => {
    const result = await runner.execute({
      code: 'from os import path\ndef main(v):\n    return {}',
      variables: {}
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain('not allowed');
  });

  it('阻止运行时动态 import 危险模块', async () => {
    // 用户代码中不直接 import，而是在 main 里动态 import
    const result = await runner.execute({
      code: `def main(v):
    mod = __import__("subprocess")
    return {}`,
      variables: {}
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain('not allowed');
  });

  it('允许 import 安全模块 json', async () => {
    const result = await runner.execute({
      code: `import json
def main(v):
    data = json.dumps({"key": "value"})
    return {"data": data}`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.data).toBe('{"key": "value"}');
  });

  it('允许 import math', async () => {
    const result = await runner.execute({
      code: `import math
def main(v):
    return {"pi": round(math.pi, 2)}`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.pi).toBe(3.14);
  });

  it('阻止路径遍历 - 读取', async () => {
    const result = await runner.execute({
      code: `def main(v):
    content = system_helper.fs.read_file("../../etc/passwd")
    return {"content": content}`,
      variables: {}
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain('traversal');
  });

  it('阻止路径遍历 - 写入', async () => {
    const result = await runner.execute({
      code: `def main(v):
    system_helper.fs.write_file("../../../tmp/evil.txt", "hacked")
    return {}`,
      variables: {}
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain('traversal');
  });

  it('磁盘配额限制', async () => {
    // 用多次小写入累积超过 1MB 配额
    const result = await runner.execute({
      code: `def main(v):
    chunk = "x" * (512 * 1024)  # 512KB
    system_helper.fs.write_file("a.txt", chunk)
    system_helper.fs.write_file("b.txt", chunk)
    system_helper.fs.write_file("c.txt", chunk)  # 累计 1.5MB > 1MB
    return {}`,
      variables: {},
      limits: { diskMB: 1 }
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain('quota');
  });

  it('delay 超过 10s 报错', async () => {
    const result = await runner.execute({
      code: `def main(v):
    system_helper.delay(20000)
    return {}`,
      variables: {}
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain('10000');
  });

  // ===== 补充：更多安全攻击向量 =====

  it('阻止 import pickle（反序列化攻击）', async () => {
    const result = await runner.execute({
      code: `import pickle
def main(v):
    return {}`,
      variables: {}
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain('not allowed');
  });

  it('阻止 import multiprocessing', async () => {
    const result = await runner.execute({
      code: `import multiprocessing
def main(v):
    return {}`,
      variables: {}
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain('not allowed');
  });

  it('阻止 import threading', async () => {
    const result = await runner.execute({
      code: `import threading
def main(v):
    return {}`,
      variables: {}
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain('not allowed');
  });

  it('阻止 import ctypes', async () => {
    const result = await runner.execute({
      code: `import ctypes
def main(v):
    return {}`,
      variables: {}
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain('not allowed');
  });

  it('阻止 import signal', async () => {
    const result = await runner.execute({
      code: `import signal
def main(v):
    return {}`,
      variables: {}
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain('not allowed');
  });

  it('阻止 import gc', async () => {
    const result = await runner.execute({
      code: `import gc
def main(v):
    return {}`,
      variables: {}
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain('not allowed');
  });

  it('exec 内动态 import subprocess 被运行时拦截', async () => {
    const result = await runner.execute({
      code: `def main(v):
    try:
        exec("import subprocess")
        return {"escaped": True}
    except ImportError:
        return {"escaped": False}`,
      variables: {}
    });
    if (result.success) {
      expect(result.data?.codeReturn.escaped).toBe(false);
    } else {
      expect(result.message).toMatch(/not allowed/i);
    }
  });

  it('compile + exec 绕过尝试被拦截', async () => {
    const result = await runner.execute({
      code: `def main(v):
    try:
        code = compile("import os", "<string>", "exec")
        exec(code)
        return {"escaped": True}
    except (ImportError, NameError):
        return {"escaped": False}`,
      variables: {}
    });
    if (result.success) {
      expect(result.data?.codeReturn.escaped).toBe(false);
    }
  });

  it('__subclasses__ 逃逸尝试', async () => {
    const result = await runner.execute({
      code: `def main(v):
    try:
        # 尝试通过 object.__subclasses__() 找到可利用的类
        subs = object.__subclasses__()
        # 即使能列出子类，也不应该能执行危险操作
        return {"count": len(subs), "escaped": False}
    except Exception as e:
        return {"escaped": False, "error": str(e)}`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.escaped).toBe(false);
  });

  it('globals() 不泄露内部变量', async () => {
    const result = await runner.execute({
      code: `def main(v):
    g = globals()
    # 不应该能访问到 _original_import
    has_orig = '_original_import' in g
    return {"has_original_import": has_orig}`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.has_original_import).toBe(false);
  });

  it('多次小写入累积超过磁盘配额', async () => {
    const result = await runner.execute({
      code: `def main(v):
    chunk = "x" * (400 * 1024)  # 400KB
    system_helper.fs.write_file("a.txt", chunk)
    system_helper.fs.write_file("b.txt", chunk)
    system_helper.fs.write_file("c.txt", chunk)  # 累计 1.2MB > 1MB
    return {}`,
      variables: {},
      limits: { diskMB: 1 }
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain('quota');
  });

  it('阻止 from subprocess import Popen（宿主侧预检）', async () => {
    const result = await runner.execute({
      code: `from subprocess import Popen
def main(v):
    return {}`,
      variables: {}
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain('not allowed');
  });

  it('阻止 import tempfile', async () => {
    const result = await runner.execute({
      code: `import tempfile
def main(v):
    return {}`,
      variables: {}
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain('not allowed');
  });

  it('阻止 import pathlib', async () => {
    const result = await runner.execute({
      code: `import pathlib
def main(v):
    return {}`,
      variables: {}
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain('not allowed');
  });
});
