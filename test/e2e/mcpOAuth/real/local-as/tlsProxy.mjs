/**
 * E2E 专用 TLS 终结反代（`phase=cimd-success`）。
 *
 * FastGPT 的 CIMD client_id 由 `FE_DOMAIN` 派生，而 client-metadata 路由只允许
 * `Host === FE_DOMAIN` 的请求。本进程把
 *   https://<FORWARD_HOST>/*  ->  http://127.0.0.1:<TARGET_PORT>/*
 * 并把 Host/`x-forwarded-*` 固定为转发主机名，满足 Host 白名单。
 *
 * 日志只记录 method/path/status/host 与是否命中 CIMD 文档路径；
 * 不记录 header、query、body，因此不会写入 token/code/state。
 */
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';

const LISTEN_HOST = process.env.PROXY_LISTEN_HOST || '172.17.0.34';
const LISTEN_PORT = Number(process.env.PROXY_LISTEN_PORT || 18443);
const TARGET_HOST = process.env.PROXY_TARGET_HOST || '127.0.0.1';
const TARGET_PORT = Number(process.env.PROXY_TARGET_PORT || 13101);
const FORWARD_HOST = process.env.PROXY_FORWARD_HOST || `fastgpt-e2e.internal:${LISTEN_PORT}`;
const TLS_KEY = process.env.PROXY_TLS_KEY;
const TLS_CERT = process.env.PROXY_TLS_CERT;
const LOG_PATH = process.env.PROXY_LOG || '/tmp/mcp-oauth-e2e/tls-proxy.log';
const CIMD_PATH = '/api/core/app/mcpTools/oauth/client-metadata.json';

if (!TLS_KEY || !TLS_CERT) throw new Error('PROXY_TLS_KEY / PROXY_TLS_CERT are required');

fs.mkdirSync(LOG_PATH.replace(/\/[^/]+$/, ''), { recursive: true });
const writeLog = (entry) => {
  try {
    fs.appendFileSync(LOG_PATH, `${JSON.stringify(entry)}\n`);
  } catch {
    /* 日志失败不影响代理 */
  }
};

const server = https.createServer(
  { key: fs.readFileSync(TLS_KEY), cert: fs.readFileSync(TLS_CERT) },
  (req, res) => {
    const startedAt = Date.now();
    const pathname = (req.url || '/').split('?')[0];
    const headers = {
      ...req.headers,
      host: FORWARD_HOST,
      'x-forwarded-proto': 'https',
      'x-forwarded-host': FORWARD_HOST,
      'x-forwarded-for': req.socket.remoteAddress || ''
    };

    const upstream = http.request(
      { host: TARGET_HOST, port: TARGET_PORT, method: req.method, path: req.url, headers },
      (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
        upstreamRes.pipe(res);
        upstreamRes.on('end', () => {
          writeLog({
            ts: new Date().toISOString(),
            method: req.method,
            path: pathname,
            status: upstreamRes.statusCode,
            host: FORWARD_HOST,
            upstream: `${TARGET_HOST}:${TARGET_PORT}`,
            clientMetadata: pathname === CIMD_PATH,
            durationMs: Date.now() - startedAt
          });
        });
      }
    );

    upstream.on('error', (error) => {
      writeLog({
        ts: new Date().toISOString(),
        method: req.method,
        path: pathname,
        status: 502,
        host: FORWARD_HOST,
        clientMetadata: pathname === CIMD_PATH,
        durationMs: Date.now() - startedAt,
        error: String(error?.code ?? error)
      });
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'proxy_error' }));
    });

    req.pipe(upstream);
  }
);

server.listen(LISTEN_PORT, LISTEN_HOST, () => {
  console.log(
    `[tls-proxy] listening https://${LISTEN_HOST}:${LISTEN_PORT} (host ${FORWARD_HOST}) -> http://${TARGET_HOST}:${TARGET_PORT}, log=${LOG_PATH}`
  );
});

const shutdown = () => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
