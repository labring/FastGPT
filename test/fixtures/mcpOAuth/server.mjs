/**
 * FastGPT MCP OAuth v2.4 — 可编程授权服务器 + Streamable HTTP MCP Server fixture。
 *
 * 只用于测试（`test/fixtures/mcpOAuth/`），不进入生产路径。零第三方依赖：
 * 仅使用 Node 22 内置 `node:http` / `node:crypto` / 全局 `fetch`。
 *
 * 提供：
 *  - RFC 9728 PRM（path-aware + root，另可按 `prmSource` 只走 401 header）
 *  - RFC 8414 AS metadata（issuer 与端点同源）
 *  - RFC 7591 DCR / RFC 7592 注销
 *  - 授权码 + PKCE S256、refresh token rotation、RFC 7009 revoke
 *  - CIMD：把 URL 形式的 client_id 回源抓取并校验 FastGPT 的 client-metadata 文档
 *  - `/mcp`：要求 Bearer + scope，记录 Authorization 指纹与请求头
 *  - `/debug/bearer-fingerprints`、`/debug/stats`、`/debug/events`、`/debug/inject`
 *
 * 所有 token / client_secret / code 只存在于进程内存；调试端点只输出 SHA-256 指纹。
 *
 * 启动：
 *   node test/fixtures/mcpOAuth/server.mjs
 *
 * 环境变量（全部可选）：
 *   MCP_FIXTURE_HOST                 默认 127.0.0.1
 *   MCP_FIXTURE_PORT                 默认 18110
 *   MCP_FIXTURE_BASE_URL             默认 http://<host>:<port>（issuer 与 resource 前缀）
 *   MCP_FIXTURE_MODE                 cimd | dcr | manual | all（默认 all）
 *   MCP_FIXTURE_TTL                  访问令牌秒数（默认 3600）
 *   MCP_FIXTURE_SCOPE                必须携带的 scope（默认 mcp:tools）
 *   MCP_FIXTURE_MANUAL_CLIENT_ID     默认 manual-client
 *   MCP_FIXTURE_MANUAL_CLIENT_SECRET 设置后 manual client 使用 client_secret_basic/post
 *   MCP_FIXTURE_ROTATE               1 轮换 refresh token（默认 1）
 *   MCP_FIXTURE_CIMD_INSECURE_TLS    1 允许回源抓取自签名 HTTPS（仅测试）
 *   MCP_FIXTURE_FAILURES             逗号分隔的失败注入（见 FAILURES）
 *   MCP_FIXTURE_CONSENT              auto | always（默认 auto；always 时 /authorize 渲染真实同意页）
 *   MCP_FIXTURE_PRM_MODE             present | missing（默认 present；missing 时 PRM 一律 404，
 *                                    用于验证 MCP 2025-03-26「PRM 404 → MCP origin 根 AS metadata」回退）
 *
 * 失败注入（也可运行时 POST /debug/inject 修改）：
 *   authorize_denied        授权端点直接返回 error=access_denied
 *   authorize_iss_mismatch  授权回调附带错误的 iss
 *   token_500               token 端点返回 500
 *   token_302               token 端点 302（验证禁止重定向）
 *   token_timeout            token 端点挂起 30s
 *   prm_resource_mismatch   PRM 返回与 MCP URL 不一致的 resource
 *   discovery_302           well-known 302 到私网地址
 *   mcp_insufficient_scope  /mcp 始终返回 401 insufficient_scope
 *   dcr_disabled            屏蔽 /register（AS metadata 也不再声明）
 *   rotate_off              关闭 refresh token rotation
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';

// ---------------------------------------------------------------------------
// 配置
// ---------------------------------------------------------------------------

const HOST = process.env.MCP_FIXTURE_HOST ?? '127.0.0.1';
const PORT = Number(process.env.MCP_FIXTURE_PORT ?? 18110);
const BASE = (process.env.MCP_FIXTURE_BASE_URL ?? `http://${HOST}:${PORT}`).replace(/\/+$/, '');
const MODE = (process.env.MCP_FIXTURE_MODE ?? 'all').toLowerCase();
const ACCESS_TTL_SECONDS = Number(process.env.MCP_FIXTURE_TTL ?? 3600);
const SCOPE = process.env.MCP_FIXTURE_SCOPE ?? 'mcp:tools';
const MANUAL_CLIENT_ID = process.env.MCP_FIXTURE_MANUAL_CLIENT_ID ?? 'manual-client';
const MANUAL_CLIENT_SECRET = process.env.MCP_FIXTURE_MANUAL_CLIENT_SECRET ?? '';
const CIMD_INSECURE_TLS = process.env.MCP_FIXTURE_CIMD_INSECURE_TLS === '1';
/**
 * 授权端点是否渲染真实同意页：
 *   auto   （默认）GET /authorize 直接 302 回调，保持 F1 HTTP 级 E2E 行为不变
 *   always        每次授权都渲染 HTML 同意页，等待用户点击「授权 / 拒绝」
 * 另外，authorization URL 显式携带 `prompt=consent` 时也会渲染同意页（与 auto 并存）。
 */
const CONSENT_DEFAULT = (process.env.MCP_FIXTURE_CONSENT ?? 'auto').toLowerCase();
if (!['auto', 'always'].includes(CONSENT_DEFAULT)) {
  throw new Error(`MCP_FIXTURE_CONSENT must be auto|always, got ${CONSENT_DEFAULT}`);
}

if (!['present', 'missing'].includes((process.env.MCP_FIXTURE_PRM_MODE ?? 'present').toLowerCase())) {
  throw new Error('MCP_FIXTURE_PRM_MODE must be present|missing');
}

if (CIMD_INSECURE_TLS) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

const RESOURCE = `${BASE}/mcp`;
const PRM_PATH = '/.well-known/oauth-protected-resource/mcp';
const PRM_PATH_AWARE = '/.well-known/oauth-protected-resource/mcp';

const MODES = new Set(['cimd', 'dcr', 'manual', 'all']);
if (!MODES.has(MODE)) {
  throw new Error(`MCP_FIXTURE_MODE must be one of cimd|dcr|manual|all, got ${MODE}`);
}

const config = {
  /** authorize / token 行为注入，可运行时修改。 */
  failures: new Set(
    (process.env.MCP_FIXTURE_FAILURES ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  ),
  rotate: (process.env.MCP_FIXTURE_ROTATE ?? '1') !== '0',
  /** auto | always：是否要求用户在真实同意页确认（见 CONSENT_DEFAULT）。 */
  consent: CONSENT_DEFAULT,
  /** prmSource: header | well-known（header 模式只依赖 401 challenge） */
  prmSource: process.env.MCP_FIXTURE_PRM_SOURCE ?? 'header',
  /** prmMode: present | missing（missing 时 PRM 端点 404，触发根 AS metadata 回退） */
  prmMode: (process.env.MCP_FIXTURE_PRM_MODE ?? 'present').toLowerCase(),
  /** 覆盖 AS metadata 中声明的能力，用于失败路径。 */
  advertise: {
    cimd: MODE === 'cimd' || MODE === 'all',
    dcr: MODE === 'dcr' || MODE === 'all'
  }
};

const hasFailure = (name) => config.failures.has(name);

// ---------------------------------------------------------------------------
// 内存状态
// ---------------------------------------------------------------------------

const clients = new Map(); // client_id -> { redirect_uris, client_name, source, authMethod, client_secret?, registration_access_token? }
const codes = new Map(); // code -> { clientId, redirectUri, challenge, scope, resource, expiresAt, used }
const accessTokens = new Map(); // token -> { clientId, scopes, resource, expiresAt, issuedAt, fingerprint }
const refreshTokens = new Map(); // token -> { clientId, scopes, resource, expiresAt, fingerprint, rotatedFrom? }
const fingerprints = []; // 按到达顺序记录通过 MCP 校验的 bearer 指纹（可重复）
const expiredFingerprints = new Set(); // 被 /debug/expire-tokens 或 revoke 失效的指纹
const events = [];
/** 同意页事务：transaction_id -> 一次性的授权请求上下文（只存内存、过期即弃）。 */
const consentRequests = new Map();

const stats = {
  authorizations: 0,
  authorizationsDenied: 0,
  consentsShown: 0,
  consentsApproved: 0,
  consentsDenied: 0,
  tokenRequests: 0,
  tokenRequestsByGrant: { authorization_code: 0, refresh_token: 0 },
  tokenErrors: 0,
  refreshes: 0,
  refreshTokensRotated: 0,
  revocations: 0,
  registrations: 0,
  deregistrations: 0,
  cimdFetches: 0,
  cimdValidations: 0,
  cimdValidationFailures: 0,
  mcpRequests: 0,
  mcpUnauthorized: 0,
  mcpInsufficientScope: 0,
  issuedAccessTokens: 0,
  issuedRefreshTokens: 0
};

const now = () => Date.now();
const randomToken = () => randomBytes(32).toString('base64url');
const randomId = () => randomBytes(16).toString('hex');
const fingerprint = (value) => createHash('sha256').update(String(value)).digest('hex').slice(0, 16);

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

const json = (res, status, value) => {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store'
  });
  res.end(body);
};

const redirect = (res, location) => {
  res.writeHead(302, { location, 'cache-control': 'no-store' });
  res.end();
};

const html = (res, status, body) => {
  res.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer'
  });
  res.end(body);
};

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * 真实同意页：展示 client / redirect_uri / scope / resource，用户必须显式点击
 * 「授权」或「拒绝」；提交到 /authorize/decision 后继续原 302 回调流程。
 * 只使用内联样式，不加载任何外部资源。
 */
const renderConsentPage = ({ transactionId, clientName, clientId, redirectUri, scope, resource }) => `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>授权确认 · MCP OAuth Fixture</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center;
    background: #f4f6fb; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
    "Helvetica Neue", Arial, "PingFang SC", "Microsoft YaHei", sans-serif; color: #1f2937; }
  main { width: min(560px, calc(100vw - 32px)); background: #fff; border-radius: 14px;
    box-shadow: 0 10px 40px rgba(15, 23, 42, 0.12); padding: 28px 30px 24px; }
  h1 { font-size: 20px; margin: 0 0 6px; }
  p.lead { margin: 0 0 20px; color: #6b7280; font-size: 14px; line-height: 1.6; }
  dl { margin: 0 0 20px; display: grid; grid-template-columns: 108px 1fr; gap: 10px 14px; font-size: 13px; }
  dt { color: #6b7280; }
  dd { margin: 0; word-break: break-all; color: #111827; }
  .scopes { display: flex; flex-wrap: wrap; gap: 6px; }
  .scope { padding: 2px 8px; border-radius: 999px; background: #eef2ff; color: #3730a3; font-size: 12px; }
  .actions { display: flex; gap: 12px; justify-content: flex-end; margin-top: 24px; }
  button { font: inherit; border-radius: 8px; padding: 9px 20px; cursor: pointer; border: 1px solid transparent; }
  button.approve { background: #2563eb; color: #fff; }
  button.approve:hover { background: #1d4ed8; }
  button.deny { background: #fff; color: #374151; border-color: #d1d5db; }
  button.deny:hover { background: #f9fafb; }
  .warn { margin: 18px 0 0; font-size: 12px; color: #92400e; background: #fffbeb;
    border: 1px solid #fde68a; border-radius: 8px; padding: 10px 12px; line-height: 1.6; }
</style>
</head>
<body>
<main>
  <h1>授权请求</h1>
  <p class="lead">应用 <strong>${escapeHtml(clientName)}</strong> 请求访问 MCP 资源，请确认以下信息后选择授权或拒绝。</p>
  <dl>
    <dt>客户端</dt><dd>${escapeHtml(clientName)}</dd>
    <dt>client_id</dt><dd>${escapeHtml(clientId)}</dd>
    <dt>回调地址</dt><dd>${escapeHtml(redirectUri)}</dd>
    <dt>资源</dt><dd>${escapeHtml(resource)}</dd>
    <dt>权限范围</dt><dd><span class="scopes">${
      (scope || '')
        .split(' ')
        .filter(Boolean)
        .map((item) => `<span class="scope">${escapeHtml(item)}</span>`)
        .join('') || '<span class="scope">（无）</span>'
    }</span></dd>
  </dl>
  <p class="warn">授权后，该客户端将获得上述资源与权限范围；本页面仅用于本地 E2E 测试。</p>
  <form method="post" action="/authorize/decision">
    <input type="hidden" name="transaction_id" value="${escapeHtml(transactionId)}" />
    <div class="actions">
      <button class="deny" type="submit" name="decision" value="deny">拒绝</button>
      <button class="approve" type="submit" name="decision" value="approve">授权</button>
    </div>
  </form>
</main>
</body>
</html>`;

/** 授权通过后统一签发 code 并 302 回调；自动同意与同意页共用同一逻辑。 */
const issueAuthorizationCode = ({ res, clientId, redirectUri, challenge, scope, resource, state }) => {
  stats.authorizations += 1;
  const code = randomToken();
  codes.set(code, {
    clientId,
    redirectUri,
    challenge,
    scope,
    resource,
    expiresAt: now() + 5 * 60 * 1000
  });
  const location = new URL(redirectUri);
  location.searchParams.set('code', code);
  if (state) location.searchParams.set('state', state);
  location.searchParams.set('iss', hasFailure('authorize_iss_mismatch') ? 'https://evil.example' : BASE);
  return redirect(res, location.toString());
};

const readBodyLimited = (req, limit = 256 * 1024) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > limit) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });

const parseForm = (text) => {
  const params = new URLSearchParams(text);
  const record = {};
  for (const [key, value] of params) record[key] = value;
  return record;
};

const parseJson = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

const recordEvent = (req, status, extra = {}) => {
  const authorization = req.headers.authorization;
  // 与 /debug/bearer-fingerprints 口径一致：对 Bearer token 本体取指纹（不含 "Bearer " 前缀），
  // 否则同一 token 在两个调试端点会得到不同哈希，取证时无法交叉比对。
  const bearerToken =
    typeof authorization === 'string' ? /^Bearer\s+(.+)$/i.exec(authorization)?.[1] : undefined;
  events.push({
    at: new Date().toISOString(),
    method: req.method,
    path: (req.url ?? '/').split('?')[0],
    status,
    authorization:
      typeof authorization === 'string' ? `fingerprint:${fingerprint(bearerToken ?? authorization)}` : null,
    host: req.headers.host ?? null,
    contentType: req.headers['content-type'] ?? null,
    accept: req.headers.accept ?? null,
    userAgent: req.headers['user-agent'] ?? null,
    ...extra
  });
  if (events.length > 500) events.splice(0, events.length - 500);
};

const clientAuthFromRequest = (req, form) => {
  const header = req.headers.authorization ?? '';
  if (header.toLowerCase().startsWith('basic ')) {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const index = decoded.indexOf(':');
    return {
      clientId: index >= 0 ? decodeURIComponent(decoded.slice(0, index)) : decoded,
      clientSecret: index >= 0 ? decodeURIComponent(decoded.slice(index + 1)) : '',
      method: 'client_secret_basic'
    };
  }
  if (form?.client_secret !== undefined) {
    return {
      clientId: form.client_id ?? '',
      clientSecret: form.client_secret,
      method: 'client_secret_post'
    };
  }
  return { clientId: form?.client_id ?? '', clientSecret: '', method: 'none' };
};

const verifyClientSecret = (client, secret) => {
  if (!client?.client_secret) return true;
  const expected = Buffer.from(String(client.client_secret));
  const actual = Buffer.from(String(secret ?? ''));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
};

const pkceMatches = (verifier, challenge) => {
  if (!verifier || !challenge) return false;
  const digest = createHash('sha256').update(String(verifier)).digest('base64url');
  const left = Buffer.from(digest);
  const right = Buffer.from(String(challenge));
  return left.length === right.length && timingSafeEqual(left, right);
};

const isAbsoluteHttpUrl = (value) => {
  try {
    const url = new URL(String(value));
    return (url.protocol === 'http:' || url.protocol === 'https:') && !url.hash;
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------------------
// 客户端注册：CIMD / DCR / manual
// ---------------------------------------------------------------------------

const cimdCache = new Map(); // url -> { document, fetchedAt }

const fetchCimdDocument = async (clientIdUrl) => {
  const cached = cimdCache.get(clientIdUrl);
  if (cached && now() - cached.fetchedAt < 30_000) return cached.document;
  stats.cimdFetches += 1;
  const response = await fetch(clientIdUrl, {
    method: 'GET',
    redirect: 'manual',
    headers: { accept: 'application/json' }
  });
  if (response.status !== 200) {
    throw new Error(`cimd_fetch_status_${response.status}`);
  }
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new Error('cimd_bad_content_type');
  }
  const document = await response.json();
  cimdCache.set(clientIdUrl, { document, fetchedAt: now() });
  return document;
};

/**
 * CIMD 回源校验：客户端元数据文档必须可访问，且与本次授权请求一致。
 * 返回规范化 client 记录；任何不一致都抛错（授权端点返回 invalid_client）。
 */
const resolveCimdClient = async ({ clientIdUrl, redirectUri }) => {
  stats.cimdValidations += 1;
  try {
    if (!isAbsoluteHttpUrl(clientIdUrl)) throw new Error('cimd_client_id_not_url');
    const document = await fetchCimdDocument(clientIdUrl);
    if (!document || typeof document !== 'object') throw new Error('cimd_not_object');
    if (document.client_id !== clientIdUrl) throw new Error('cimd_client_id_mismatch');
    if ('client_secret' in document) throw new Error('cimd_has_secret');
    if (document.token_endpoint_auth_method !== 'none') {
      throw new Error('cimd_auth_method_not_none');
    }
    if (typeof document.client_name !== 'string' || !document.client_name) {
      throw new Error('cimd_client_name_missing');
    }
    if (!Array.isArray(document.redirect_uris) || document.redirect_uris.length === 0) {
      throw new Error('cimd_redirect_uris_missing');
    }
    if (!document.redirect_uris.includes(redirectUri)) {
      throw new Error('cimd_redirect_uri_mismatch');
    }
    if (
      !Array.isArray(document.grant_types) ||
      !document.grant_types.includes('authorization_code') ||
      !document.grant_types.includes('refresh_token')
    ) {
      throw new Error('cimd_grant_types_missing');
    }
    if (!Array.isArray(document.response_types) || !document.response_types.includes('code')) {
      throw new Error('cimd_response_types_missing');
    }
    if (
      document.code_challenge_method !== undefined &&
      document.code_challenge_method !== 'S256'
    ) {
      throw new Error('cimd_code_challenge_method_not_s256');
    }
    const client = {
      client_id: clientIdUrl,
      redirect_uris: document.redirect_uris.map(String),
      client_name: document.client_name,
      source: 'cimd',
      authMethod: 'none'
    };
    clients.set(clientIdUrl, client);
    return client;
  } catch (error) {
    stats.cimdValidationFailures += 1;
    throw error;
  }
};

const resolveRegisteredClient = async ({ clientId, redirectUri, request }) => {
  if (!clientId) throw new Error('missing_client_id');

  // 1) manual：预配置 client，可选 secret。
  if (clientId === MANUAL_CLIENT_ID) {
    const client = clients.get(MANUAL_CLIENT_ID) ?? {
      client_id: MANUAL_CLIENT_ID,
      redirect_uris: [],
      client_name: 'Manual fixture client',
      source: 'manual',
      authMethod: MANUAL_CLIENT_SECRET ? 'client_secret_basic' : 'none',
      client_secret: MANUAL_CLIENT_SECRET || undefined
    };
    clients.set(MANUAL_CLIENT_ID, client);
    if (client.redirect_uris.length > 0 && redirectUri && !client.redirect_uris.includes(redirectUri)) {
      throw new Error('redirect_uri_mismatch');
    }
    if (redirectUri && client.redirect_uris.length === 0) client.redirect_uris.push(redirectUri);
    return client;
  }

  // 2) DCR：必须已注册。
  const registered = clients.get(clientId);
  if (registered) {
    if (redirectUri && !registered.redirect_uris.includes(redirectUri)) {
      throw new Error('redirect_uri_mismatch');
    }
    return registered;
  }

  // 3) CIMD：URL 形式 client_id，回源校验。
  if (config.advertise.cimd && isAbsoluteHttpUrl(clientId)) {
    return resolveCimdClient({ clientIdUrl: clientId, redirectUri });
  }

  void request;
  throw new Error('invalid_client');
};

// ---------------------------------------------------------------------------
// Token 签发
// ---------------------------------------------------------------------------

const issueTokenPair = ({ clientId, scope, resource }) => {
  const accessToken = randomToken();
  const refreshToken = randomToken();
  const issuedAt = now();
  const accessExpiresAt = issuedAt + ACCESS_TTL_SECONDS * 1000;
  const accessFingerprint = fingerprint(accessToken);

  accessTokens.set(accessToken, {
    clientId,
    scopes: scope ? String(scope).split(' ').filter(Boolean) : [],
    resource,
    expiresAt: accessExpiresAt,
    issuedAt,
    fingerprint: accessFingerprint
  });
  refreshTokens.set(refreshToken, {
    clientId,
    scopes: scope ? String(scope).split(' ').filter(Boolean) : [],
    resource,
    expiresAt: issuedAt + 14 * 24 * 3600 * 1000,
    fingerprint: fingerprint(refreshToken)
  });
  stats.issuedAccessTokens += 1;
  stats.issuedRefreshTokens += 1;

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: 'Bearer',
    expires_in: ACCESS_TTL_SECONDS,
    scope: scope ?? ''
  };
};

const findBearer = (req) => {
  const header = req.headers.authorization ?? '';
  const [scheme, value] = String(header).split(' ');
  if (!value || String(scheme).toLowerCase() !== 'bearer') return undefined;
  const record = accessTokens.get(value);
  if (!record) return undefined;
  return { token: value, record };
};

const bearerFailure = (req, error, description) => {
  const header =
    `Bearer error="${error}", error_description="${description}", ` +
    `scope="${SCOPE}", resource_metadata="${BASE}${PRM_PATH_AWARE}"`;
  const res = req.__fixtureRes;
  res.writeHead(401, {
    'www-authenticate': header,
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  res.end(JSON.stringify({ error, error_description: description }));
};

// ---------------------------------------------------------------------------
// MCP JSON-RPC
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    name: 'whoami',
    description: '返回当前 Bearer 令牌对应的调用者标识（fixture 固定值）',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'echo',
    description: '原样返回 text 参数',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text']
    }
  }
];

const rpcResult = (message, authContext) => {
  switch (message.method) {
    case 'initialize':
      return {
        protocolVersion: '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'mcp-oauth-fixture', version: '1.0.0' }
      };
    case 'ping':
      return {};
    case 'tools/list':
      return { tools: TOOLS };
    case 'tools/call': {
      const params = message.params ?? {};
      if (params.name === 'whoami') {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                subject: 'fixture-user',
                scope: authContext?.scopes.join(' ') ?? '',
                resource: authContext?.resource ?? ''
              })
            }
          ]
        };
      }
      if (params.name === 'echo') {
        return { content: [{ type: 'text', text: String(params.arguments?.text ?? '') }] };
      }
      return { isError: true, content: [{ type: 'text', text: `unknown tool: ${params.name}` }] };
    }
    default:
      return {};
  }
};

// ---------------------------------------------------------------------------
// 请求处理
// ---------------------------------------------------------------------------

const server = createServer(async (req, res) => {
  req.__fixtureRes = res;
  const url = new URL(req.url ?? '/', BASE);
  const path = url.pathname;
  const method = (req.method ?? 'GET').toUpperCase();
  let recorded = false;
  const finish = (status, extra) => {
    if (!recorded) {
      recordEvent(req, status, extra);
      recorded = true;
    }
  };
  res.on('finish', () => finish(res.statusCode));

  try {
    // ---------------- health / debug ----------------
    if (path === '/health') {
      return json(res, 200, {
        ok: true,
        issuer: BASE,
        resource: RESOURCE,
        mode: MODE,
        scope: SCOPE,
        consent: config.consent,
        prmSource: config.prmSource,
        prmMode: config.prmMode
      });
    }

    if (path === '/debug/bearer-fingerprints') {
      return json(res, 200, {
        fingerprints,
        expiredFingerprints: [...expiredFingerprints],
        total: fingerprints.length,
        distinct: [...new Set(fingerprints)].length
      });
    }

    if (path === '/debug/stats') {
      return json(res, 200, {
        issuer: BASE,
        resource: RESOURCE,
        mode: MODE,
        scope: SCOPE,
        failures: [...config.failures],
        rotate: config.rotate,
        consent: config.consent,
        prmMode: config.prmMode,
        ...stats,
        activeAccessTokenFingerprints: [...accessTokens.values()].map((item) => item.fingerprint),
        activeRefreshTokenFingerprints: [...refreshTokens.values()].map((item) => item.fingerprint),
        clients: [...clients.values()].map((client) => ({
          client_id: client.client_id,
          source: client.source,
          redirect_uris: client.redirect_uris,
          auth_method: client.authMethod,
          has_secret: Boolean(client.client_secret)
        })),
        mcp: {
          requests: stats.mcpRequests,
          lastFingerprint: fingerprints.length ? fingerprints[fingerprints.length - 1] : null
        }
      });
    }

    if (path === '/debug/events') {
      return json(res, 200, { events });
    }

    if (path === '/debug/inject' && method === 'POST') {
      const body = parseJson(await readBodyLimited(req)) ?? {};
      if (Array.isArray(body.failures)) {
        config.failures = new Set(body.failures.map(String));
      }
      if (typeof body.rotate === 'boolean') config.rotate = body.rotate;
      if (body.consent === 'auto' || body.consent === 'always') config.consent = body.consent;
      if (typeof body.advertiseCimd === 'boolean') config.advertise.cimd = body.advertiseCimd;
      if (typeof body.advertiseDcr === 'boolean') config.advertise.dcr = body.advertiseDcr;
      if (body.prmSource === 'header' || body.prmSource === 'well-known') {
        config.prmSource = body.prmSource;
      }
      if (body.prmMode === 'present' || body.prmMode === 'missing') {
        config.prmMode = body.prmMode;
      }
      if (body.resetStats === true) {
        for (const key of Object.keys(stats)) {
          if (typeof stats[key] === 'number') stats[key] = 0;
          else if (key === 'tokenRequestsByGrant') {
            stats.tokenRequestsByGrant = { authorization_code: 0, refresh_token: 0 };
          }
        }
      }
      return json(res, 200, {
        ok: true,
        failures: [...config.failures],
        rotate: config.rotate,
        consent: config.consent,
        advertise: config.advertise,
        prmSource: config.prmSource,
        prmMode: config.prmMode
      });
    }

    // 让当前所有 access token 失效：用于触发运行时 401 → 强制刷新路径。
    if (path === '/debug/expire-tokens' && method === 'POST') {
      let count = 0;
      for (const [token, record] of accessTokens) {
        expiredFingerprints.add(record.fingerprint);
        accessTokens.delete(token);
        count += 1;
      }
      return json(res, 200, { ok: true, expired: count });
    }

    if (path === '/debug/reset' && method === 'POST') {
      clients.clear();
      codes.clear();
      accessTokens.clear();
      refreshTokens.clear();
      cimdCache.clear(); // 重置后必须重新 fetch CIMD 文档，否则 cimdFetches 指标不可复现
      consentRequests.clear();
      // 恢复启动时默认模式，避免 UI 用例中途失败后影响 F1 的自动回调路径。
      config.consent = CONSENT_DEFAULT;
      fingerprints.length = 0;
      expiredFingerprints.clear();
      events.length = 0;
      for (const key of Object.keys(stats)) {
        if (typeof stats[key] === 'number') stats[key] = 0;
      }
      stats.tokenRequestsByGrant = { authorization_code: 0, refresh_token: 0 };
      return json(res, 200, { ok: true });
    }

    // ---------------- RFC 9728 PRM ----------------
    if (
      path === '/.well-known/oauth-protected-resource' ||
      path === PRM_PATH_AWARE ||
      path === PRM_PATH
    ) {
      // v2.4 回退用例：PRM 不可用时，FastGPT 必须退到 MCP origin 的根 AS metadata。
      if (config.prmMode === 'missing') {
        return json(res, 404, { error: 'not_found' });
      }
      if (hasFailure('discovery_302')) {
        res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/' });
        return res.end();
      }
      const resource = hasFailure('prm_resource_mismatch')
        ? `${BASE}/some-other-resource`
        : RESOURCE;
      return json(res, 200, {
        resource,
        authorization_servers: [BASE],
        scopes_supported: [SCOPE],
        bearer_methods_supported: ['header'],
        resource_name: 'FastGPT MCP OAuth fixture'
      });
    }

    // ---------------- RFC 8414 AS metadata ----------------
    if (
      path === '/.well-known/oauth-authorization-server' ||
      path === '/.well-known/openid-configuration'
    ) {
      const metadata = {
        issuer: BASE,
        authorization_endpoint: `${BASE}/authorize`,
        token_endpoint: `${BASE}/token`,
        revocation_endpoint: `${BASE}/revoke`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: [
          'none',
          'client_secret_basic',
          'client_secret_post'
        ],
        revocation_endpoint_auth_methods_supported: [
          'none',
          'client_secret_basic',
          'client_secret_post'
        ],
        scopes_supported: [SCOPE]
      };
      if (config.advertise.cimd) metadata.client_id_metadata_document_supported = true;
      if (config.advertise.dcr) metadata.registration_endpoint = `${BASE}/register`;
      return json(res, 200, metadata);
    }

    // ---------------- RFC 7591 DCR ----------------
    if (path === '/register' && method === 'POST') {
      if (!config.advertise.dcr || hasFailure('dcr_disabled')) {
        return json(res, 404, { error: 'not_supported' });
      }
      const body = parseJson(await readBodyLimited(req)) ?? {};
      const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris.map(String) : [];
      if (redirectUris.length === 0 || !redirectUris.every(isAbsoluteHttpUrl)) {
        return json(res, 400, { error: 'invalid_redirect_uri' });
      }
      const clientId = randomId();
      const wantsSecret =
        body.token_endpoint_auth_method === 'client_secret_basic' ||
        body.token_endpoint_auth_method === 'client_secret_post';
      const clientSecret = wantsSecret ? randomToken() : undefined;
      const registrationAccessToken = randomToken();
      const client = {
        client_id: clientId,
        redirect_uris: redirectUris,
        client_name: String(body.client_name ?? 'FastGPT'),
        source: 'dcr',
        authMethod: wantsSecret ? String(body.token_endpoint_auth_method) : 'none',
        client_secret: clientSecret,
        registration_access_token: registrationAccessToken
      };
      clients.set(clientId, client);
      stats.registrations += 1;
      return json(res, 201, {
        client_id: clientId,
        client_name: client.client_name,
        redirect_uris: redirectUris,
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: client.authMethod,
        ...(clientSecret ? { client_secret: clientSecret } : {}),
        registration_access_token: registrationAccessToken,
        registration_client_uri: `${BASE}/register/${clientId}`
      });
    }

    // RFC 7592 客户端配置读取 / 注销
    if (path.startsWith('/register/')) {
      const clientId = path.slice('/register/'.length);
      const client = clients.get(clientId);
      if (!client) return json(res, 404, { error: 'invalid_client' });
      const authorization = req.headers.authorization ?? '';
      const bearer = authorization.toLowerCase().startsWith('bearer ')
        ? authorization.slice(7)
        : '';
      if (!client.registration_access_token || bearer !== client.registration_access_token) {
        return json(res, 401, { error: 'invalid_token' });
      }
      if (method === 'GET') {
        return json(res, 200, {
          client_id: clientId,
          client_name: client.client_name,
          redirect_uris: client.redirect_uris,
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          token_endpoint_auth_method: client.authMethod
        });
      }
      if (method === 'DELETE') {
        clients.delete(clientId);
        stats.deregistrations += 1;
        res.writeHead(204);
        return res.end();
      }
      res.writeHead(405, { allow: 'GET, DELETE' });
      return res.end();
    }

    // ---------------- 授权端点（自动同意 / 真实同意页） ----------------
    if (path === '/authorize' && method === 'GET') {
      const clientId = url.searchParams.get('client_id') ?? '';
      const redirectUri = url.searchParams.get('redirect_uri') ?? '';
      const state = url.searchParams.get('state') ?? '';
      const challenge = url.searchParams.get('code_challenge') ?? '';
      const challengeMethod = url.searchParams.get('code_challenge_method') ?? '';
      const resource = url.searchParams.get('resource') ?? RESOURCE;
      const scope = url.searchParams.get('scope') ?? SCOPE;

      // PKCE 降级注入：AS 不要求/不支持 S256。
      if (config.failures.has('pkce_plain')) {
        const code = randomToken();
        codes.set(code, {
          clientId,
          redirectUri,
          challenge: null,
          scope,
          resource,
          expiresAt: now() + 5 * 60 * 1000
        });
        const location = new URL(redirectUri);
        location.searchParams.set('code', code);
        if (state) location.searchParams.set('state', state);
        return redirect(res, location.toString());
      }

      if (
        url.searchParams.get('response_type') !== 'code' ||
        !challenge ||
        challengeMethod !== 'S256' ||
        !state
      ) {
        return json(res, 400, {
          error: 'invalid_request',
          error_description: 'response_type=code, state and PKCE S256 are required'
        });
      }

      let client;
      try {
        client = await resolveRegisteredClient({ clientId, redirectUri, request: req });
      } catch (error) {
        return json(res, 400, {
          error: 'invalid_client',
          error_description: String(error.message ?? error)
        });
      }

      if (hasFailure('authorize_denied')) {
        stats.authorizationsDenied += 1;
        const location = new URL(redirectUri);
        location.searchParams.set('error', 'access_denied');
        location.searchParams.set('error_description', 'fixture injected denial');
        if (state) location.searchParams.set('state', state);
        return redirect(res, location.toString());
      }

      // 真实同意页：prompt=consent 或 fixture 处于 always 模式时，先展示 HTML，
      // 用户点击后再由 POST /authorize/decision 继续 302 回调。auto 模式保持原行为。
      const prompt = url.searchParams.get('prompt');
      if (prompt === 'consent' || config.consent === 'always') {
        for (const [id, transaction] of consentRequests) {
          if (transaction.expiresAt < now()) consentRequests.delete(id);
        }
        const transactionId = randomToken();
        const clientName = client.client_name || clientId;
        consentRequests.set(transactionId, {
          clientId,
          clientName,
          redirectUri,
          state,
          challenge,
          scope,
          resource,
          expiresAt: now() + 5 * 60 * 1000
        });
        stats.consentsShown += 1;
        return html(
          res,
          200,
          renderConsentPage({ transactionId, clientName, clientId, redirectUri, scope, resource })
        );
      }

      return issueAuthorizationCode({ res, clientId, redirectUri, challenge, scope, resource, state });
    }

    // ---------------- 同意页提交（一次性事务） ----------------
    if (path === '/authorize/decision' && method === 'POST') {
      const form = parseForm(await readBodyLimited(req));
      const transactionId = form.transaction_id ?? '';
      const transaction = consentRequests.get(transactionId);
      if (!transaction || transaction.expiresAt < now()) {
        consentRequests.delete(transactionId);
        return html(
          res,
          400,
          '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><body style="font-family:sans-serif;padding:32px"><h1>授权请求已过期</h1><p>请回到应用重新发起授权。</p></body></html>'
        );
      }
      consentRequests.delete(transactionId);

      if (form.decision !== 'approve') {
        stats.authorizationsDenied += 1;
        stats.consentsDenied += 1;
        const location = new URL(transaction.redirectUri);
        location.searchParams.set('error', 'access_denied');
        location.searchParams.set('error_description', 'user denied consent');
        if (transaction.state) location.searchParams.set('state', transaction.state);
        return redirect(res, location.toString());
      }

      stats.consentsApproved += 1;
      return issueAuthorizationCode({ res, ...transaction });
    }

    // ---------------- token 端点 ----------------
    if (path === '/token' && method === 'POST') {
      if (hasFailure('token_500')) {
        stats.tokenErrors += 1;
        return json(res, 500, { error: 'server_error' });
      }
      if (hasFailure('token_302')) {
        stats.tokenErrors += 1;
        res.writeHead(302, { location: `${BASE}/token-redirect-target` });
        return res.end();
      }
      if (hasFailure('token_timeout')) {
        stats.tokenErrors += 1;
        return; // 故意不响应；由调用方超时。
      }

      const raw = await readBodyLimited(req);
      const contentType = req.headers['content-type'] ?? '';
      const form = contentType.includes('application/json')
        ? (parseJson(raw) ?? {})
        : parseForm(raw);
      const grantType = form.grant_type;
      stats.tokenRequests += 1;
      stats.tokenRequestsByGrant[grantType] = (stats.tokenRequestsByGrant[grantType] ?? 0) + 1;

      const auth = clientAuthFromRequest(req, form);
      const client = clients.get(auth.clientId);
      if (!client) {
        stats.tokenErrors += 1;
        return json(res, 401, { error: 'invalid_client' });
      }
      if (!verifyClientSecret(client, auth.clientSecret)) {
        stats.tokenErrors += 1;
        return json(res, 401, { error: 'invalid_client' });
      }

      if (grantType === 'authorization_code') {
        const record = codes.get(form.code ?? '');
        if (!record || record.expiresAt < now() || record.clientId !== auth.clientId) {
          stats.tokenErrors += 1;
          return json(res, 400, { error: 'invalid_grant' });
        }
        codes.delete(form.code);
        if (form.redirect_uri && record.redirectUri !== form.redirect_uri) {
          stats.tokenErrors += 1;
          return json(res, 400, { error: 'invalid_grant', error_description: 'redirect_uri mismatch' });
        }
        if (!pkceMatches(form.code_verifier ?? '', record.challenge ?? '')) {
          stats.tokenErrors += 1;
          return json(res, 400, {
            error: 'invalid_grant',
            error_description: 'PKCE verification failed'
          });
        }
        if (form.resource && form.resource !== record.resource) {
          stats.tokenErrors += 1;
          return json(res, 400, { error: 'invalid_target' });
        }
        return json(
          res,
          200,
          issueTokenPair({
            clientId: auth.clientId,
            scope: form.scope || record.scope,
            resource: record.resource
          })
        );
      }

      if (grantType === 'refresh_token') {
        const record = refreshTokens.get(form.refresh_token ?? '');
        if (!record || record.expiresAt < now() || record.clientId !== auth.clientId) {
          stats.tokenErrors += 1;
          return json(res, 400, { error: 'invalid_grant' });
        }
        if (form.resource && record.resource && form.resource !== record.resource) {
          stats.tokenErrors += 1;
          return json(res, 400, { error: 'invalid_target' });
        }
        if (config.rotate) {
          refreshTokens.delete(form.refresh_token);
          stats.refreshTokensRotated += 1;
        }
        stats.refreshes += 1;
        return json(
          res,
          200,
          issueTokenPair({
            clientId: auth.clientId,
            scope: form.scope || record.scopes.join(' '),
            resource: record.resource
          })
        );
      }

      stats.tokenErrors += 1;
      return json(res, 400, { error: 'unsupported_grant_type' });
    }

    // ---------------- RFC 7009 revoke ----------------
    if (path === '/revoke' && method === 'POST') {
      const raw = await readBodyLimited(req);
      const form = parseForm(raw);
      const value = form.token ?? '';
      const record = refreshTokens.get(value) ?? accessTokens.get(value);
      if (record) expiredFingerprints.add(record.fingerprint);
      if (form.token_type_hint === 'refresh_token') refreshTokens.delete(value);
      else {
        accessTokens.delete(value);
        refreshTokens.delete(value);
      }
      stats.revocations += 1;
      res.writeHead(200, { 'cache-control': 'no-store' });
      return res.end();
    }

    // ---------------- MCP endpoint ----------------
    if (path === '/mcp') {
      if (method === 'GET') {
        // 发现探活：未授权时必须返回 401 + resource_metadata。
        if (!findBearer(req)) {
          stats.mcpUnauthorized += 1;
          return bearerFailure(req, 'invalid_token', 'Missing or invalid bearer token');
        }
        res.writeHead(405, { allow: 'POST, DELETE' });
        return res.end();
      }
      if (method === 'DELETE') {
        res.writeHead(204);
        return res.end();
      }
      if (method !== 'POST') {
        res.writeHead(405, { allow: 'POST, DELETE' });
        return res.end();
      }

      stats.mcpRequests += 1;
      if (hasFailure('mcp_insufficient_scope')) {
        stats.mcpInsufficientScope += 1;
        return bearerFailure(req, 'insufficient_scope', 'fixture injected insufficient_scope');
      }
      const bearer = findBearer(req);
      if (!bearer) {
        stats.mcpUnauthorized += 1;
        return bearerFailure(req, 'invalid_token', 'Missing or invalid bearer token');
      }
      if (bearer.record.expiresAt <= now()) {
        stats.mcpUnauthorized += 1;
        expiredFingerprints.add(bearer.record.fingerprint);
        return bearerFailure(req, 'invalid_token', 'token expired');
      }
      if (!bearer.record.scopes.includes(SCOPE)) {
        stats.mcpInsufficientScope += 1;
        return bearerFailure(req, 'insufficient_scope', `missing scope ${SCOPE}`);
      }
      if (bearer.record.resource && bearer.record.resource !== RESOURCE) {
        stats.mcpUnauthorized += 1;
        return bearerFailure(req, 'invalid_token', 'resource mismatch');
      }

      fingerprints.push(bearer.record.fingerprint);
      const message = parseJson(await readBodyLimited(req)) ?? {};

      // JSON-RPC 通知（无 id）返回 202。
      if (message.id === undefined || message.id === null) {
        res.writeHead(202, { 'cache-control': 'no-store' });
        return res.end();
      }
      return json(res, 200, {
        jsonrpc: '2.0',
        id: message.id,
        result: rpcResult(message, bearer.record)
      });
    }

    // ---------------- token endpoint redirect target (should never be followed) ----------------
    if (path === '/token-redirect-target') {
      return json(res, 200, { error: 'redirect_must_not_be_followed' });
    }

    return json(res, 404, { error: 'not_found' });
  } catch (error) {
    console.error('[mcpOAuthFixture] unhandled error', error);
    if (!res.headersSent) {
      return json(res, 500, { error: 'server_error', error_description: String(error?.message ?? error) });
    }
    res.end();
  }
});

server.listen(PORT, HOST, () => {
  console.log(
    `[mcpOAuthFixture] listening on ${BASE} (mode=${MODE}, resource=${RESOURCE}, scope=${SCOPE})`
  );
});

const shutdown = () => {
  console.log('[mcpOAuthFixture] shutting down');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
