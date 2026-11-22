/**
 * 真实授权服务器的边界日志代理（仅 E2E 使用）。
 *
 * 目的：`host.docker.internal` 在测试拓扑里必须解析到本机，才能让 FastGPT 的
 * issuer/resource 精确比较保持不变；同时把「谁来访问 AS、访问了什么」记录在
 * 109 侧可读的位置。代理只属于测试夹具，不改变 AS 的行为。
 *
 * 日志只记录 method + path + status + 耗时；`/token`、`/revoke` 额外记录
 * grant_type / token_type_hint 这类非敏感枚举。query、header、body 一律不落盘，
 * 因此不会写入 code/state/token/client_secret。
 */
import http from 'node:http';
import fs from 'node:fs';

const LISTEN_HOST = process.env.AS_PROXY_HOST || '172.17.0.34';
const LISTEN_PORT = Number(process.env.AS_PROXY_PORT || 18200);
const UPSTREAM_HOST = process.env.AS_UPSTREAM_HOST || '172.17.0.22';
const UPSTREAM_PORT = Number(process.env.AS_UPSTREAM_PORT || 18200);
const LOG_PATH = process.env.AS_PROXY_LOG || '/tmp/mcp-oauth-e2e/as-proxy.log';

fs.mkdirSync(LOG_PATH.replace(/\/[^/]+$/, ''), { recursive: true });

const writeLog = (entry) => {
  try {
    fs.appendFileSync(LOG_PATH, `${JSON.stringify(entry)}\n`);
  } catch {
    /* 日志失败不影响代理 */
  }
};

/** 只从 token/revoke 的表单里取枚举字段，绝不读取 token 本身。 */
const extractNonSecretFormFields = (pathname, body) => {
  if (pathname !== '/token' && pathname !== '/revoke') return {};
  try {
    const form = new URLSearchParams(body.toString('utf8'));
    return {
      ...(form.get('grant_type') ? { grantType: form.get('grant_type') } : {}),
      ...(form.get('token_type_hint') ? { tokenTypeHint: form.get('token_type_hint') } : {})
    };
  } catch {
    return {};
  }
};

const server = http.createServer((req, res) => {
  const startedAt = Date.now();
  const pathname = (req.url || '/').split('?')[0];

  const chunks = [];
  let totalBytes = 0;
  req.on('data', (chunk) => {
    totalBytes += chunk.length;
    // 表单体很小；超过 64KB 不再缓存，避免无界内存。
    if (totalBytes <= 64 * 1024) chunks.push(chunk);
  });

  req.on('end', () => {
    const body = Buffer.concat(chunks);
    const upstream = http.request(
      {
        host: UPSTREAM_HOST,
        port: UPSTREAM_PORT,
        method: req.method,
        path: req.url,
        headers: req.headers
      },
      (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
        upstreamRes.pipe(res);
        upstreamRes.on('end', () => {
          writeLog({
            ts: new Date().toISOString(),
            method: req.method,
            path: pathname,
            status: upstreamRes.statusCode,
            durationMs: Date.now() - startedAt,
            ...extractNonSecretFormFields(pathname, body)
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
        durationMs: Date.now() - startedAt,
        error: String(error?.code ?? error)
      });
      if (!res.headersSent) {
        res.writeHead(502, { 'content-type': 'application/json' });
      }
      res.end(JSON.stringify({ error: 'proxy_error' }));
    });

    upstream.end(body);
  });
});

server.listen(LISTEN_PORT, LISTEN_HOST, () => {
  console.log(
    `[as-proxy] listening ${LISTEN_HOST}:${LISTEN_PORT} -> ${UPSTREAM_HOST}:${UPSTREAM_PORT}, log=${LOG_PATH}`
  );
});

const shutdown = () => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
