import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const TEST_PORT = 3099;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const TEST_TOKEN = 'test-token-for-integration';

let server: any;

describe('API Integration', () => {
  beforeAll(async () => {
    // 动态启动服务
    process.env.SANDBOX_PORT = String(TEST_PORT);
    process.env.SANDBOX_TOKEN = TEST_TOKEN;

    // 使用 Bun 子进程启动服务
    const { spawn } = await import('child_process');
    server = spawn('bun', ['run', 'src/index.ts'], {
      cwd: new URL('../../', import.meta.url).pathname,
      env: {
        ...process.env,
        SANDBOX_PORT: String(TEST_PORT),
        SANDBOX_TOKEN: TEST_TOKEN
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // 等待服务启动
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Server start timeout')), 10000);
      const check = async () => {
        try {
          await fetch(`${BASE_URL}/health`);
          clearTimeout(timeout);
          resolve();
        } catch {
          setTimeout(check, 200);
        }
      };
      check();
    });
  });

  afterAll(async () => {
    if (server) {
      server.kill('SIGKILL');
      // 等待进程退出
      await new Promise((resolve) => {
        server.on('close', resolve);
        setTimeout(resolve, 2000);
      });
    }
  });

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
        limits: { timeoutMs: 5000, memoryMB: 32, diskMB: 5 }
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
