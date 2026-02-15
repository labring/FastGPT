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
});
