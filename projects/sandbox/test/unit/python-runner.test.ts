import { describe, it, expect } from 'vitest';
import { PythonRunner } from '../../src/runner/python-runner';

const runner = new PythonRunner({
  defaultTimeoutMs: 10000,
  defaultMemoryMB: 64,
  defaultDiskMB: 10
});

describe('PythonRunner', () => {
  it('执行基本代码并返回结果', async () => {
    const result = await runner.execute({
      code: 'def main(variables):\n    return {"sum": variables["a"] + variables["b"]}',
      variables: { a: 1, b: 2 }
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn).toEqual({ sum: 3 });
  });

  it('超时返回错误', async () => {
    const result = await runner.execute({
      code: 'def main(v):\n    while True: pass',
      variables: {},
      limits: { timeoutMs: 2000 }
    });
    expect(result.success).toBe(false);
  });

  it('空代码返回错误', async () => {
    const result = await runner.execute({
      code: '',
      variables: {}
    });
    expect(result.success).toBe(false);
  });

  it('system_helper.count_token 可用', async () => {
    const result = await runner.execute({
      code: `def main(v):
    return {"count": system_helper.count_token("hello world")}`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.count).toBeGreaterThan(0);
  });

  it('system_helper.str_to_base64 可用', async () => {
    const result = await runner.execute({
      code: `def main(v):
    return {"b64": system_helper.str_to_base64("hello", "prefix:")}`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.b64).toBe(
      'prefix:' + Buffer.from('hello').toString('base64')
    );
  });

  it('system_helper.create_hmac 可用', async () => {
    const result = await runner.execute({
      code: `def main(v):
    r = system_helper.create_hmac("sha256", "secret")
    return {"has_timestamp": bool(r["timestamp"]), "has_sign": bool(r["sign"])}`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.has_timestamp).toBe(true);
    expect(result.data?.codeReturn.has_sign).toBe(true);
  });

  it('system_helper.fs 临时文件读写', async () => {
    const result = await runner.execute({
      code: `def main(v):
    system_helper.fs.write_file("test.txt", "hello sandbox")
    content = system_helper.fs.read_file("test.txt")
    return {"content": content}`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.content).toBe('hello sandbox');
  });

  it('system_helper.fs.mkdir + readdir', async () => {
    const result = await runner.execute({
      code: `def main(v):
    system_helper.fs.mkdir("subdir")
    system_helper.fs.write_file("subdir/a.txt", "aaa")
    files = system_helper.fs.readdir("subdir")
    exists = system_helper.fs.exists("subdir/a.txt")
    return {"files": files, "exists": exists}`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.files).toContain('a.txt');
    expect(result.data?.codeReturn.exists).toBe(true);
  });

  it('print 输出收集到 log', async () => {
    const result = await runner.execute({
      code: `def main(v):
    print("debug info")
    print("more data")
    return {"ok": True}`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.log).toContain('debug info');
  });

  it('向后兼容全局函数 count_token', async () => {
    const result = await runner.execute({
      code: `def main(v):
    return {"count": count_token("test")}`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.count).toBeGreaterThan(0);
  });

  it('多参数 main 函数', async () => {
    const result = await runner.execute({
      code: `def main(a, b):
    return {"sum": a + b}`,
      variables: { a: 10, b: 20 }
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.sum).toBe(30);
  });

  it('无参数 main 函数', async () => {
    const result = await runner.execute({
      code: `def main():
    return {"hello": "world"}`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.hello).toBe('world');
  });

  it('运行时错误返回失败', async () => {
    const result = await runner.execute({
      code: `def main(v):
    raise ValueError("custom error")`,
      variables: {}
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain('custom error');
  });
});
