import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'http';
import type { AddressInfo } from 'net';
import { probeUrlConnection } from '../../../../common/system/systemInstanceConfig/probe';

describe('probeUrlConnection', () => {
  let server: http.Server;
  let serverPort: number;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === '/api/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
      } else if (req.url === '/error') {
        res.writeHead(500);
        res.end('internal error');
      } else {
        res.writeHead(404);
        res.end('not found');
      }
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        serverPort = (server.address() as AddressInfo).port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('successfully probes a real local internal endpoint (without being blocked by SSRF interceptor)', async () => {
    const result = await probeUrlConnection({
      url: `http://127.0.0.1:${serverPort}/api/status`,
      timeoutMs: 2000
    });

    // 内部服务必须被认定为网络连通
    expect(result.connected).toBe(true);
    expect(result.status).toBe(200);
    expect(result.statusText).toBe('OK');
    expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('considers non-2xx HTTP responses as connected', async () => {
    const res404 = await probeUrlConnection({
      url: `http://127.0.0.1:${serverPort}/non-exist`,
      timeoutMs: 2000
    });
    expect(res404.connected).toBe(true);
    expect(res404.status).toBe(404);

    const res500 = await probeUrlConnection({
      url: `http://127.0.0.1:${serverPort}/error`,
      timeoutMs: 2000
    });
    expect(res500.connected).toBe(true);
    expect(res500.status).toBe(500);
  });

  it('gracefully handles unreachable port without throwing', async () => {
    // 选一个关闭的端口
    const result = await probeUrlConnection({
      url: 'http://127.0.0.1:59999/non-existing-health',
      timeoutMs: 1000
    });

    expect(result.connected).toBe(false);
    expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);
    expect(result.error).toBeDefined();
  });

  it('rejects unsupported protocols gracefully without throwing', async () => {
    const result = await probeUrlConnection({
      url: 'file:///etc/passwd',
      timeoutMs: 1000
    });

    expect(result.connected).toBe(false);
    expect(result.error).toContain('Only HTTP and HTTPS');
  });

  it('handles invalid DNS hostname (.invalid per RFC 2606) without throwing', async () => {
    const result = await probeUrlConnection({
      url: 'http://probe-test-fake-domain.invalid',
      timeoutMs: 1000
    });

    expect(result.connected).toBe(false);
    expect(result.error).toBeDefined();
  });
});
