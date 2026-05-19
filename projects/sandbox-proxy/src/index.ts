import http, { type IncomingMessage, type ServerResponse } from 'http';
import httpProxy from 'http-proxy';
import type { Socket } from 'net';
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
import { sendSandboxProxyErrorPage } from './errorPage';
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

const formatSocketError = (err: NodeJS.ErrnoException) =>
  `${err.code ? `${err.code} ` : ''}${err.message}`;

const destroySocket = (socket?: Socket | null) => {
  if (!socket || socket.destroyed) return;

  try {
    socket.destroy();
  } catch {}
};

const writeSocketResponseAndDestroy = (socket: Socket, response: string) => {
  try {
    if (!socket.destroyed && socket.writable) {
      socket.write(response);
    }
  } catch {}

  destroySocket(socket);
};

const attachedErrorSockets = new WeakSet<Socket>();

const attachSocketErrorHandler = (
  req: IncomingMessage,
  socket: Socket,
  source: 'client' | 'proxy'
) => {
  if (attachedErrorSockets.has(socket)) return;

  attachedErrorSockets.add(socket);
  socket.on('error', (err: NodeJS.ErrnoException) => {
    logger.warning(
      `${source} socket error sandboxId=${getSandboxId(req) || 'unknown'} path=${req.url || ''}: ${formatSocketError(err)}`
    );
    destroySocket(socket);
  });
};

const prepareUpstreamRequest = async (
  req: IncomingMessage,
  token: VerifiedProxyTokenPayload
): Promise<string | null> => {
  const target = await resolveProxyTarget(token.sid, token.svc, token.rev);
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
      sendSandboxProxyErrorPage(res, {
        statusCode: 502,
        message: '页面连接中断，请刷新后重试。'
      });
    }
  } else {
    destroySocket(res as Socket);
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
    attachSocketErrorHandler(req as IncomingMessage, proxySocket as Socket, 'proxy');

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
    sendSandboxProxyErrorPage(res, {
      statusCode: auth.status,
      message: '当前访问已失效，请回到应用页面后重新打开。'
    });
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
    sendSandboxProxyErrorPage(res, {
      statusCode: 502,
      message: '页面服务暂时不可用，请稍后刷新重试。'
    });
    return;
  }

  proxy.web(req, res, {
    target,
    headers: { origin: getProxyOriginHeader(target) }
  });
}

async function handleWsUpgrade(req: IncomingMessage, socket: Socket, head: Buffer) {
  const auth = authenticate(req);
  if ('error' in auth) {
    writeSocketResponseAndDestroy(socket, `HTTP/1.1 ${auth.status} ${auth.error}\r\n\r\n`);
    return;
  }
  const { token } = auth;
  req.url = auth.cleanedUrl;

  const target = await prepareUpstreamRequest(req, token);
  if (!target) {
    writeSocketResponseAndDestroy(socket, 'HTTP/1.1 502 Sandbox proxy target unavailable\r\n\r\n');
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
      sendSandboxProxyErrorPage(res, {
        statusCode: 500,
        message: '页面加载失败，请刷新后重试。'
      });
    }
  });
});

server.on('upgrade', (req, socket, head) => {
  attachSocketErrorHandler(req, socket, 'client');

  handleWsUpgrade(req, socket, head).catch((err) => {
    logger.error(`ws unhandled: ${err?.message || err}`);
    destroySocket(socket);
  });
});

server.on('clientError', (err, socket) => {
  logger.warning(`client socket error before request is handled: ${formatSocketError(err)}`);
  destroySocket(socket);
});

server.listen(env.port, () => {
  logger.info(`listening on :${env.port}`);
});
