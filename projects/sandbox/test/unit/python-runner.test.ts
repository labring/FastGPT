import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PythonProcessPool } from '../../src/pool/python-process-pool';

let pool: PythonProcessPool;
beforeAll(async () => { pool = new PythonProcessPool(1); await pool.init(); });
afterAll(async () => { await pool.shutdown(); });

describe('PythonRunner', () => {
  it('执行基本代码并返回结果', async () => {
    const result = await pool.execute({
      code: 'def main(variables):\n    return {"sum": variables["a"] + variables["b"]}',
      variables: { a: 1, b: 2 }
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn).toEqual({ sum: 3 });
  });

  it('超时返回错误', async () => {
    const result = await pool.execute({
      code: 'def main(v):\n    while True: pass',
      variables: {},
      limits: { timeoutMs: 2000 }
    });
    expect(result.success).toBe(false);
  });

  it('空代码返回错误', async () => {
    const result = await pool.execute({
      code: '',
      variables: {}
    });
    expect(result.success).toBe(false);
  });

  it('system_helper.count_token 可用', async () => {
    const result = await pool.execute({
      code: `def main(v):
    return {"count": system_helper.count_token("hello world")}`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.count).toBeGreaterThan(0);
  });

  it('system_helper.str_to_base64 可用', async () => {
    const result = await pool.execute({
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
    const result = await pool.execute({
      code: `def main(v):
    r = system_helper.create_hmac("sha256", "secret")
    return {"has_timestamp": bool(r["timestamp"]), "has_sign": bool(r["sign"])}`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.has_timestamp).toBe(true);
    expect(result.data?.codeReturn.has_sign).toBe(true);
  });

  it('print 输出收集到 log', async () => {
    const result = await pool.execute({
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
    const result = await pool.execute({
      code: `def main(v):
    return {"count": count_token("test")}`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.count).toBeGreaterThan(0);
  });

  it('多参数 main 函数', async () => {
    const result = await pool.execute({
      code: `def main(a, b):
    return {"sum": a + b}`,
      variables: { a: 10, b: 20 }
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.sum).toBe(30);
  });

  it('无参数 main 函数', async () => {
    const result = await pool.execute({
      code: `def main():
    return {"hello": "world"}`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.hello).toBe('world');
  });

  it('运行时错误返回失败', async () => {
    const result = await pool.execute({
      code: `def main(v):
    raise ValueError("custom error")`,
      variables: {}
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain('custom error');
  });

  // ===== 补充：边界与特殊场景 =====

  it('纯空白代码返回错误', async () => {
    const result = await pool.execute({
      code: '   \n\t  \n  ',
      variables: {}
    });
    expect(result.success).toBe(false);
  });

  it('代码中包含三引号字符串', async () => {
    const result = await pool.execute({
      code: `def main(v):
    text = """hello
world"""
    return {"text": text}`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.text).toBe('hello\nworld');
  });

  it('返回字符串值', async () => {
    const result = await pool.execute({
      code: `def main(v):
    return "hello"`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn).toBe('hello');
  });

  it('返回数字 0', async () => {
    const result = await pool.execute({
      code: `def main(v):
    return 0`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn).toBe(0);
  });

  it('返回布尔 False', async () => {
    const result = await pool.execute({
      code: `def main(v):
    return False`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn).toBe(false);
  });

  it('返回空列表', async () => {
    const result = await pool.execute({
      code: `def main(v):
    return []`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn).toEqual([]);
  });

  it('返回空字典', async () => {
    const result = await pool.execute({
      code: `def main(v):
    return {}`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn).toEqual({});
  });

  it('Unicode 变量和返回值', async () => {
    const result = await pool.execute({
      code: `def main(v):
    return {"greeting": v["msg"] + "🎉", "emoji": "✅"}`,
      variables: { msg: '你好世界' }
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.greeting).toBe('你好世界🎉');
    expect(result.data?.codeReturn.emoji).toBe('✅');
  });

  it('变量值为 null 的处理', async () => {
    const result = await pool.execute({
      code: `def main(v):
    return {"a": v["a"], "is_none": v["a"] is None}`,
      variables: { a: null }
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.a).toBeNull();
    expect(result.data?.codeReturn.is_none).toBe(true);
  });

  it('多种 print 输出混合', async () => {
    const result = await pool.execute({
      code: `def main(v):
    print("string")
    print(42)
    print(True)
    print(None)
    print({"key": "val"})
    print([1, 2, 3])
    return {"done": True}`,
      variables: {}
    });
    expect(result.success).toBe(true);
    expect(result.data?.log).toContain('string');
    expect(result.data?.log).toContain('42');
    expect(result.data?.log).toContain('True');
  });

  it('limits 参数部分指定时使用默认值', async () => {
    const result = await pool.execute({
      code: `def main(v):
    return {"ok": True}`,
      variables: {},
      limits: { timeoutMs: 5000 }
    });
    expect(result.success).toBe(true);
  });

  it('大量变量传入', async () => {
    const variables: Record<string, any> = {};
    for (let i = 0; i < 100; i++) {
      variables[`key_${i}`] = `value_${i}`;
    }
    const result = await pool.execute({
      code: `def main(v):
    return {"count": len(v), "first": v["key_0"], "last": v["key_99"]}`,
      variables
    });
    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.count).toBe(100);
    expect(result.data?.codeReturn.first).toBe('value_0');
    expect(result.data?.codeReturn.last).toBe('value_99');
  });

  it('system_helper.delay 可用', async () => {
    const result = await pool.execute({
      code: `def main(v):
    system_helper.delay(100)
    return {"ok": True}`,
      variables: {}
    });
    expect(result.success).toBe(true);
  });

  it('缺少 main 函数报错', async () => {
    const result = await pool.execute({
      code: `x = 42`,
      variables: {}
    });
    expect(result.success).toBe(false);
  });

  it('main 不是函数报错', async () => {
    const result = await pool.execute({
      code: `main = 42`,
      variables: {}
    });
    expect(result.success).toBe(false);
  });

  it('除零错误', async () => {
    const result = await pool.execute({
      code: `def main(v):
    return {"result": 1 / 0}`,
      variables: {}
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain('division by zero');
  });
});
