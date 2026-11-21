/**
 * E2E 专用授权服务器启动器（`phase=cimd-success`）。
 *
 * 目的：在不修改 desktop 106 上游进程、也不修改 FastGPT 生产代码的前提下，
 * 用**同一份上游源码**（wille/mcp-oauth-server @ 8035903）跑出「CIMD 直接成功」链路。
 *
 * 与 106 那台的唯一差别是启动参数：
 *   - 监听在 109 自己的 0.0.0.0:<port>（https，自签证书）；
 *   - issuer/authorization/token/register/revoke 全部指向同一个 https BASE；
 *   - `clientIdMetadataDocuments.validateClientIdUrl` 白名单本套件的 FE_HOST；
 *   - 自定义 `fetch` 记录 AS 回源抓取 client-metadata 的结果（只记 status / client_name）。
 *
 * 上游 `ClientIdMetadataDocumentFetcher` 会先做「https + 有 path + 非 IP 字面量 /
 * 非 localhost」的语法校验，**之后**才调用 `validateClientIdUrl`。因此 client_id
 * 的主机名必须是域名（本套件用 /etc/hosts 把 `fastgpt-e2e.internal` 指向 109 自己），
 * 不能用 `172.17.0.34` 这个 IP 字面量。
 *
 * 安全：日志只记录 method/path/status/grant_type 这类非敏感枚举；
 * query、header、body 一律不落盘，且不打印 token/code/state/client_secret。
 *
 * 运行方式（由 run.sh 负责）：
 *   MCP_OAUTH_UPSTREAM_DIR=/tmp/... npx tsx launcher.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { pathToFileURL } from 'node:url';

const UPSTREAM = process.env.MCP_OAUTH_UPSTREAM_DIR;
if (!UPSTREAM) throw new Error('MCP_OAUTH_UPSTREAM_DIR is required');

const AS_HOST = process.env.AS_LISTEN_HOST || '0.0.0.0';
const AS_PORT = Number(process.env.AS_LISTEN_PORT || 18300);
const AS_BASE = (process.env.AS_BASE || `https://172.17.0.34:${AS_PORT}`).replace(/\/+$/, '');
const FE_HOST = process.env.E2E_FE_HOST || 'fastgpt-e2e.internal';
const TLS_KEY = process.env.AS_TLS_KEY;
const TLS_CERT = process.env.AS_TLS_CERT;
const LOG_PATH = process.env.AS_LOG || '/tmp/mcp-oauth-e2e/as-local.log';

if (!TLS_KEY || !TLS_CERT) throw new Error('AS_TLS_KEY / AS_TLS_CERT are required');

const up = (relative) => pathToFileURL(path.join(UPSTREAM, relative)).href;
const [
  { mcpAuthRouter, getOAuthProtectedResourceMetadataUrl },
  { OAuthServer },
  { MemoryOAuthServerModel },
  { requireBearerAuth },
  { authenticateHandler },
  { McpServer },
  { StreamableHTTPServerTransport },
  { default: express },
  z
] = await Promise.all([
  import(up('src/router.ts')),
  import(up('src/OAuthServer.ts')),
  import(up('src/MemoryOAuthServerModel.ts')),
  import(up('src/middleware/bearerAuth.ts')),
  import(up('src/handlers/authenticate.ts')),
  import(up('node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.js')),
  import(up('node_modules/@modelcontextprotocol/sdk/dist/esm/server/streamableHttp.js')),
  import(up('node_modules/express/index.js')),
  import(up('node_modules/zod/index.js'))
]);

/* ------------------------------ 日志（非敏感） ------------------------------ */

fs.mkdirSync(LOG_PATH.replace(/\/[^/]+$/, ''), { recursive: true });
const entries = [];
const writeLog = (entry) => {
  entries.push(entry);
  try {
    fs.appendFileSync(LOG_PATH, `${JSON.stringify(entry)}\n`);
  } catch {
    /* 日志失败不影响 AS */
  }
};

const issuerUrl = new URL(`${AS_BASE}/`);
const resourceUrl = new URL(`${AS_BASE}/mcp`);
const nonSecretFormField = (pathname, body, key) => {
  if (!body || (pathname !== '/token' && pathname !== '/revoke')) return {};
  try {
    const value = body.get(key);
    return value ? { [key === 'grant_type' ? 'grantType' : 'tokenTypeHint']: value } : {};
  } catch {
    return {};
  }
};

/* --------------------------- 自定义 CIMD 回源 fetch --------------------------- */
/**
 * 上游会用这个 fetch 去抓 client_id 指向的元数据文档。这里只做两件事：
 *   1. 透传给 Node 全局 fetch（信任 CA 已由进程级 NODE_EXTRA_CA_CERTS 注入）；
 *   2. 记录 URL(host+path)、HTTP status 和解析出的 client_name（都是公开信息）。
 */
const cimdFetch = async (url, init) => {
  const parsed = new URL(url.toString());
  const startedAt = Date.now();
  let status = 0;
  let clientName;
  try {
    const response = await fetch(url, init);
    status = response.status;
    if (response.ok) {
      try {
        const body = await response.clone().json();
        if (body && typeof body.client_name === 'string') clientName = body.client_name;
      } catch {
        /* 解析失败由上游按 invalid_client 处理，这里只记录 */
      }
    }
    return response;
  } catch (error) {
    status = -1;
    writeLog({
      ts: new Date().toISOString(),
      kind: 'cimd-fetch',
      method: 'GET',
      path: parsed.pathname,
      host: parsed.host,
      status,
      error: String(error?.code ?? error?.name ?? 'fetch_failed'),
      durationMs: Date.now() - startedAt
    });
    throw error;
  } finally {
    if (status !== -1) {
      writeLog({
        ts: new Date().toISOString(),
        kind: 'cimd-fetch',
        method: 'GET',
        path: parsed.pathname,
        host: parsed.host,
        status,
        ...(clientName ? { clientName } : {}),
        durationMs: Date.now() - startedAt
      });
    }
  }
};

/* ------------------------------ OAuth provider ------------------------------ */

const provider = new OAuthServer({
  model: new MemoryOAuthServerModel(),
  issuerUrl,
  authorizationUrl: new URL(`${AS_BASE}/consent`),
  scopesSupported: ['mcp:tools'],
  // 白名单：只信任本套件 FE_DOMAIN 的主机名（上游在调用本钩子前已拒绝 IP 字面量）。
  clientIdMetadataDocuments: {
    validateClientIdUrl: (url) => url.hostname === FE_HOST,
    fetch: cimdFetch
  },
  modifyAuthorizationRedirectUrl: (url, client) => {
    if (client.client_name) url.searchParams.set('client_name', client.client_name);
    if (client.client_uri) url.searchParams.set('client_uri', client.client_uri);
    if (client.logo_uri) url.searchParams.set('logo_uri', client.logo_uri);
  }
});

const mcpAuthMiddleware = mcpAuthRouter({
  provider,
  resourceServerUrl: resourceUrl,
  scopesSupported: ['mcp:tools']
});

/* ------------------------------ Express 应用 ------------------------------ */

const app = express();
app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: true, limit: '256kb' }));

// 请求边界日志：只记录 method/path/status 与 token/revoke 的非敏感枚举。
app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on('finish', () => {
    const pathname = (req.originalUrl || '/').split('?')[0];
    let form;
    try {
      if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
        form = new Map(Object.entries(req.body).map(([key, value]) => [key, String(value)]));
      }
    } catch {
      form = undefined;
    }
    writeLog({
      ts: new Date().toISOString(),
      kind: 'request',
      method: req.method,
      path: pathname,
      status: res.statusCode,
      durationMs: Date.now() - startedAt,
      ...nonSecretFormField(pathname, form, 'grant_type'),
      ...nonSecretFormField(pathname, form, 'token_type_hint')
    });
  });
  next();
});

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    issuer: issuerUrl.href,
    resource: resourceUrl.href,
    cimd: true,
    feHost: FE_HOST
  });
});

// 只暴露计数与非敏感元数据，不暴露 token/code/state。
app.get('/debug/stats', (_req, res) => {
  const requests = entries.filter((entry) => entry.kind === 'request');
  const cimdFetches = entries.filter((entry) => entry.kind === 'cimd-fetch');
  const count = (predicate) => requests.filter(predicate).length;
  res.json({
    ok: true,
    issuer: issuerUrl.href,
    resource: resourceUrl.href,
    requests: {
      total: requests.length,
      authorize: count((entry) => entry.method === 'GET' && entry.path === '/authorize'),
      consent: count((entry) => entry.method === 'GET' && entry.path === '/consent'),
      confirm: count((entry) => entry.method === 'POST' && entry.path === '/confirm'),
      register: count((entry) => entry.method === 'POST' && entry.path === '/register'),
      tokenAuthorizationCode: count(
        (entry) => entry.path === '/token' && entry.grantType === 'authorization_code'
      ),
      tokenRefresh: count((entry) => entry.path === '/token' && entry.grantType === 'refresh_token'),
      revoke: count((entry) => entry.method === 'POST' && entry.path === '/revoke'),
      mcp: count((entry) => entry.path === '/mcp')
    },
    cimdFetches: cimdFetches.map((entry) => ({
      host: entry.host,
      path: entry.path,
      status: entry.status,
      ...(entry.clientName ? { clientName: entry.clientName } : {}),
      ...(entry.error ? { error: entry.error } : {})
    }))
  });
});

app.use(mcpAuthMiddleware);

app.get('/consent', (req, res) => {
  const qs = new URLSearchParams(req.query);
  const clientName = qs.get('client_name');
  const resource = qs.get('resource');
  const formFields = {};
  qs.forEach((value, key) => {
    formFields[key] = value;
  });
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<html><body>
    <h1>Login to ${clientName || resource || 'MCP server'}</h1>
    <form action="/confirm" method="POST">
      <input type="text" name="user_id" placeholder="User ID to authenticate as" required>
      <input type="submit" value="Give consent">
      ${Object.entries(formFields)
        .map(([key, value]) => `<input type="hidden" name="${key}" value="${value}">`)
        .join('')}
    </form>
  </body></html>`);
});

app.use(
  '/confirm',
  authenticateHandler({
    provider,
    getUser: async (req) => req.body.user_id
  })
);

app.post(
  '/mcp',
  requireBearerAuth({
    verifier: provider,
    requiredScopes: ['mcp:tools'],
    resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(resourceUrl),
    resource: resourceUrl
  })
);

const createMcpServer = (userId) => {
  const mcpServer = new McpServer({ name: 'cimd-e2e-server', version: '1.0.0' });
  mcpServer.registerTool(
    'whoami',
    { title: 'Who Am I Tool', description: 'Returns the current user id' },
    () => ({
      content: [{ type: 'text', text: String(userId) }],
      structuredContent: { result: String(userId) }
    })
  );
  mcpServer.registerTool(
    'echo',
    {
      title: 'Echo Tool',
      description: 'Echoes the provided text',
      inputSchema: { text: z.string().describe('Text to echo') }
    },
    ({ text }) => ({
      content: [{ type: 'text', text }],
      structuredContent: { result: text }
    })
  );
  return mcpServer;
};

app.post('/mcp', async (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  });
  res.on('close', () => transport.close());
  const mcpServer = createMcpServer(req.auth?.token);
  await mcpServer.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

const server = https.createServer(
  { key: fs.readFileSync(TLS_KEY), cert: fs.readFileSync(TLS_CERT) },
  app
);

server.listen(AS_PORT, AS_HOST, () => {
  console.log(
    `[local-as] listening https://${AS_HOST}:${AS_PORT} issuer=${issuerUrl.href} feHost=${FE_HOST} log=${LOG_PATH}`
  );
});

const shutdown = () => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
