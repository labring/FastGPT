/**
 * API 测试 - 使用 app.request() 直接测试 Hono 路由
 * 无需启动服务或配置 SANDBOX_URL
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { app, poolReady } from '../../src/index';
import { config } from '../../src/config';

/** 构造请求 headers，自动带上 auth（如果配置了 token） */
function headers(extra: Record<string, string> = {}): Record<string, string> {
  const h: Record<string, string> = { ...extra };
  if (config.token) {
    h['Authorization'] = `Bearer ${config.token}`;
  }
  return h;
}

describe('API Routes', () => {
  beforeAll(async () => {
    await poolReady;
  }, 30000);

  // ===== Health =====
  it('GET /health 返回 200', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('ok');
    expect(data.version).toBe('5.0.0');
  });

  // ===== JS =====
  it('POST /sandbox/js 正常执行', async () => {
    const res = await app.request('/sandbox/js', {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        code: 'async function main(v) { return { hello: v.name } }',
        variables: { name: 'world' }
      })
    });
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.codeReturn.hello).toBe('world');
  });

  it('POST /sandbox/js 带 limits 参数', async () => {
    const res = await app.request('/sandbox/js', {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        code: 'async function main(v) { return { ok: true } }',
        variables: {},
        limits: { timeoutMs: 5000, memoryMB: 32 }
      })
    });
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it('POST /sandbox/js 安全拦截', async () => {
    const res = await app.request('/sandbox/js', {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        code: 'async function main() { require("child_process"); return {} }',
        variables: {}
      })
    });
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.message).toContain('not allowed');
  });

  // ===== Python =====
  it('POST /sandbox/python 正常执行', async () => {
    const res = await app.request('/sandbox/python', {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        code: 'def main(variables):\n    return {"hello": variables["name"]}',
        variables: { name: 'world' }
      })
    });
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.codeReturn.hello).toBe('world');
  });

  it('POST /sandbox/python 安全拦截', async () => {
    const res = await app.request('/sandbox/python', {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        code: 'import os\ndef main(v):\n    return {}',
        variables: {}
      })
    });
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.message).toContain('not allowed');
  });

  // ===== Modules =====
  it('GET /sandbox/modules 返回可用模块列表', async () => {
    const res = await app.request('/sandbox/modules', {
      headers: headers()
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.js.allowedModules).toEqual(config.jsAllowedModules);
    expect(data.data.js.builtinGlobals).toContain('SystemHelper');
    expect(data.data.python.blockedModules).toEqual(config.pythonBlockedModules);
    expect(data.data.python.builtinGlobals).toContain('system_helper');
  });
});

/**
 * Auth 测试
 * 默认 SANDBOX_TOKEN 为空，auth 中间件不启用。
 * 设置 SANDBOX_TOKEN=xxx 运行可测试鉴权逻辑。
 */
describe.skipIf(!config.token)('API Auth (requires SANDBOX_TOKEN)', () => {
  it('无 Token 返回 401', async () => {
    const res = await app.request('/sandbox/js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: 'async function main() { return {} }',
        variables: {}
      })
    });
    expect(res.status).toBe(401);
  });

  it('错误 Token 返回 401', async () => {
    const res = await app.request('/sandbox/js', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer wrong-token'
      },
      body: JSON.stringify({
        code: 'async function main() { return {} }',
        variables: {}
      })
    });
    expect(res.status).toBe(401);
  });

  it('正确 Token 返回 200', async () => {
    const res = await app.request('/sandbox/js', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.token}`
      },
      body: JSON.stringify({
        code: 'async function main() { return { ok: true } }',
        variables: {}
      })
    });
    const data = await res.json();
    expect(data.success).toBe(true);
  });
});
