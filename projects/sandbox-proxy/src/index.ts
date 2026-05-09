import http, { type IncomingMessage, type ServerResponse } from 'http';
import httpProxy from 'http-proxy';
import { env } from './env';
import { configureLogger, getLogger, LogCategories } from './logger';
import { buildSetCookie } from './cookie';
import {
  deriveCsLoginTarget,
  ensureCsSession,
  evictCsSession,
  injectCsKey,
  isProxyMappedRequestUrl,
  rewriteProxyRequestUrl
} from './csSession';
import { authenticate, getSandboxId, type VerifiedProxyTokenPayload } from './auth';
import { startSandboxHeartbeat } from './heartbeat';
import { evictProxyTarget, resolveProxyTarget } from './proxyTarget';
import {
  SANDBOX_PROXY_AUTH_REFRESH_PATH,
  SANDBOX_PROXY_CODE_SERVER_PATH
} from '@fastgpt/global/core/ai/sandbox/proxyToken';

await configureLogger();

const logger = getLogger(LogCategories.MODULE.SANDBOX_PROXY.SERVER);

const proxy = httpProxy.createProxyServer({ xfwd: true, changeOrigin: true });

const getProxyOriginHeader = (target: string) => {
  const targetUrl = new URL(target);
  return `${targetUrl.protocol}//${targetUrl.host}`;
};

const prepareUpstreamRequest = async (
  req: IncomingMessage,
  token: VerifiedProxyTokenPayload
): Promise<string | null> => {
  const target = await resolveProxyTarget(token.sid, token.svc);
  if (!target) return null;

  const originalUrl = req.url || '/';
  const pathMapping = { publicPath: SANDBOX_PROXY_CODE_SERVER_PATH, basePath: target.basePath };
  const csTarget = deriveCsLoginTarget(target.origin, originalUrl, pathMapping);
  if (target.auth === 'code-server' && isProxyMappedRequestUrl(originalUrl, pathMapping)) {
    const session = await ensureCsSession(token.sid, csTarget, target.password);
    if (session) injectCsKey(req.headers as Record<string, unknown>, session);
  }

  req.url = rewriteProxyRequestUrl(originalUrl, pathMapping);
  req.headers['x-fastgpt-sandbox-id'] = token.sid;

  return target.origin;
};

const evictRequestCsSession = (req: IncomingMessage, reason: string, extra?: string) => {
  const sid = getSandboxId(req);
  if (!sid) return;
  evictCsSession(sid);
  logger.warning(
    `evict code-server session sandboxId=${sid} reason=${reason} path=${req.url || ''}${extra ? ` ${extra}` : ''}`
  );
};

proxy.on('error', (err, req, res) => {
  const sid = getSandboxId(req as IncomingMessage);
  if (sid) {
    evictCsSession(sid);
    evictProxyTarget(sid);
    logger.warning(
      `proxy error evicted code-server session sandboxId=${sid} path=${(req as IncomingMessage).url || ''}: ${err.message}`
    );
  }

  if (res instanceof http.ServerResponse) {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end(`Proxy error: ${err.message}`);
    }
  } else {
    try {
      (res as import('net').Socket).destroy();
    } catch {}
  }
});

proxy.on('proxyRes', (proxyRes, req) => {
  if (
    proxyRes.statusCode === 302 &&
    typeof proxyRes.headers.location === 'string' &&
    proxyRes.headers.location.includes('/login')
  ) {
    evictRequestCsSession(
      req as IncomingMessage,
      'http-redirect-login',
      `status=${proxyRes.statusCode}`
    );
  }
});

proxy.on('proxyReqWs', (proxyReq, req) => {
  proxyReq.on('upgrade', (_proxyRes, proxySocket) => {
    const sid = getSandboxId(req as IncomingMessage);
    if (!sid) return;

    const stopHeartbeat = startSandboxHeartbeat(sid);
    proxySocket.once('close', stopHeartbeat);
    proxySocket.once('end', stopHeartbeat);
    proxySocket.once('error', stopHeartbeat);
  });

  proxyReq.on('response', (proxyRes: IncomingMessage) => {
    const statusCode = proxyRes.statusCode ?? 0;
    const location = proxyRes.headers.location;
    const loginRedirect = typeof location === 'string' && location.includes('/login');

    if (statusCode === 401 || statusCode === 403 || statusCode === 302 || loginRedirect) {
      evictRequestCsSession(
        req as IncomingMessage,
        loginRedirect ? 'ws-redirect-login' : 'ws-upstream-rejected',
        `status=${statusCode}`
      );
    }
  });
});

async function handleHttp(req: IncomingMessage, res: ServerResponse) {
  const auth = authenticate(req);
  if ('error' in auth) {
    res.writeHead(auth.status, { 'Content-Type': 'text/plain' });
    res.end(auth.error);
    return;
  }

  const { token } = auth;

  // Bootstrap: set cookie on the first `_t` request and forward in the same response.
  if (auth.freshFromQuery) {
    res.setHeader('Set-Cookie', buildSetCookie(auth.jwt, auth.cookieMaxAgeSeconds));
  }

  req.url = auth.cleanedUrl;
  if (req.url === SANDBOX_PROXY_AUTH_REFRESH_PATH) {
    res.writeHead(204, {
      'Cache-Control': 'no-store',
      'Content-Length': '0'
    });
    res.end();
    return;
  }

  const target = await prepareUpstreamRequest(req, token);
  if (!target) {
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('Sandbox proxy target unavailable');
    return;
  }

  proxy.web(req, res, {
    target,
    headers: { origin: getProxyOriginHeader(target) }
  });
}

async function handleWsUpgrade(req: IncomingMessage, socket: import('net').Socket, head: Buffer) {
  const auth = authenticate(req);
  if ('error' in auth) {
    socket.write(`HTTP/1.1 ${auth.status} ${auth.error}\r\n\r\n`);
    socket.destroy();
    return;
  }
  const { token } = auth;
  req.url = auth.cleanedUrl;

  const target = await prepareUpstreamRequest(req, token);
  if (!target) {
    socket.write('HTTP/1.1 502 Sandbox proxy target unavailable\r\n\r\n');
    socket.destroy();
    return;
  }

  proxy.ws(req, socket, head, {
    target,
    headers: { origin: getProxyOriginHeader(target) }
  });
}

const server = http.createServer((req, res) => {
  handleHttp(req, res).catch((err) => {
    logger.error(`http unhandled: ${err?.message || err}`);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal proxy error');
    }
  });
});

server.on('upgrade', (req, socket, head) => {
  handleWsUpgrade(req, socket as import('net').Socket, head).catch((err) => {
    logger.error(`ws unhandled: ${err?.message || err}`);
    socket.destroy();
  });
});

server.listen(env.port, () => {
  logger.info(`listening on :${env.port}`);
});
