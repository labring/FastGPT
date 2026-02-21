import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const SANDBOX_URL = process.env.SANDBOX_URL;
const TEST_TOKEN = process.env.SANDBOX_TOKEN || 'test-token-for-integration';

const skipReason = !SANDBOX_URL
  ? '跳过集成测试：未配置 SANDBOX_URL 环境变量'
  : undefined;

describe.skipIf(!SANDBOX_URL)('API Integration', () => {
  const BASE_URL = SANDBOX_URL!;

  it('GET /health 返回 200', async () => {
    const res = await fetch(`${BASE_URL}/health`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('ok');
    expect(data.version).toBe('5.0.0');
  });

  it('POST /sandbox/js 正常执行', async () => {
    const res = await fetch(`${BASE_URL}/sandbox/js`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TEST_TOKEN}`
      },
      body: JSON.stringify({
        code: 'async function main(v) { return { hello: v.name } }',
        variables: { name: 'world' }
      })
    });
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.codeReturn.hello).toBe('world');
  });

  it('POST /sandbox/python 正常执行', async () => {
    const res = await fetch(`${BASE_URL}/sandbox/python`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TEST_TOKEN}`
      },
      body: JSON.stringify({
        code: 'def main(variables):\n    return {"hello": variables["name"]}',
        variables: { name: 'world' }
      })
    });
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.codeReturn.hello).toBe('world');
  });

  it('无 Token 返回 401', async () => {
    const res = await fetch(`${BASE_URL}/sandbox/js`, {
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
    const res = await fetch(`${BASE_URL}/sandbox/js`, {
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

  it('POST /sandbox/js 带 limits 参数', async () => {
    const res = await fetch(`${BASE_URL}/sandbox/js`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TEST_TOKEN}`
      },
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
    const res = await fetch(`${BASE_URL}/sandbox/js`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TEST_TOKEN}`
      },
      body: JSON.stringify({
        code: 'async function main() { require("child_process"); return {} }',
        variables: {}
      })
    });
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.message).toContain('not allowed');
  });

  it('GET /sandbox/modules 返回可用模块列表', async () => {
    const res = await fetch(`${BASE_URL}/sandbox/modules`, {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` }
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    // JS
    expect(Array.isArray(data.data.js.allowedModules)).toBe(true);
    expect(data.data.js.allowedModules).toContain('lodash');
    expect(Array.isArray(data.data.js.builtinGlobals)).toBe(true);
    expect(data.data.js.builtinGlobals).toContain('SystemHelper');
    // Python
    expect(Array.isArray(data.data.python.blockedModules)).toBe(true);
    expect(Array.isArray(data.data.python.builtinGlobals)).toBe(true);
    expect(data.data.python.builtinGlobals).toContain('system_helper');
  });

  it('POST /sandbox/python 安全拦截', async () => {
    const res = await fetch(`${BASE_URL}/sandbox/python`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TEST_TOKEN}`
      },
      body: JSON.stringify({
        code: 'import os\ndef main(v):\n    return {}',
        variables: {}
      })
    });
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.message).toContain('not allowed');
  });
});
