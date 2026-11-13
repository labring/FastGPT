import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it } from 'bun:test';
import { AGENT_SANDBOX_PROXY_SECRET_HEADER } from '@fastgpt/global/core/ai/sandbox/constants';
import { rewriteLoopbackEndpointUrl, verifyHs256JwtTicket } from '../src/auth';
import { parseProxyEnv } from '../src/env';
import { getPreviewContentType, parsePreviewRelativeSegments } from '../src/preview';
import { startProxyServers, type RunningProxyServers } from '../src/server';

const TEST_SECRET = 'test-proxy-shared-secret-32-bytes!';
const VALID_SESSION_ID = 'a12345678901234567890123';

function signTestJwt(params: {
  payload: Record<string, unknown>;
  secret?: string;
  header?: Record<string, unknown>;
}): string {
  const { payload, secret = TEST_SECRET, header = { alg: 'HS256', typ: 'JWT' } } = params;
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

const activeServers: Array<{ stop: () => void | Promise<void> }> = [];

afterEach(async () => {
  while (activeServers.length > 0) {
    const server = activeServers.pop();
    await server?.stop();
  }
});

describe('opensandbox-proxy unit & integration', () => {
  it('parses environment variables via Zod and enforces port rules', () => {
    const config = parseProxyEnv({
      PREVIEW_PORT: '   ',
      AGENT_SANDBOX_PROXY_SECRET: TEST_SECRET,
      FASTGPT_APP_URL: 'http://fastgpt:3000/'
    });
    expect(config.port).toBe(1006);
    expect(config.previewPort).toBeUndefined();
    expect(config.fastgptAppUrl).toBe('http://fastgpt:3000');

    expect(() =>
      parseProxyEnv({
        PORT: '1006',
        PREVIEW_PORT: '1006',
        AGENT_SANDBOX_PROXY_SECRET: TEST_SECRET,
        FASTGPT_APP_URL: 'http://fastgpt:3000'
      })
    ).toThrow('PREVIEW_PORT (1006) must differ from PORT (1006)');

    expect(
      rewriteLoopbackEndpointUrl(
        'http://127.0.0.1:8090/sandboxes/sbx-1/proxy/44772/',
        'host.docker.internal'
      )
    ).toBe('http://host.docker.internal:8090/sandboxes/sbx-1/proxy/44772');
  });

  it('validates HS256 JWT tickets locally and rejects forged or expired tokens before hitting app', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const validTicket = signTestJwt({
      payload: {
        sandboxId: 'sbx-1',
        ptySessionId: 'pty-1',
        exp: nowSec + 60
      }
    });
    const expiredTicket = signTestJwt({
      payload: {
        sandboxId: 'sbx-1',
        ptySessionId: 'pty-1',
        exp: nowSec - 5
      }
    });
    const algNoneTicket = signTestJwt({
      payload: { sandboxId: 'sbx-1', ptySessionId: 'pty-1', exp: nowSec + 60 },
      header: { alg: 'none', typ: 'JWT' }
    });

    expect(verifyHs256JwtTicket({ ticket: validTicket, secret: TEST_SECRET }).ok).toBe(true);
    expect(verifyHs256JwtTicket({ ticket: expiredTicket, secret: TEST_SECRET }).ok).toBe(false);
    expect(verifyHs256JwtTicket({ ticket: validTicket, secret: 'wrong-secret' }).ok).toBe(false);
    expect(verifyHs256JwtTicket({ ticket: algNoneTicket, secret: TEST_SECRET }).ok).toBe(false);

    let appCalls = 0;
    const appServer = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch: () => {
        appCalls += 1;
        return new Response('unexpected', { status: 500 });
      }
    });
    activeServers.push({ stop: () => appServer.stop(true) });

    const proxy: RunningProxyServers = startProxyServers(
      parseProxyEnv(
        {
          PORT: '0',
          AGENT_SANDBOX_PROXY_SECRET: TEST_SECRET,
          FASTGPT_APP_URL: `http://127.0.0.1:${appServer.port}`
        },
        { allowZeroPort: true }
      ),
      { hostname: '127.0.0.1' }
    );
    activeServers.push(proxy);

    const res = await fetch(
      `http://127.0.0.1:${proxy.mainServer.port}/terminal?ticket=${encodeURIComponent(expiredTicket)}`
    );
    expect(res.status).toBe(401);
    expect(appCalls).toBe(0);
  });

  it('relays binary (including 0-byte frames) and JSON PTY WebSocket frames 1:1, and resets client offset when reused=false', async () => {
    const receivedUpstreamHeaders: Record<string, string> = {};
    const receivedUpstreamFrames: Array<string | Uint8Array> = [];
    const upstreamQueries: string[] = [];
    let simulateReused = true;

    type MockUpstreamData = { apiKey: string; query: string };
    const execdServer = Bun.serve<MockUpstreamData>({
      hostname: '127.0.0.1',
      port: 0,
      fetch: (req, server) => {
        const url = new URL(req.url);
        if (url.pathname === '/sandboxes/sbx-live/proxy/44772/pty/pty-live/ws') {
          upstreamQueries.push(url.search);
          receivedUpstreamHeaders['open-sandbox-api-key'] =
            req.headers.get('open-sandbox-api-key') ?? '';
          const ok = server.upgrade(req, {
            data: {
              apiKey: req.headers.get('open-sandbox-api-key') ?? '',
              query: url.search
            }
          });
          return ok ? undefined : new Response('upgrade failed', { status: 400 });
        }
        return new Response('not found', { status: 404 });
      },
      websocket: {
        open: (ws) => {
          ws.send(JSON.stringify({ type: 'connected', session_id: 'pty-live' }));
          ws.send(new Uint8Array(0)); // 0-byte frame must not terminate session
          ws.send(new Uint8Array([0x01, 0x68, 0x69])); // stdout: "hi"
        },
        message: (ws, message) => {
          if (typeof message === 'string') {
            receivedUpstreamFrames.push(message);
          } else {
            const bytes = new Uint8Array(message.buffer, message.byteOffset, message.byteLength);
            receivedUpstreamFrames.push(bytes.slice());
            if (bytes[0] === 0x00) {
              const echoed = new Uint8Array(bytes.byteLength);
              echoed[0] = 0x01;
              echoed.set(bytes.subarray(1), 1);
              ws.send(echoed);
            }
          }
        }
      }
    });
    activeServers.push({ stop: () => execdServer.stop(true) });

    const keepalivePayloads: string[][] = [];
    const appServer = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch: async (req) => {
        const url = new URL(req.url);
        if (req.headers.get(AGENT_SANDBOX_PROXY_SECRET_HEADER) !== TEST_SECRET) {
          return new Response('unauthorized', { status: 401 });
        }
        if (url.pathname === '/api/core/ai/sandbox/verifyTicket') {
          return Response.json({
            code: 200,
            data: {
              sandboxId: 'sbx-live',
              execdBaseUrl: `http://127.0.0.1:${execdServer.port}/sandboxes/sbx-live/proxy/44772`,
              execdHeaders: { 'OPEN-SANDBOX-API-KEY': 'os-secret-key' },
              ptySessionId: 'pty-live',
              reused: simulateReused
            }
          });
        }
        if (url.pathname === '/api/core/ai/sandbox/keepalive') {
          const body = (await req.json()) as { sandboxIds: string[] };
          keepalivePayloads.push(body.sandboxIds);
          return Response.json({ code: 200, data: null });
        }
        return new Response('not found', { status: 404 });
      }
    });
    activeServers.push({ stop: () => appServer.stop(true) });

    const proxy = startProxyServers(
      parseProxyEnv(
        {
          PORT: '0',
          AGENT_SANDBOX_PROXY_SECRET: TEST_SECRET,
          FASTGPT_APP_URL: `http://127.0.0.1:${appServer.port}`,
          KEEPALIVE_INTERVAL_MS: '60000'
        },
        { allowZeroPort: true }
      ),
      { hostname: '127.0.0.1' }
    );
    activeServers.push(proxy);

    const ticket = signTestJwt({
      payload: {
        sandboxId: 'sbx-live',
        ptySessionId: 'pty-live',
        exp: Math.floor(Date.now() / 1000) + 60
      }
    });

    // Case 1: reused=true keeps client since=42
    const clientFrames: Array<string | Uint8Array> = [];
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(
        `ws://127.0.0.1:${proxy.mainServer.port}/terminal?ticket=${encodeURIComponent(ticket)}&since=42`
      );
      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'resize', cols: 120, rows: 36 }));
        ws.send(new Uint8Array([0x00, 0x6c, 0x73, 0x0a])); // stdin: "ls\n"
      };

      ws.onmessage = async (event) => {
        if (typeof event.data === 'string') {
          clientFrames.push(event.data);
        } else if (event.data instanceof ArrayBuffer) {
          clientFrames.push(new Uint8Array(event.data));
        }

        if (clientFrames.length >= 4) {
          await proxy.keepalive.flush();
          ws.close();
        }
      };

      ws.onclose = () => resolve();
      ws.onerror = () => reject(new Error('Client WebSocket error'));
    });

    expect(upstreamQueries[0]).toBe('?takeover=1&since=42');
    expect(receivedUpstreamHeaders['open-sandbox-api-key']).toBe('os-secret-key');
    expect(clientFrames[0]).toBe(JSON.stringify({ type: 'connected', session_id: 'pty-live' }));
    expect(Array.from(clientFrames[1] as Uint8Array)).toEqual([]);
    expect(Array.from(clientFrames[2] as Uint8Array)).toEqual([0x01, 0x68, 0x69]);
    expect(Array.from(clientFrames[3] as Uint8Array)).toEqual([0x01, 0x6c, 0x73, 0x0a]);
    expect(receivedUpstreamFrames[0]).toBe(JSON.stringify({ type: 'resize', cols: 120, rows: 36 }));
    expect(Array.from(receivedUpstreamFrames[1] as Uint8Array)).toEqual([0x00, 0x6c, 0x73, 0x0a]);
    expect(keepalivePayloads).toEqual([['sbx-live']]);

    await new Promise((r) => setTimeout(r, 20));
    await proxy.keepalive.flush();
    expect(keepalivePayloads).toHaveLength(1);

    // Case 2: reused=false with non-zero since=42 connects upstream with since=0 AND emits {type:'offset',offset:0} first
    simulateReused = false;
    const recreatedFrames: Array<string | Uint8Array> = [];
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(
        `ws://127.0.0.1:${proxy.mainServer.port}/terminal?ticket=${encodeURIComponent(ticket)}&since=42`
      );
      ws.binaryType = 'arraybuffer';

      ws.onmessage = (event) => {
        if (typeof event.data === 'string') {
          recreatedFrames.push(event.data);
        } else if (event.data instanceof ArrayBuffer) {
          recreatedFrames.push(new Uint8Array(event.data));
        }
        if (recreatedFrames.length >= 4) {
          ws.close();
        }
      };

      ws.onclose = () => resolve();
      ws.onerror = () => reject(new Error('Client WebSocket error'));
    });

    expect(upstreamQueries[1]).toBe('?takeover=1&since=0');
    expect(recreatedFrames[0]).toBe(JSON.stringify({ type: 'offset', offset: 0 }));
    expect(recreatedFrames[1]).toBe(JSON.stringify({ type: 'connected', session_id: 'pty-live' }));
  });

  it('serves HTTP previews with IANA MIME types, 30s cache, bounded 502 failover retry, Range streaming, and path traversal defense', async () => {
    expect(getPreviewContentType('/workspace/dist/index.html')).toBe('text/html; charset=utf-8');
    expect(getPreviewContentType('/workspace/dist/app.mjs')).toBe('text/javascript; charset=utf-8');
    expect(getPreviewContentType('/workspace/dist/app.cjs')).toBe('text/javascript; charset=utf-8');
    expect(getPreviewContentType('/workspace/data/config.json')).toBe(
      'application/json; charset=utf-8'
    );
    expect(getPreviewContentType('/workspace/assets/logo.svg')).toBe('image/svg+xml');
    expect(getPreviewContentType('/workspace/assets/model.glb')).toBe('model/gltf-binary');
    expect(getPreviewContentType('/workspace/bin/raw.unknownext')).toBe('application/octet-stream');

    let failFirstExecd = false;
    let execdHits = 0;

    const execdServer = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch: (req) => {
        execdHits += 1;
        if (failFirstExecd) {
          failFirstExecd = false;
          return new Response('Bad Gateway', { status: 502 });
        }
        if (req.method === 'HEAD') {
          return new Response('Method Not Allowed', { status: 405 });
        }

        const url = new URL(req.url);
        const filePath = url.searchParams.get('path') ?? '';
        const content = `content-of:${filePath}`;
        const range = req.headers.get('range');
        if (range === 'bytes=0-9') {
          return new Response(content.slice(0, 10), {
            status: 206,
            headers: {
              'Content-Range': `bytes 0-9/${content.length}`,
              'Accept-Ranges': 'bytes',
              'Content-Length': '10'
            }
          });
        }
        return new Response(content, {
          status: 200,
          headers: {
            'Content-Length': String(Buffer.byteLength(content)),
            ETag: '"etag-1"'
          }
        });
      }
    });
    activeServers.push({ stop: () => execdServer.stop(true) });

    let verifyHits = 0;
    let simulatedVerifyMode: 'ok' | 'forbidden' | 'server_error' = 'ok';
    const keepaliveBatches: string[][] = [];
    const appServer = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch: async (req) => {
        const url = new URL(req.url);
        if (url.pathname === '/api/core/ai/sandbox/verifyTicket') {
          verifyHits += 1;
          if (simulatedVerifyMode === 'forbidden') {
            return Response.json(
              { code: 510000, message: 'agentSandboxPermissionDenied' },
              { status: 403 }
            );
          }
          if (simulatedVerifyMode === 'server_error') {
            return Response.json({ code: 500, message: 'db unavailable' }, { status: 500 });
          }
          return Response.json({
            code: 200,
            data: {
              sandboxId: 'sbx-preview',
              execdBaseUrl: `http://127.0.0.1:${execdServer.port}/sandboxes/sbx-preview/proxy/44772`,
              execdHeaders: { 'OPEN-SANDBOX-API-KEY': 'os-key' },
              rootDirectory: '/workspace'
            }
          });
        }
        if (url.pathname === '/api/core/ai/sandbox/keepalive') {
          const body = (await req.json()) as { sandboxIds: string[] };
          keepaliveBatches.push(body.sandboxIds);
          return Response.json({ code: 200, data: null });
        }
        return new Response('not found', { status: 404 });
      }
    });
    activeServers.push({ stop: () => appServer.stop(true) });

    const proxy = startProxyServers(
      parseProxyEnv(
        {
          PORT: '0',
          AGENT_SANDBOX_PROXY_SECRET: TEST_SECRET,
          FASTGPT_APP_URL: `http://127.0.0.1:${appServer.port}`
        },
        { allowZeroPort: true }
      ),
      { hostname: '127.0.0.1' }
    );
    activeServers.push(proxy);

    const base = `http://127.0.0.1:${proxy.mainServer.port}`;

    expect(parsePreviewRelativeSegments('%2e%2e/etc/passwd')).toEqual({
      ok: false,
      status: 403,
      error: 'Path traversal is not allowed'
    });
    expect((await fetch(`${base}/preview/INVALID_ID/index.html`)).status).toBe(400);
    expect((await fetch(`${base}/preview/${VALID_SESSION_ID}/%2e%2e/etc/passwd`)).status).toBe(400);
    expect((await fetch(`${base}/preview/${VALID_SESSION_ID}/dist%2f..%2fsecret`)).status).toBe(
      403
    );
    expect((await fetch(`${base}/preview/${VALID_SESSION_ID}/.fastgpt/bun/bin/bun`)).status).toBe(
      403
    );
    expect(verifyHits).toBe(0);

    simulatedVerifyMode = 'forbidden';
    expect((await fetch(`${base}/preview/b12345678901234567890123/index.html`)).status).toBe(403);
    simulatedVerifyMode = 'server_error';
    expect((await fetch(`${base}/preview/c12345678901234567890123/index.html`)).status).toBe(502);
    simulatedVerifyMode = 'ok';
    verifyHits = 0;

    const [htmlRes, jsRes] = await Promise.all([
      fetch(`${base}/preview/${VALID_SESSION_ID}/dist/`),
      fetch(`${base}/preview/${VALID_SESSION_ID}/dist/app.mjs`)
    ]);
    expect(htmlRes.status).toBe(200);
    expect(await htmlRes.text()).toBe('content-of:/workspace/dist/index.html');
    expect(htmlRes.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(htmlRes.headers.get('content-security-policy')).toBe(
      'sandbox allow-scripts allow-forms allow-popups;'
    );
    expect(jsRes.status).toBe(200);
    expect(jsRes.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
    expect(verifyHits).toBe(1);

    const rangeRes = await fetch(`${base}/preview/${VALID_SESSION_ID}/video.mp4`, {
      headers: { Range: 'bytes=0-9' }
    });
    expect(rangeRes.status).toBe(206);
    expect(await rangeRes.text()).toBe('content-of');

    const headRes = await fetch(`${base}/preview/${VALID_SESSION_ID}/video.mp4`, {
      method: 'HEAD'
    });
    expect(headRes.status).toBe(200);
    expect(await headRes.text()).toBe('');
    expect(verifyHits).toBe(1);

    failFirstExecd = true;
    const retryRes = await fetch(`${base}/preview/${VALID_SESSION_ID}/dist/style.css`);
    expect(retryRes.status).toBe(200);
    expect(retryRes.headers.get('content-type')).toBe('text/css; charset=utf-8');
    expect(verifyHits).toBe(2);
    expect(execdHits).toBeGreaterThanOrEqual(5);

    await proxy.keepalive.flush();
    expect(keepaliveBatches).toEqual([['sbx-preview']]);
    await proxy.keepalive.flush();
    expect(keepaliveBatches).toHaveLength(1);
  });

  it('isolates /terminal and /preview/* when PREVIEW_PORT is configured', async () => {
    const proxy = startProxyServers(
      parseProxyEnv(
        {
          PORT: '0',
          PREVIEW_PORT: '0',
          AGENT_SANDBOX_PROXY_SECRET: TEST_SECRET,
          FASTGPT_APP_URL: 'http://127.0.0.1:3000'
        },
        { allowZeroPort: true }
      ),
      {
        hostname: '127.0.0.1',
        authClient: {
          verifyTerminalTicket: async () => {
            throw new Error('unused');
          },
          verifyPreviewSession: async () => ({
            sandboxId: 'sbx-split',
            execdBaseUrl: 'http://127.0.0.1:9999',
            execdHeaders: {},
            rootDirectory: '/workspace'
          }),
          sendKeepalive: async () => {}
        },
        fetchImpl: async () => new Response('ok-split', { status: 200 })
      }
    );
    activeServers.push(proxy);

    const terminalBase = `http://127.0.0.1:${proxy.mainServer.port}`;
    const previewBase = `http://127.0.0.1:${proxy.previewServer!.port}`;

    expect((await fetch(`${terminalBase}/health`)).status).toBe(200);
    expect((await fetch(`${previewBase}/health`)).status).toBe(200);
    expect((await fetch(`${terminalBase}/preview/${VALID_SESSION_ID}/index.html`)).status).toBe(
      404
    );
    expect((await fetch(`${previewBase}/preview/${VALID_SESSION_ID}/index.html`)).status).toBe(200);
    expect((await fetch(`${previewBase}/terminal`)).status).toBe(404);
    expect((await fetch(`${terminalBase}/terminal`)).status).toBe(401);
  });
});
