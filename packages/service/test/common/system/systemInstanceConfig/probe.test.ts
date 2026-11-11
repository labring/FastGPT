import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'http';
import type { AddressInfo } from 'net';
import { probeUrlConnection } from '../../../../common/system/systemInstanceConfig/probe';

describe('probeUrlConnection', () => {
  let server: http.Server;
  let baseUrl: string;
  let sandboxCalls = 0;
  let sseCloses = 0;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === '/api/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
      } else if (req.url === '/error') {
        res.writeHead(500);
        res.end('internal error');
      } else if (req.url === '/sandbox/js' || req.url === '/invalid/sandbox/js') {
        sandboxCalls++;
        let body = '';
        req.on('data', (chunk) => (body += chunk.toString()));
        req.on('end', () => {
          const input = JSON.parse(body);
          expect(input.code).toContain('6 * 7');
          expect(input.variables).toEqual({});
          if (req.headers.authorization !== 'Bearer sandbox-secret') {
            res.writeHead(401);
            res.end('secret request body must never escape');
          } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                success: true,
                data: { codeReturn: { result: req.url === '/sandbox/js' ? 42 : 0 } }
              })
            );
          }
        });
      } else if (req.url?.endsWith('/sse')) {
        const key = req.url.split('/').at(-2);
        if (req.url.startsWith('/redirect/')) {
          res.writeHead(302, { Location: `/sandbox/js` });
          return res.end();
        }
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.on('close', () => sseCloses++);
        if (req.url.startsWith('/large/')) {
          res.write('x'.repeat(20 * 1024));
        } else if (!req.url.startsWith('/slow/')) {
          const host = req.url.startsWith('/foreign/') ? 'http://elsewhere.invalid' : '';
          const prefix = req.url.startsWith('/foreign/')
            ? '/foreign'
            : req.url.startsWith('/bad-path/')
              ? '/bad-path/unexpected'
              : '';
          res.write(
            `event: endpoint\ndata: ${host}${prefix}/${key}/messages?sessionId=test-session\n\n`
          );
        }
      } else {
        res.writeHead(404);
        res.end('not found');
      }
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('preserves generic HTTP reachability, including non-2xx statuses', async () => {
    await expect(
      probeUrlConnection({ url: `${baseUrl}/api/status`, timeoutMs: 2000 })
    ).resolves.toMatchObject({ connected: true, status: 200 });
    await expect(
      probeUrlConnection({ url: `${baseUrl}/missing`, timeoutMs: 2000 })
    ).resolves.toMatchObject({ connected: true, status: 404 });
    await expect(
      probeUrlConnection({ url: `${baseUrl}/error`, timeoutMs: 2000 })
    ).resolves.toMatchObject({ connected: true, status: 500 });
  });

  it('validates sandbox authentication and the actual computation without returning the response body', async () => {
    await expect(
      probeUrlConnection({
        service: 'codeSandbox',
        url: baseUrl,
        token: 'sandbox-secret',
        timeoutMs: 2000
      })
    ).resolves.toMatchObject({ connected: true, status: 200 });
    for (const [url, token] of [
      [baseUrl, 'wrong-secret'],
      [`${baseUrl}/invalid`, 'sandbox-secret']
    ]) {
      const result = await probeUrlConnection({
        service: 'codeSandbox',
        url,
        token,
        timeoutMs: 2000
      });
      expect(result).toMatchObject({ connected: false, errorCode: 'response' });
      expect(JSON.stringify(result)).not.toContain(token);
      expect(JSON.stringify(result)).not.toContain('secret request body');
    }
    const count = sandboxCalls;
    expect(
      (
        await probeUrlConnection({
          service: 'codeSandbox',
          url: baseUrl,
          token: '',
          timeoutMs: 2000
        })
      ).connected
    ).toBe(false);
    expect(sandboxCalls).toBe(count);
  });

  it('validates an SSE endpoint handshake, closes it, and rejects foreign origins or redirects', async () => {
    const before = sseCloses;
    await expect(
      probeUrlConnection({ service: 'mcpSse', url: baseUrl, timeoutMs: 2000 })
    ).resolves.toMatchObject({ connected: true, status: 200 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(sseCloses).toBeGreaterThan(before);
    await expect(
      probeUrlConnection({ service: 'mcpSse', url: `${baseUrl}/foreign`, timeoutMs: 2000 })
    ).resolves.toMatchObject({ connected: false, status: 200, errorCode: 'response' });
    await expect(
      probeUrlConnection({ service: 'mcpSse', url: `${baseUrl}/bad-path`, timeoutMs: 2000 })
    ).resolves.toMatchObject({ connected: false, status: 200, errorCode: 'response' });
    await expect(
      probeUrlConnection({ service: 'mcpSse', url: `${baseUrl}/redirect`, timeoutMs: 2000 })
    ).resolves.toMatchObject({ connected: false, status: 302, errorCode: 'response' });
    expect(
      (await probeUrlConnection({ service: 'mcpSse', url: `${baseUrl}/large`, timeoutMs: 2000 }))
        .connected
    ).toBe(false);
  });

  it('bounds stalled SSE and reports safe transport errors', async () => {
    await expect(
      probeUrlConnection({ service: 'mcpSse', url: `${baseUrl}/slow`, timeoutMs: 500 })
    ).resolves.toMatchObject({ connected: false, errorCode: 'timeout' });
    await expect(
      probeUrlConnection({ url: 'file:///etc/passwd', timeoutMs: 1000 })
    ).resolves.toMatchObject({ connected: false, errorCode: 'protocol' });
    const result = await probeUrlConnection({ url: 'http://127.0.0.1:59999', timeoutMs: 1000 });
    expect(result).toMatchObject({
      connected: false,
      error: 'Connection failed'
    });
    // 网络代理可能将本地拒绝转换为超时，但两者都应返回安全的分类而不是底层异常。
    expect(['refused', 'timeout']).toContain(result.errorCode);
  });
});
