import type { IncomingMessage } from 'http';
import { createServer, ServerResponse } from 'http';
import next from 'next';
import httpProxy from 'http-proxy';
import { Readable } from 'stream';
import net from 'net';
import crypto from 'crypto';

const dev = process.env.NODE_ENV !== 'production';
const port = parseInt(process.env.PORT || '3000', 10);

// sandboxId: alphanumeric + hyphens, 8–64 chars, must start/end with alnum.
// Explicitly excludes '.', '/', '%', '..', and other path-traversal characters.
const SANDBOX_ID_RE = /[a-zA-Z0-9][a-zA-Z0-9-]{6,62}[a-zA-Z0-9]/;

// Match /proxy/{sandboxId}/{port} or /absproxy/{sandboxId}/{port}
const PATH_PROXY_RE = new RegExp(`^\\/(proxy|absproxy)\\/(${SANDBOX_ID_RE.source})\\/(\\d+)`);

// Match /tcptunnel/{sandboxId}/{port} — WebSocket upgrade only
const TCPTUNNEL_RE = new RegExp(`^\\/tcptunnel\\/(${SANDBOX_ID_RE.source})\\/(\\d+)`);

// Strip subdomain prefix from a host string (may include :port).
// "port--uuid.localhost:3000" → "localhost:3000"
function deriveBaseHost(subdomainHost: string): string {
  const dotIdx = subdomainHost.indexOf('.');
  return dotIdx >= 0 ? subdomainHost.substring(dotIdx + 1) : subdomainHost;
}

async function main() {
  const app = next({ dev });
  const handle = app.getRequestHandler();
  await app.prepare();

  // Import pure utilities from sandboxProxyUtils — no service-layer deps, safe in tsx CJS mode.
  // getSandboxProxyTarget is NOT imported here; auth is delegated to the proxyAuth API route.
  const {
    parseSubdomainProxy,
    rewriteHtml,
    redeemRelayToken,
    ensureCodeServerSession,
    deleteCsSession
  } = (await import(
    './src/service/core/sandbox/proxyUtils'
  )) as typeof import('./src/service/core/sandbox/proxyUtils');

  // Fetch the code-server password from the container config.yaml via the internal API.
  async function fetchCodeServerPassword(sandboxId: string): Promise<string | null> {
    try {
      const resp = await fetch(`http://127.0.0.1:${port}/api/core/sandbox/proxyCSPassword`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sandboxId })
      });
      if (!resp.ok) return null;
      const { password } = await resp.json();
      return password || null;
    } catch {
      return null;
    }
  }

  // Inject code-server session cookie into an outgoing request header object.
  function injectCsKey(reqHeaders: IncomingMessage['headers'], key: string): void {
    const existing = (reqHeaders.cookie as string | undefined) ?? '';
    const stripped = existing
      .split(';')
      .map((s) => s.trim())
      .filter((s) => !s.toLowerCase().startsWith('code-server-session='))
      .join('; ');
    reqHeaders.cookie = stripped
      ? `${stripped}; code-server-session=${key}`
      : `code-server-session=${key}`;
  }

  // Build the correct code-server login base URL.
  // After prefix stripping, req.url starts with /proxy/8080/... when going through execd.
  // In that case the login endpoint is at target/proxy/8080, not target/login directly.
  function deriveCsLoginTarget(target: string, url: string): string {
    const m = url.match(/^\/proxy\/(\d+)/);
    return m ? `${target}/proxy/${m[1]}` : target;
  }

  // Ensure code-server is authenticated and inject the session cookie into reqHeaders.
  async function injectCodeServerAuth(
    reqHeaders: IncomingMessage['headers'],
    sandboxId: string,
    target: string
  ): Promise<void> {
    const key = await ensureCodeServerSession(sandboxId, target, () =>
      fetchCodeServerPassword(sandboxId)
    );
    if (key) injectCsKey(reqHeaders, key);
  }

  const proxy = httpProxy.createProxyServer({ xfwd: true, changeOrigin: true });
  proxy.on(
    'error',
    (err: Error, _req: IncomingMessage, res: ServerResponse | import('stream').Duplex) => {
      if (res instanceof ServerResponse && !res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'text/plain' });
        res.end(`Proxy error: ${err.message}`);
      }
    }
  );

  // Detect code-server session expiry: if the upstream returns a 302 to /login,
  // evict the cached CS session so the next request triggers a fresh login.
  proxy.on('proxyRes', (proxyRes, req) => {
    if (
      proxyRes.statusCode === 302 &&
      typeof proxyRes.headers.location === 'string' &&
      proxyRes.headers.location.includes('/login')
    ) {
      const sid = (req as IncomingMessage).headers['x-fastgpt-sandbox-id'] as string | undefined;
      if (sid) {
        dev && console.log(`[proxy:cs] session expired, evicting csSession sandboxId=${sid}`);
        deleteCsSession(sid);
      }
    }
  });

  // absproxy: fetch upstream then rewrite HTML paths with base prefix
  async function handleAbsProxy(
    req: IncomingMessage,
    res: ServerResponse,
    target: string,
    sandboxId: string,
    targetPort: string
  ) {
    const upstreamUrl = `${target}${req.url || '/'}`;
    const response = await fetch(upstreamUrl, {
      method: req.method,
      headers: buildProxyHeaders(req.headers),
      // @ts-ignore — Node 18+ supports duplex on fetch body streams
      duplex: 'half',
      body: req.method !== 'GET' && req.method !== 'HEAD' ? (req as any) : undefined
    });

    const skipHeaders = new Set([
      'content-encoding',
      'transfer-encoding',
      'x-frame-options',
      'content-security-policy'
    ]);
    response.headers.forEach((value, key) => {
      if (!skipHeaders.has(key.toLowerCase())) res.setHeader(key, value);
    });
    res.statusCode = response.status;

    const contentType = response.headers.get('content-type') || '';
    const contentLength = Number(response.headers.get('content-length') || 0);

    // Only rewrite HTML; stream large or binary responses directly
    if (contentType.includes('text/html') && response.body && contentLength < 10 * 1024 * 1024) {
      const html = await response.text();
      const basePath = `/absproxy/${sandboxId}/${targetPort}`;
      const rewritten = rewriteHtml(html, basePath);
      res.setHeader('content-length', Buffer.byteLength(rewritten));
      res.end(rewritten);
    } else if (response.body) {
      Readable.fromWeb(response.body as any).pipe(res);
    } else {
      res.end();
    }
  }

  async function handleProxy(
    req: IncomingMessage,
    res: ServerResponse,
    sandboxId: string,
    portNum: number,
    proxyType: string
  ) {
    try {
      const target = await authProxyTarget(req.headers, sandboxId, portNum);
      const csTarget = deriveCsLoginTarget(target, req.url || '');
      if (proxyType === 'absproxy') {
        await injectCodeServerAuth(req.headers, sandboxId, csTarget);
        await handleAbsProxy(req, res, target, sandboxId, String(portNum));
      } else {
        // Rewrite Origin so code-server's CSRF check passes (changeOrigin only rewrites Host).
        const targetUrl = new URL(target);
        await injectCodeServerAuth(req.headers, sandboxId, csTarget);
        // Mark the request so the proxyRes handler can identify the sandbox on session expiry.
        req.headers['x-fastgpt-sandbox-id'] = sandboxId;
        proxy.web(req, res, {
          target,
          headers: { origin: `${targetUrl.protocol}//${targetUrl.host}` }
        });
      }
    } catch (err: any) {
      const status = err.statusCode || 502;
      if (!res.headersSent) {
        res.writeHead(status, { 'Content-Type': 'text/plain' });
        res.end(err.message || 'Proxy error');
      }
    }
  }

  // Subdomain proxy handler: on auth failure (401/403) redirect to proxyAuth for cross-domain cookie hand-off.
  async function handleSubdomainProxy(
    req: IncomingMessage,
    res: ServerResponse,
    sandboxId: string,
    portNum: number
  ) {
    // Check for relay token in query string (?__pt=<nonce>).
    // proxyAuth GET redirects here after storing fastgptToken server-side.
    // We set the cookie from this subdomain so Chrome scopes it correctly.
    const urlObj = new URL(`http://placeholder${req.url || '/'}`);
    const relayToken = urlObj.searchParams.get('__pt');
    if (relayToken) {
      const fastgptToken = redeemRelayToken(relayToken);
      if (fastgptToken) {
        urlObj.searchParams.delete('__pt');
        const cleanUrl = urlObj.pathname + (urlObj.search !== '?' ? urlObj.search : '');
        dev &&
          console.log(
            `[proxy:subdomain] relay token redeemed, setting cookie and redirecting to ${cleanUrl}`
          );
        res.setHeader(
          'Set-Cookie',
          `fastgpt_token=${fastgptToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`
        );
        res.writeHead(302, { Location: cleanUrl || '/' });
        res.end();
        return;
      }
      console.warn(`[proxy:subdomain] relay token invalid or expired: ${relayToken}`);
    }

    try {
      const target = await authProxyTarget(req.headers, sandboxId, portNum);
      const targetUrl = new URL(target);
      const csTarget = deriveCsLoginTarget(target, req.url || '');
      await injectCodeServerAuth(req.headers, sandboxId, csTarget);
      req.headers['x-fastgpt-sandbox-id'] = sandboxId;
      proxy.web(req, res, {
        target,
        headers: { origin: `${targetUrl.protocol}//${targetUrl.host}` }
      });
    } catch (err: any) {
      const status = err.statusCode || 502;
      // Auth failure — redirect to proxyAuth on the base origin for cookie hand-off
      if (status === 401 || status === 403) {
        const host = req.headers.host!;
        const proto = (req.headers['x-forwarded-proto'] as string) || 'http';
        const originalUrl = `${proto}://${host}${req.url || '/'}`;
        const authBase = `${proto}://${deriveBaseHost(host)}`;
        const authUrl = new URL(`${authBase}/api/core/sandbox/proxyAuth`);
        authUrl.searchParams.set('sandboxId', sandboxId);
        authUrl.searchParams.set('port', String(portNum));
        authUrl.searchParams.set('next', originalUrl);
        console.warn(
          `[proxy:subdomain] auth failed (${status}), redirecting to proxyAuth. next=${originalUrl}`
        );
        res.writeHead(302, { Location: authUrl.toString() });
        res.end();
        return;
      }
      if (!res.headersSent) {
        res.writeHead(status, { 'Content-Type': 'text/plain' });
        res.end(err.message || 'Proxy error');
      }
    }
  }

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const parsedUrl = new URL(req.url || '/', 'http://localhost');

    // ① Check subdomain proxy first: {port}--{sandboxId}.{baseDomain}
    const subdomain = parseSubdomainProxy(req.headers.host);
    if (subdomain) {
      await handleSubdomainProxy(req, res, subdomain.sandboxId, subdomain.port);
      return;
    }

    // ② Path-based proxy: /proxy/{sandboxId}/{port} or /absproxy/{sandboxId}/{port}
    const match = parsedUrl.pathname?.match(PATH_PROXY_RE);
    if (match) {
      const [, proxyType, sandboxId, portStr] = match;
      // Strip proxy prefix so upstream sees the real path
      req.url = req.url!.replace(`/${proxyType}/${sandboxId}/${portStr}`, '') || '/';
      await handleProxy(req, res, sandboxId, Number(portStr), proxyType);
      return;
    }

    // ③ Fall through to Next.js handler
    handle(req, res);
  });

  // WebSocket upgrade handler — supports all three proxy modes
  server.on('upgrade', async (req: IncomingMessage, socket, head) => {
    // ① tcptunnel: raw TCP-over-WebSocket, handled before all other upgrade logic
    const tunnelMatch = req.url?.match(TCPTUNNEL_RE);
    if (tunnelMatch) {
      const tunnelSandboxId = tunnelMatch[1];
      const tunnelPort = Number(tunnelMatch[2]);
      dev &&
        console.log(
          `[proxy:tcptunnel] upgrade sandboxId=${tunnelSandboxId} port=${tunnelPort} hasCookie=${!!req.headers.cookie}`
        );

      let target: string;
      try {
        target = await authProxyTarget(req.headers, tunnelSandboxId, tunnelPort);
        dev && console.log(`[proxy:tcptunnel] auth ok target=${target}`);
      } catch (err: any) {
        const status = err.statusCode || 502;
        console.error(`[proxy:tcptunnel] auth failed status=${status} message=${err.message}`);
        socket.write(`HTTP/1.1 ${status} ${err.message || 'Auth error'}\r\n\r\n`);
        socket.destroy();
        return;
      }

      // Parse host from auth target URL
      const targetUrl = new URL(target);
      const containerHost = targetUrl.hostname;
      const containerPort = tunnelPort;

      // Complete WebSocket handshake (RFC 6455 §4.2.2)
      const wsKey = req.headers['sec-websocket-key'];
      if (!wsKey) {
        socket.write('HTTP/1.1 400 Missing Sec-WebSocket-Key\r\n\r\n');
        socket.destroy();
        return;
      }
      const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
      const acceptKey = crypto
        .createHash('sha1')
        .update(wsKey + WS_GUID)
        .digest('base64');

      // Connect to TCP target first, then send 101 after connect
      const tcpSocket = net.createConnection({ host: containerHost, port: containerPort });
      let closed = false;

      function cleanup() {
        if (closed) return;
        closed = true;
        tcpSocket.destroy();
        socket.destroy();
      }

      tcpSocket.once('connect', () => {
        dev &&
          console.log(
            `[proxy:tcptunnel] TCP connected host=${containerHost} port=${containerPort}`
          );

        // Send 101 after TCP is ready
        socket.write(
          'HTTP/1.1 101 Switching Protocols\r\n' +
            'Upgrade: websocket\r\n' +
            'Connection: Upgrade\r\n' +
            `Sec-WebSocket-Accept: ${acceptKey}\r\n` +
            '\r\n'
        );

        // Flush any buffered data that came in with the upgrade request
        const decoder = new WsFrameDecoder();
        if (head && head.length > 0) {
          for (const payload of decoder.push(head)) {
            if (payload.length === 0) {
              cleanup();
              return;
            }
            tcpSocket.write(payload);
          }
        }

        // Browser → TCP: decode WS frames, write raw bytes to tcpSocket
        socket.on('data', (chunk: Buffer) => {
          if (closed) return;
          for (const payload of decoder.push(chunk)) {
            if (payload.length === 0) {
              cleanup();
              return;
            }
            tcpSocket.write(payload);
          }
        });

        // TCP → Browser: wrap raw bytes in WS binary frames
        tcpSocket.on('data', (chunk: Buffer) => {
          if (closed) return;
          socket.write(encodeWsFrame(chunk));
        });
      });

      tcpSocket.once('error', (err) => {
        console.error(`[proxy:tcptunnel] TCP error: ${err.message}`);
        cleanup();
      });
      tcpSocket.once('close', cleanup);
      socket.once('error', cleanup);
      socket.once('close', cleanup);
      return;
    }

    let sandboxId: string;
    let portNum: number;
    let proxyType = 'proxy';

    const subdomain = parseSubdomainProxy(req.headers.host);
    if (subdomain) {
      sandboxId = subdomain.sandboxId;
      portNum = subdomain.port;
    } else {
      const match = req.url?.match(PATH_PROXY_RE);
      if (!match) {
        dev && console.log(`[proxy:ws] no match, destroying socket. url=${req.url}`);
        socket.destroy();
        return;
      }
      proxyType = match[1];
      sandboxId = match[2];
      portNum = Number(match[3]);
      req.url = req.url!.replace(`/${proxyType}/${sandboxId}/${portNum}`, '') || '/';
    }

    dev &&
      console.log(
        `[proxy:ws] upgrade sandboxId=${sandboxId} port=${portNum} url=${req.url} hasCookie=${!!req.headers.cookie}`
      );

    try {
      const target = await authProxyTarget(req.headers, sandboxId, portNum);
      dev && console.log(`[proxy:ws] auth ok, forwarding to target=${target}`);
      // Rewrite Origin to match the target host so code-server's CSRF check passes.
      // changeOrigin:true only rewrites Host, not Origin.
      const targetUrl = new URL(target);
      const csTarget = deriveCsLoginTarget(target, req.url || '');
      await injectCodeServerAuth(req.headers, sandboxId, csTarget);
      req.headers['x-fastgpt-sandbox-id'] = sandboxId;
      proxy.ws(req, socket, head, {
        target,
        headers: { origin: `${targetUrl.protocol}//${targetUrl.host}` }
      });
    } catch (err: any) {
      const status = err.statusCode || 502;
      console.error(`[proxy:ws] auth failed status=${status} message=${err.message}`);
      socket.write(`HTTP/1.1 ${status} ${err.message || 'Proxy error'}\r\n\r\n`);
      socket.destroy();
    }
  });

  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port} [${dev ? 'dev' : 'production'}]`);
  });
}

// Authenticate a sandbox proxy request via the internal Next.js API route.
// This avoids importing @fastgpt/service (ESM-only deps) directly in server.ts.
async function authProxyTarget(
  reqHeaders: IncomingMessage['headers'],
  sandboxId: string,
  targetPort: number
): Promise<string> {
  dev &&
    console.log(
      `[proxy:auth] POST proxyAuth sandboxId=${sandboxId} port=${targetPort} hasCookie=${!!reqHeaders.cookie}`
    );
  const authResp = await fetch(`http://127.0.0.1:${port}/api/core/sandbox/proxyAuth`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(reqHeaders.cookie ? { cookie: reqHeaders.cookie as string } : {}),
      ...(reqHeaders.authorization ? { authorization: reqHeaders.authorization as string } : {})
    },
    body: JSON.stringify({ sandboxId, targetPort })
  });

  if (!authResp.ok) {
    // NextAPI always returns HTTP 500 for errors; read the real code from JSON body
    const body = await authResp.json().catch(() => ({ code: authResp.status }));
    const code = body?.code || authResp.status;
    const msg = body?.message || body?.error || 'Auth failed';
    console.error(
      `[proxy:auth] proxyAuth failed httpStatus=${authResp.status} code=${code} message=${msg}`
    );
    throw Object.assign(new Error(msg), { statusCode: code });
  }

  const { target } = await authResp.json();
  dev && console.log(`[proxy:auth] proxyAuth ok target=${target}`);
  return target as string;
}

// Build upstream request headers, dropping hop-by-hop headers
function buildProxyHeaders(headers: IncomingMessage['headers']): Record<string, string> {
  const hopByHop = new Set([
    'host',
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailers',
    'transfer-encoding',
    'upgrade'
  ]);
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (hopByHop.has(key.toLowerCase())) continue;
    if (value) result[key] = Array.isArray(value) ? value.join(', ') : value;
  }
  return result;
}

// RFC 6455 WebSocket frame decoder with buffer accumulation.
// Handles fragmented frames that arrive across multiple TCP chunks.
class WsFrameDecoder {
  private buf: Buffer = Buffer.alloc(0);

  // Push a new chunk; returns list of decoded payloads.
  // An empty Buffer in the list signals a close frame (opcode 0x8).
  push(chunk: Buffer): Buffer[] {
    this.buf = Buffer.concat([this.buf, chunk]);
    const payloads: Buffer[] = [];

    while (this.buf.length >= 2) {
      const b0 = this.buf[0];
      const b1 = this.buf[1];
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let payloadLen = b1 & 0x7f;
      let headerLen = 2;

      if (payloadLen === 126) {
        if (this.buf.length < 4) break;
        payloadLen = this.buf.readUInt16BE(2);
        headerLen = 4;
      } else if (payloadLen === 127) {
        if (this.buf.length < 10) break;
        // Only handle payloads up to 2^32; high 4 bytes are expected to be 0
        payloadLen = this.buf.readUInt32BE(6);
        headerLen = 10;
      }

      if (masked) headerLen += 4;
      const totalLen = headerLen + payloadLen;
      if (this.buf.length < totalLen) break;

      const payload = Buffer.allocUnsafe(payloadLen);
      if (masked) {
        const maskOffset = headerLen - 4;
        for (let i = 0; i < payloadLen; i++) {
          payload[i] = this.buf[headerLen + i] ^ this.buf[maskOffset + (i & 3)];
        }
      } else {
        this.buf.copy(payload, 0, headerLen, totalLen);
      }

      this.buf = this.buf.subarray(totalLen);

      if (opcode === 0x8) {
        // Close frame — signal EOF
        payloads.push(Buffer.alloc(0));
        break;
      }
      // data frame (text=0x1, binary=0x2, continuation=0x0) or ping(0x9)/pong(0xa) ignored
      if (opcode === 0x1 || opcode === 0x2 || opcode === 0x0) {
        payloads.push(payload);
      }
    }

    return payloads;
  }
}

// Encode raw bytes as a WebSocket binary frame (server→client, no masking).
function encodeWsFrame(data: Buffer): Buffer {
  const len = data.length;
  let header: Buffer;

  if (len <= 125) {
    header = Buffer.allocUnsafe(2);
    header[0] = 0x82; // FIN=1, opcode=0x2 (binary)
    header[1] = len;
  } else if (len <= 65535) {
    header = Buffer.allocUnsafe(4);
    header[0] = 0x82;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.allocUnsafe(10);
    header[0] = 0x82;
    header[1] = 127;
    header.writeUInt32BE(0, 2);
    header.writeUInt32BE(len, 6);
  }

  return Buffer.concat([header, data]);
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
