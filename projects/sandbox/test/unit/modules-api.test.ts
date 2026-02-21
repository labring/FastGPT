/**
 * GET /sandbox/modules 单元测试
 * 直接通过 Hono app.request() 测试，无需启动服务
 */
import { describe, it, expect } from 'vitest';
import { app } from '../../src/index';
import { config } from '../../src/config';

describe('GET /sandbox/modules', () => {
  it('返回正确的响应结构', async () => {
    const res = await app.request('/sandbox/modules');
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.data.js).toBeDefined();
    expect(body.data.python).toBeDefined();
  });

  it('JS allowedModules 与 config 一致', async () => {
    const res = await app.request('/sandbox/modules');
    const body = await res.json();

    expect(body.data.js.allowedModules).toEqual(config.jsAllowedModules);
  });

  it('Python blockedModules 与 config 一致', async () => {
    const res = await app.request('/sandbox/modules');
    const body = await res.json();

    expect(body.data.python.blockedModules).toEqual(config.pythonBlockedModules);
  });

  it('JS builtinGlobals 包含核心 API', async () => {
    const res = await app.request('/sandbox/modules');
    const body = await res.json();

    const globals = body.data.js.builtinGlobals;
    expect(globals).toContain('SystemHelper');
    expect(globals).toContain('httpRequest');
    expect(globals).toContain('countToken');
    expect(globals).toContain('delay');
  });

  it('Python builtinGlobals 包含核心 API', async () => {
    const res = await app.request('/sandbox/modules');
    const body = await res.json();

    const globals = body.data.python.builtinGlobals;
    expect(globals).toContain('system_helper');
    expect(globals).toContain('http_request');
    expect(globals).toContain('count_token');
    expect(globals).toContain('delay');
  });
});
