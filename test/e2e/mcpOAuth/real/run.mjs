/**
 * MCP OAuth v2.4 —— 真实授权服务器 E2E（`E2E_AS_MODE=real`）。
 *
 * 与 `../v24/run.mjs` 的区别：这里的 OAuth AS / MCP server 不是进程内 fixture，
 * 而是 desktop 106 上运行的上游 `wille/mcp-oauth-server` demo；FastGPT 仍然是
 * 真实生产构建（`next start`）+ 真实 Mongo/Redis。
 *
 * 拓扑：
 *   109 FastGPT (production) --http--> host.docker.internal:18200
 *   109 /etc/hosts: host.docker.internal -> 172.17.0.34（本机）
 *   109 asProxy: 172.17.0.34:18200 --> 172.17.0.22:18200（106 真实 AS）
 *
 * 代理只记录 method/path/status（见 lib/asProxy.mjs），作为 109 侧可读的
 * 「AS 上游边界日志」。它不是 FastGPT 代码的一部分。
 *
 * 安全：不打印、不落盘 access/refresh token、code、state、client_secret。
 * 需要主动失效 access token 时，仅在内存中解密一次并立即调用真实 `/revoke`。
 */
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { createRespClient } from '../v24/lib/respClient.mjs';

const ROOT = path.resolve(import.meta.dirname, '../../../..');
const APP_DIR = path.join(ROOT, 'projects/app');
const requireFromApp = createRequire(path.join(APP_DIR, 'package.json'));

const CFG = {
  phase: process.env.E2E_PHASE || 'dcr',
  appBase: (process.env.E2E_APP_BASE_URL || 'http://127.0.0.1:13100').replace(/\/+$/, ''),
  feDomain: (process.env.E2E_FE_DOMAIN || 'http://127.0.0.1:13100').replace(/\/+$/, ''),
  asBase: (process.env.E2E_AS_BASE_URL || 'http://host.docker.internal:18200').replace(/\/+$/, ''),
  asIssuer: (process.env.E2E_AS_ISSUER || 'http://host.docker.internal:18200/').replace(/\/*$/, '/'),
  asResource: (
    process.env.E2E_AS_RESOURCE || 'http://host.docker.internal:18200/mcp'
  ).replace(/\/+$/, ''),
  asLogPath: process.env.E2E_AS_PROXY_LOG || '/tmp/mcp-oauth-e2e/as-proxy.log',
  mongoUri:
    process.env.MONGODB_URI ||
    'mongodb://127.0.0.1:27017/fastgpt_mcp_oauth_real_e2e?replicaSet=rs0',
  redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  aesKey: process.env.AES256_SECRET_KEY || '',
  evidencePath:
    process.env.E2E_EVIDENCE_PATH || `/tmp/mcp-oauth-e2e/evidence-${process.env.E2E_PHASE || 'dcr'}.json`,
  consentUserId: process.env.E2E_AS_CONSENT_USER || 'fastgpt-e2e-user',
  timeoutMs: Number(process.env.E2E_HTTP_TIMEOUT_MS || 30000)
};

const CALLBACK_PATH = '/api/core/app/mcpTools/oauth/callback';
const CIMD_PATH = '/api/core/app/mcpTools/oauth/client-metadata.json';
const mcpUrl = CFG.asResource;

const sha256_12 = (value) =>
  crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 12);
const nowIso = () => new Date().toISOString();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ------------------------------ HTTP 基础 ------------------------------ */

const request = async (
  target,
  {
    method = 'GET',
    token,
    body,
    form,
    cookie,
    headers = {},
    timeoutMs = CFG.timeoutMs,
    redirect = 'manual'
  } = {}
) => {
  const init = {
    method,
    redirect,
    headers: { accept: 'application/json', ...headers },
    signal: AbortSignal.timeout(timeoutMs)
  };
  if (form !== undefined) {
    init.headers['content-type'] = 'application/x-www-form-urlencoded';
    init.body = form.toString();
  } else if (body !== undefined) {
    init.headers['content-type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  if (token) init.headers.token = token;
  if (cookie) init.headers.cookie = cookie;

  const response = await fetch(target, init);
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    setCookies:
      typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [],
    location: response.headers.get('location'),
    text,
    json
  };
};

const api = (apiPath, options = {}) => request(`${CFG.appBase}${apiPath}`, options);
const apiData = (res) => (res.json && typeof res.json === 'object' ? res.json.data : undefined);
const asRequest = (asPath, options = {}) => request(`${CFG.asBase}${asPath}`, options);

const hasForbiddenKeys = (value, keys, seen = new WeakSet()) => {
  if (!value || typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (keys.has(key)) return true;
    if (hasForbiddenKeys(child, keys, seen)) return true;
  }
  return false;
};

/* ------------------------------ AS 边界日志 ------------------------------ */

const readAsLog = () => {
  if (!fs.existsSync(CFG.asLogPath)) return [];
  return fs
    .readFileSync(CFG.asLogPath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
};

const asCount = (predicate) => readAsLog().filter(predicate).length;
const isRegister = (entry) => entry.method === 'POST' && entry.path === '/register';
const isAuthorize = (entry) => entry.method === 'GET' && entry.path === '/authorize';
const isConsent = (entry) => entry.method === 'GET' && entry.path === '/consent';
const isConfirm = (entry) => entry.method === 'POST' && entry.path === '/confirm';
const isToken = (entry) => entry.method === 'POST' && entry.path === '/token';
const isTokenGrant = (grantType) => (entry) =>
  isToken(entry) && entry.grantType === grantType;
const isRevoke = (entry) => entry.method === 'POST' && entry.path === '/revoke';
const isMcp = (entry) => entry.method === 'POST' && entry.path === '/mcp';

const mcpStatusCount = (status) =>
  asCount((entry) => isMcp(entry) && entry.status === status);

/** 记录该用例起始时的 AS 边界计数，用例结束时做 delta 断言。 */
const captureAsCounters = () => {
  const log = readAsLog();
  return {
    logLength: log.length,
    register: log.filter(isRegister).length,
    authorize: log.filter(isAuthorize).length,
    consent: log.filter(isConsent).length,
    confirm: log.filter(isConfirm).length,
    tokenAuthorizationCode: log.filter(isTokenGrant('authorization_code')).length,
    tokenRefresh: log.filter(isTokenGrant('refresh_token')).length,
    revoke: log.filter(isRevoke).length
  };
};

const asDelta = (before) => {
  const after = captureAsCounters();
  return Object.fromEntries(
    Object.keys(after).map((key) => [key, after[key] - (before[key] ?? 0)])
  );
};

/* ------------------------------ 证据 ------------------------------ */

const cases = [];
let currentCase;

const beginCase = (id, title) => {
  currentCase = { id, title, startedAt: nowIso(), checks: [], notes: [] };
  cases.push(currentCase);
  console.log(`\n=== ${id} ${title} ===`);
};

const check = (label, ok, detail) => {
  const item = { label, ok: Boolean(ok), ...(detail === undefined ? {} : { detail }) };
  currentCase.checks.push(item);
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${detail === undefined ? '' : ` :: ${JSON.stringify(detail)}`}`);
  return item.ok;
};

const note = (text) => {
  currentCase.notes.push(text);
  console.log(`  [note] ${text}`);
};

const runCase = async (id, title, fn) => {
  beginCase(id, title);
  try {
    await fn();
  } catch (error) {
    check('case did not throw unexpectedly', false, {
      error: String(error?.stack ?? error).slice(0, 600)
    });
  }
};

/* ------------------------------ 业务辅助 ------------------------------ */

let sessionToken;
let db;
let redis;
let mongoose;
let ObjectId;

const clearRateLimits = async () => {
  await redis.scanDelete('fastgpt:rate-limit:mcp-oauth:*');
  await redis.scanDelete('rate-limit:mcp-oauth:*');
};

const createApp = async ({
  name,
  url,
  authMode = 'oauth',
  clientMode,
  scope,
  headerSecret,
  toolList = []
}) => {
  const res = await api('/api/core/app/mcpTools/create', {
    method: 'POST',
    token: sessionToken,
    body: {
      name,
      url,
      authMode,
      ...(clientMode !== undefined ? { clientMode } : {}),
      ...(scope !== undefined ? { scope } : {}),
      ...(headerSecret !== undefined ? { headerSecret } : {}),
      toolList
    }
  });
  return { res, appId: apiData(res) };
};

const startOAuth = async (appId, extra = {}) => {
  const res = await api('/api/core/app/mcpTools/oauth/start', {
    method: 'POST',
    token: sessionToken,
    body: { appId, ...extra }
  });
  const cookieName = `mcp_oauth_bind_${appId}`;
  const raw = res.setCookies.find((item) => item.startsWith(`${cookieName}=`));
  const cookieValue = raw ? raw.split(';')[0].slice(cookieName.length + 1) : undefined;
  return { res, body: res.json, cookieName, cookieValue };
};

const parseHiddenInputs = (html) => {
  const fields = new URLSearchParams();
  const inputRe = /<input\b[^>]*>/gi;
  for (const [tag] of html.matchAll(inputRe)) {
    const attr = (name) => {
      const match = new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i').exec(tag);
      return match?.[1];
    };
    if ((attr('type') || '').toLowerCase() !== 'hidden') continue;
    const name = attr('name');
    if (!name) continue;
    fields.set(name, attr('value') ?? '');
  }
  return fields;
};

/**
 * 模拟浏览器完成真实 AS 授权：
 *   /authorize -> 302 /consent -> POST /confirm -> 302 redirect_uri?code&state&iss
 * 返回每一步的状态，code/state/iss 仅保存在内存。
 */
const performAuthorization = async (authorizationUrl) => {
  const authorize = await request(authorizationUrl, { method: 'GET' });
  if (authorize.status !== 302 || !authorize.location) {
    return { authorize, consent: null, confirm: null, redirect: null };
  }
  const firstLocation = new URL(authorize.location, authorizationUrl);
  const finalize = (redirect) => ({
    authorize,
    consent: null,
    confirm: null,
    redirect,
    code: redirect.searchParams.get('code') ?? undefined,
    state: redirect.searchParams.get('state') ?? undefined,
    iss: redirect.searchParams.get('iss') ?? undefined,
    error: redirect.searchParams.get('error') ?? undefined,
    errorDescription: redirect.searchParams.get('error_description') ?? undefined
  });
  // AS 可直接以 error=... 重定向回 redirect_uri（例如 invalid_scope），此时不经过 /consent。
  if (firstLocation.pathname !== '/consent') return finalize(firstLocation);

  const consentUrl = firstLocation;
  const consent = await request(consentUrl.toString(), { method: 'GET' });
  if (consent.status !== 200) {
    return { authorize, consent, confirm: null, redirect: null };
  }
  const fields = parseHiddenInputs(consent.text);
  fields.set('user_id', CFG.consentUserId);
  const confirmUrl = new URL('/confirm', consentUrl.origin).toString();
  const confirm = await request(confirmUrl, { method: 'POST', form: fields });
  if (confirm.status !== 302 || !confirm.location) {
    return { authorize, consent, confirm, redirect: null };
  }
  return { ...finalize(new URL(confirm.location)), consent, confirm };
};

const callbackPath = (params) => {
  const url = new URL(`${CFG.appBase}${CALLBACK_PATH}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  return url.toString();
};

const parseCallbackOutcome = (res) => {
  if (res.status !== 302 || !res.location) {
    return { redirected: false, status: res.status, body: res.json };
  }
  const url = new URL(res.location);
  return {
    redirected: true,
    appId: url.searchParams.get('appId') ?? undefined,
    oauth: url.searchParams.get('oauth') ?? undefined,
    code: url.searchParams.get('code') ?? undefined
  };
};

const doCallback = async ({ state, code, cookie, iss, error, errorDescription }) =>
  parseCallbackOutcome(
    await request(callbackPath({ state, code, iss, error, error_description: errorDescription }), {
      method: 'GET',
      cookie
    })
  );

const statusOf = async (appId) => {
  const res = await api(`/api/core/app/mcpTools/oauth/status?appId=${encodeURIComponent(appId)}`, {
    token: sessionToken
  });
  return { res, status: res.json };
};

const getTools = async (appId) =>
  api('/api/core/app/mcpTools/getTools', { method: 'POST', token: sessionToken, body: { appId } });

const runTool = async (appId, toolName = 'echo', params = { text: 'hello-e2e' }) =>
  api('/api/core/app/mcpTools/runTool', {
    method: 'POST',
    token: sessionToken,
    body: { appId, toolName, params }
  });

const latestVersion = async (appId) =>
  db.collection('app_versions').findOne(
    { appId: new ObjectId(appId), isPublish: true },
    { sort: { time: -1, _id: -1 } }
  );

const nodeOauth = async (appId) => {
  const version = await latestVersion(appId);
  if (!version) return { version: null, node: null, oauth: undefined, toolSet: undefined };
  const node = (version.nodes ?? []).find((item) => item?.flowNodeType === 'toolSet');
  const toolSet = node?.toolConfig?.mcpToolSet;
  return { version, node, toolSet, oauth: toolSet?.oauth };
};

const pendingStates = (appId) =>
  db.collection('mcp_oauth_states').countDocuments({
    appId: String(appId),
    consumedAt: { $exists: false },
    expiresAt: { $gt: new Date() }
  });

const consumedStates = (appId) =>
  db.collection('mcp_oauth_states').countDocuments({
    appId: String(appId),
    consumedAt: { $exists: true }
  });

/** 把节点 token 的 expiresAt 改到刷新窗口内，用于主动刷新路径（不改任何生产逻辑）。 */
const forceTokenExpiring = async (appId, nodeId) => {
  const version = await latestVersion(appId);
  const result = await db.collection('app_versions').updateOne(
    { _id: version._id, 'nodes.nodeId': nodeId },
    { $set: { 'nodes.$.toolConfig.mcpToolSet.oauth.token.expiresAt': Date.now() + 1000 } }
  );
  return result.modifiedCount === 1;
};

/* ------------------------------ 密钥（仅内存） ------------------------------ */

const derivedKey = () =>
  crypto.scryptSync(CFG.aesKey, 'salt', 32);

/** 解密 `{ secret: "iv:hex:tag" }`；只在需要主动撤销 token 时调用。 */
const decryptStoredSecret = (wrapped) => {
  const encryptedText = wrapped?.secret;
  if (typeof encryptedText !== 'string') return undefined;
  const [ivHex, encryptedHex, authTagHex] = encryptedText.split(':');
  if (!ivHex || !encryptedHex || !authTagHex) return undefined;
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    derivedKey(),
    Buffer.from(ivHex, 'hex')
  );
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, 'hex')),
    decipher.final()
  ]).toString('utf8');
};

const tokenFingerprint = (wrapped) => {
  try {
    const value = decryptStoredSecret(wrapped);
    return value ? sha256_12(value) : null;
  } catch {
    return null;
  }
};

/* ------------------------------ 启动前置 ------------------------------ */

const seedAuth = async () => {
  mongoose = requireFromApp('mongoose');
  ObjectId = mongoose.Types.ObjectId;
  await mongoose.connect(CFG.mongoUri, { serverSelectionTimeoutMS: 15000 });
  const connection = mongoose.connection;
  db = { collection: (name) => connection.collection(name) };

  await connection.dropDatabase().catch(() => {});
  await connection.client
    .db('fastgpt_mcp_oauth_real_e2e_log')
    .dropDatabase()
    .catch(() => {});

  const userId = new ObjectId();
  const teamId = new ObjectId();
  const tmbId = new ObjectId();

  await db.collection('users').insertOne({
    _id: userId,
    username: 'e2e-user',
    status: 'active',
    createTime: new Date()
  });
  await db.collection('teams').insertOne({
    _id: teamId,
    name: 'E2E Real AS Team',
    ownerId: userId,
    createTime: new Date()
  });
  await db.collection('team_members').insertOne({
    _id: tmbId,
    teamId,
    userId,
    name: 'E2E User',
    status: 'active',
    role: 'owner',
    isSetMemberName: true,
    createTime: new Date()
  });

  redis = createRespClient(CFG.redisUrl);
  const sessionId = `${userId}:${crypto.randomBytes(16).toString('hex')}`;
  const key = `fastgpt:session:${sessionId}`;
  await redis.command(
    'HSET',
    key,
    'userId',
    String(userId),
    'teamId',
    String(teamId),
    'tmbId',
    String(tmbId),
    'isRoot',
    '1',
    'createdAt',
    String(Date.now()),
    'ip',
    '127.0.0.1'
  );
  await redis.command('EXPIRE', key, '604800');
  sessionToken = sessionId;
  return { userId: String(userId), teamId: String(teamId), tmbId: String(tmbId) };
};

const ensureAppReady = async () => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const res = await request(`${CFG.appBase}/login`, { timeoutMs: 5000 });
      if (res.status === 200) return res.status;
    } catch {
      /* retry */
    }
    await sleep(1500);
  }
  throw new Error(`FastGPT is not serving HTTP at ${CFG.appBase}`);
};

const ensureAsReady = async () => {
  const res = await asRequest('/health', { timeoutMs: 8000 });
  if (res.status !== 200 || res.json?.ok !== true) {
    throw new Error(`real AS is not healthy at ${CFG.asBase}`);
  }
  return res.json;
};

/* ------------------------------ 用例：CIMD 阶段 ------------------------------ */

const cimdClientId = () => `${CFG.feDomain}${CIMD_PATH}`;
const redirectUri = () => `${CFG.feDomain}${CALLBACK_PATH}`;

const runCimdPhase = async () => {
  const appA = {};

  await runCase('real-cimd-01-create', '创建 mcpToolSet（真实 AS 的 MCP 资源）', async () => {
    await clearRateLimits();
    const { res, appId } = await createApp({
      name: `E2E real-cimd ${Date.now()}`,
      url: mcpUrl,
      clientMode: 'auto',
      scope: 'mcp:tools'
    });
    check('create -> HTTP 200', res.status === 200, { status: res.status });
    check('create -> appId returned', typeof appId === 'string' && /^[0-9a-f]{24}$/.test(appId));
    const { node, oauth } = await nodeOauth(appId);
    check('节点 authMode=oauth', node?.toolConfig?.mcpToolSet?.authMode === 'oauth');
    check('节点 clientMode=auto', oauth?.clientMode === 'auto', { clientMode: oauth?.clientMode });
    check('节点 MCP URL 指向真实 AS 资源', node?.toolConfig?.mcpToolSet?.url === mcpUrl);
    check('创建时尚未生成 client', oauth?.client === undefined);
    appA.appId = appId;
  });

  await runCase('real-cimd-02-start', 'start 选择 CIMD，真实 /register 无新增', async () => {
    await clearRateLimits();
    const before = captureAsCounters();
    const started = await startOAuth(appA.appId, { clientMode: 'auto', scope: 'mcp:tools' });
    appA.start = started;
    const delta = asDelta(before);
    check('start -> HTTP 200', started.res.status === 200, { status: started.res.status });
    check('clientSource=cimd', started.body?.clientSource === 'cimd', {
      clientSource: started.body?.clientSource
    });
    check('clientMode 归一为 auto', started.body?.clientMode === 'auto', {
      clientMode: started.body?.clientMode
    });
    check('issuer 来自真实 AS metadata', started.body?.issuer === CFG.asIssuer, {
      issuer: started.body?.issuer
    });
    check('resource = AS 声明的 MCP 资源', started.body?.resource === CFG.asResource, {
      resource: started.body?.resource
    });
    check('Set-Cookie 下发绑定 Cookie', !!started.cookieValue);
    check('state 台账 1 条', (await pendingStates(appA.appId)) === 1);
    check('AS /register delta = 0', delta.register === 0, { register: delta.register });
    check('AS /authorize delta = 0（start 不发起浏览器跳转）', delta.authorize === 0, {
      authorize: delta.authorize
    });
    const { oauth } = await nodeOauth(appA.appId);
    check('节点保存 CIMD client_id（本站公开文档 URL）', oauth?.client?.clientId === cimdClientId(), {
      matches: oauth?.client?.clientId === cimdClientId()
    });
    check('节点 clientSource=cimd', oauth?.clientSource === 'cimd', {
      clientSource: oauth?.clientSource
    });
    check('token_endpoint_auth_method=none', oauth?.client?.tokenEndpointAuthMethod === 'none');
    check('授权 URL 指向真实 AS /authorize', /^http:\/\/host\.docker\.internal:18200\/authorize\?/.test(
      started.body?.authorizationUrl ?? ''
    ));
    const authUrl = new URL(started.body?.authorizationUrl ?? 'http://invalid/');
    check('授权 URL 使用 response_type=code + PKCE S256',
      authUrl.searchParams.get('response_type') === 'code' &&
        authUrl.searchParams.get('code_challenge_method') === 'S256' &&
        !!authUrl.searchParams.get('code_challenge')
    );
    check('授权 URL 携带真实 resource', authUrl.searchParams.get('resource') === CFG.asResource);
    check('授权 URL 的 redirect_uri 由 FE_DOMAIN 派生',
      authUrl.searchParams.get('redirect_uri') === redirectUri(), {
        redirectUriMatches: authUrl.searchParams.get('redirect_uri') === redirectUri()
      });
    check('start 响应不含 clientSecret/secret',
      !hasForbiddenKeys(started.body, new Set(['clientSecret', 'secret', 'access_token', 'refresh_token'])));
    check('state 过期时间在未来', typeof started.body?.expiresAt === 'number' && started.body.expiresAt > Date.now());
  });

  await runCase('real-cimd-03-as-cimd-behavior', 'AS 行为探针：CIMD 是回源抓取而非按形态放行', async () => {
    // 直接对 AS 发一个 loopback client_id 的授权请求：若 AS 只校验形态，
    // 会进入 /consent；若真回源抓取，会因 fetch 失败而报错。
    const probeUrl = new URL(`${CFG.asBase}/authorize`);
    probeUrl.searchParams.set('response_type', 'code');
    probeUrl.searchParams.set('client_id', 'http://127.0.0.1:18999/client-metadata.json');
    probeUrl.searchParams.set('redirect_uri', redirectUri());
    probeUrl.searchParams.set('scope', 'mcp:tools');
    probeUrl.searchParams.set('state', 'probe');
    probeUrl.searchParams.set('code_challenge', '8i2sunNLdg6fIXcFN9w96EFevRHnqgqCHxYNkJE3b6c');
    probeUrl.searchParams.set('code_challenge_method', 'S256');
    probeUrl.searchParams.set('resource', CFG.asResource);
    const res = await request(probeUrl.toString(), { method: 'GET' });
    check('loopback CIMD client_id 被 AS 拒绝（非 302）', res.status !== 302, {
      status: res.status
    });
    check('AS 明确报“抓取失败”而非形态放行', res.json?.error === 'invalid_client' && /fetch/i.test(
      res.json?.error_description ?? ''
    ), { error: res.json?.error, description: res.json?.error_description });
    note('AS 的 CIMD 元数据主机白名单仅含 loopback；跨主机部署无法满足，见报告结论。');
  });

  await runCase('real-cimd-04-authorize-rejected', '真实 /authorize 拒绝 CIMD client，单次失败不改写节点状态', async () => {
    await clearRateLimits();
    const before = captureAsCounters();
    const flow = await performAuthorization(appA.start.body.authorizationUrl);
    const delta = asDelta(before);
    check('AS /authorize 被真实命中', delta.authorize === 1, { authorize: delta.authorize });
    check('AS 拒绝授权（400 invalid_client）', flow.authorize.status === 400, {
      status: flow.authorize.status
    });
    check('拒绝原因来自 CIMD 元数据主机校验', flow.authorize.json?.error === 'invalid_client', {
      description: flow.authorize.json?.error_description
    });
    check('拒绝响应没有下发 redirect', !flow.authorize.location);
    check('拒绝响应不包含 code/state', !/\"code\"|access_token/.test(flow.authorize.text));
    check('未进入 /consent', delta.consent === 0, { consent: delta.consent });
    check('未发生 code 交换', delta.tokenAuthorizationCode === 0);
    check('无静默改写：单次 /authorize 失败本身不触发 /register', delta.register === 0, {
      register: delta.register
    });
    const { oauth } = await nodeOauth(appA.appId);
    check('节点 clientSource 仍为 cimd（失败请求不改写状态）', oauth?.clientSource === 'cimd', {
      clientSource: oauth?.clientSource
    });
    check('未写入 token', oauth?.token === undefined);
    note('结论：CIMD 失败发生在 AS 侧且没有回调；降级依据是「上一次 CIMD 台账未消费」，由下一次 start 触发。');
  });

  await runCase('real-cimd-05-downgrade-start', '第二次 start 自动降级 DCR，/register 恰好 +1', async () => {
    await clearRateLimits();
    // 上一次 CIMD 尝试没有回调（AS 直接 400），台账仍未消费。
    const pendingCimd = await db.collection('mcp_oauth_states').findOne({
      appId: appA.appId,
      consumedAt: { $exists: false },
      clientSource: 'cimd'
    });
    check('台账存在未消费的 CIMD attempt', !!pendingCimd);
    check('该 attempt 尚未标记降级', pendingCimd?.downgradedAt === undefined);

    const before = captureAsCounters();
    const started = await startOAuth(appA.appId, { clientMode: 'auto', scope: 'mcp:tools' });
    appA.start2 = started;
    const delta = asDelta(before);
    check('第 2 次 start -> HTTP 200', started.res.status === 200, {
      status: started.res.status
    });
    check('自动 clientSource=dcr', started.body?.clientSource === 'dcr', {
      clientSource: started.body?.clientSource
    });
    check('clientMode 仍为 auto', started.body?.clientMode === 'auto');
    check('AS /register 恰好新增 1 次', delta.register === 1, { register: delta.register });

    const { oauth } = await nodeOauth(appA.appId);
    check('节点 clientSource=dcr', oauth?.clientSource === 'dcr', {
      clientSource: oauth?.clientSource
    });
    check('节点写入粘性降级标记 autoDcrFallback=true', oauth?.autoDcrFallback === true);
    check('client_id 不再是 CIMD 文档 URL', oauth?.client?.clientId !== cimdClientId(), {
      isCimd: oauth?.client?.clientId === cimdClientId()
    });

    const oldCimd = await db.collection('mcp_oauth_states').findOne({
      appId: appA.appId,
      clientSource: 'cimd'
    });
    check('旧 CIMD 台账已消费', !!oldCimd?.consumedAt);
    check('旧 CIMD 台账已标记 downgradedAt', !!oldCimd?.downgradedAt);
    const dcrState = await db.collection('mcp_oauth_states').findOne({
      appId: appA.appId,
      clientSource: 'dcr',
      consumedAt: { $exists: false }
    });
    check('新的 DCR 台账已写入且未消费', !!dcrState);
    check('state 台账未消费 1 条', (await pendingStates(appA.appId)) === 1);
  });

  await runCase('real-cimd-06-sticky-dcr', '连续 start 保持 DCR，不抖动且不再注册', async () => {
    await clearRateLimits();
    const before = captureAsCounters();
    const started = await startOAuth(appA.appId, { clientMode: 'auto', scope: 'mcp:tools' });
    appA.start3 = started;
    const delta = asDelta(before);
    check('第 3 次 start -> HTTP 200', started.res.status === 200, {
      status: started.res.status
    });
    check('clientSource 仍为 dcr（不回到 CIMD）', started.body?.clientSource === 'dcr', {
      clientSource: started.body?.clientSource
    });
    check('AS /register delta = 0（复用已保存 DCR client）', delta.register === 0, {
      register: delta.register
    });
    const { oauth } = await nodeOauth(appA.appId);
    const authUrl = new URL(started.body?.authorizationUrl ?? 'http://invalid/');
    check('授权 URL 使用已保存的 DCR client_id',
      authUrl.searchParams.get('client_id') === oauth?.client?.clientId);
  });

  await runCase('real-cimd-07-authorize-callback', '降级后真实 /authorize → /consent → /confirm → callback', async () => {
    await clearRateLimits();
    const before = captureAsCounters();
    const flow = await performAuthorization(appA.start3.body.authorizationUrl);
    appA.flow = flow;
    check('AS /authorize 不再 400，返回 302 /consent',
      flow.authorize.status === 302 && /\/consent/.test(flow.authorize.location ?? ''), {
        status: flow.authorize.status
      });
    check('AS /consent 返回 HTML 同意页',
      flow.consent?.status === 200 && /<form/i.test(flow.consent.text));
    check('AS /confirm -> 302 回调地址', flow.confirm?.status === 302);
    check('回调携带 code/state/iss', !!flow.code && !!flow.state && !!flow.iss);
    check('iss 等于真实 AS issuer', flow.iss === CFG.asIssuer);

    const outcome = await doCallback({
      state: flow.state,
      code: flow.code,
      iss: flow.iss,
      cookie: `${appA.start3.cookieName}=${appA.start3.cookieValue}`
    });
    appA.outcome = outcome;
    const delta = asDelta(before);
    check('callback -> HTTP 302', outcome.redirected, { status: outcome.status });
    check('callback 跳转 oauth=success', outcome.oauth === 'success', {
      oauth: outcome.oauth,
      appIdMatches: outcome.appId === appA.appId
    });
    check('AS /token(authorization_code) 恰好 1 次', delta.tokenAuthorizationCode === 1, {
      token: delta.tokenAuthorizationCode
    });
    check('state 一次性消费', (await consumedStates(appA.appId)) >= 1);

    const { oauth } = await nodeOauth(appA.appId);
    check('token 加密落库（iv:hex:hex）', /^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/.test(
      oauth?.token?.secret?.access_token?.secret ?? ''
    ));
    check('refresh_token 已落库', !!oauth?.token?.secret?.refresh_token?.secret);
    check('credentialSeq 递增', (oauth?.credentialSeq ?? 0) > 0, {
      credentialSeq: oauth?.credentialSeq
    });
    check('授予 scope = mcp:tools', oauth?.scope === 'mcp:tools', { scope: oauth?.scope });
    check('授权成功后清除降级标记', oauth?.autoDcrFallback === undefined);
    check('最终 clientSource=dcr', oauth?.clientSource === 'dcr');
  });

  await runCase('real-cimd-08-status-db', '降级授权后 status=authorized，DB 无明文 token', async () => {
    await clearRateLimits();
    const { res, status } = await statusOf(appA.appId);
    check('status -> HTTP 200', res.status === 200);
    check('state=authorized', status?.state === 'authorized', { state: status?.state });
    check('authorized=true', status?.authorized === true);
    check('hasAccessToken=true', status?.hasAccessToken === true);
    check('clientSource=dcr', status?.clientSource === 'dcr');
    check('status.scope = mcp:tools', status?.scope === 'mcp:tools');
    check(
      'status 响应无 token/secret 字段',
      !hasForbiddenKeys(status, new Set(['access_token', 'refresh_token', 'clientSecret', 'secret', 'codeVerifier']))
    );
    const { node, oauth } = await nodeOauth(appA.appId);
    check('DB token 为密文', /^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/.test(
      oauth?.token?.secret?.access_token?.secret ?? ''
    ));
    check('节点 id 一致', !!node?.nodeId);
    check('DB 中无 autoDcrFallback', oauth?.autoDcrFallback === undefined);
  });

  await runCase('real-cimd-09-get-tools', '降级后用真实 Bearer 调用 tools/list', async () => {
    await clearRateLimits();
    const before = captureAsCounters();
    const res = await getTools(appA.appId);
    const tools = apiData(res);
    check('getTools -> HTTP 200', res.status === 200, { status: res.status });
    check('返回工具数组', Array.isArray(tools), { count: tools?.length });
    check('包含 echo / whoami', tools?.some((tool) => tool.name === 'echo') &&
      tools?.some((tool) => tool.name === 'whoami'));
    check('AS /mcp 被真实命中且 2xx', readAsLog().slice(before.logLength).some(
      (entry) => isMcp(entry) && entry.status >= 200 && entry.status < 300
    ));
  });

  await runCase('real-cimd-10-run-tool', '降级后用真实 Bearer 调用 tools/call', async () => {
    await clearRateLimits();
    const res = await runTool(appA.appId);
    check('runTool -> HTTP 200', res.status === 200, { status: res.status });
    check('echo 返回 hello-e2e', apiData(res)?.content?.[0]?.text === 'hello-e2e', {
      text: apiData(res)?.content?.[0]?.text
    });
    check('runTool 响应不含 Bearer/refresh_token 明文',
      !/Bearer\s+[A-Za-z0-9._~-]{16,}/.test(res.text) &&
        !hasForbiddenKeys(res.json, new Set(['access_token', 'refresh_token'])));
  });
};

/* ------------------------------ 用例：DCR 阶段 ------------------------------ */

const runDcrPhase = async () => {
  const appA = {};
  const appB = {};

  await runCase('real-dcr-01-create', '创建 mcpToolSet（真实 AS）', async () => {
    await clearRateLimits();
    const { res, appId } = await createApp({
      name: `E2E real-dcr ${Date.now()}`,
      url: mcpUrl,
      clientMode: 'auto',
      scope: 'mcp:tools'
    });
    check('create -> HTTP 200', res.status === 200, { status: res.status });
    check('create -> appId returned', typeof appId === 'string' && /^[0-9a-f]{24}$/.test(appId));
    const { node, oauth } = await nodeOauth(appId);
    check('节点 clientMode=auto', oauth?.clientMode === 'auto');
    check('节点 scope=mcp:tools', oauth?.scope === 'mcp:tools', { scope: oauth?.scope });
    check('节点 MCP URL 指向真实 AS 资源', node?.toolConfig?.mcpToolSet?.url === mcpUrl);
    check('创建时尚未生成 client', oauth?.client === undefined);
    appA.appId = appId;
  });

  await runCase('real-dcr-02-start', 'DCR：真实 /register 恰好 1 次', async () => {
    await clearRateLimits();
    const before = captureAsCounters();
    const started = await startOAuth(appA.appId, { clientMode: 'auto', scope: 'mcp:tools' });
    appA.start = started;
    const delta = asDelta(before);
    check('start -> HTTP 200', started.res.status === 200, { status: started.res.status });
    check('clientSource=dcr', started.body?.clientSource === 'dcr', {
      clientSource: started.body?.clientSource
    });
    check('clientMode=auto', started.body?.clientMode === 'auto');
    check('issuer 来自真实 AS metadata', started.body?.issuer === CFG.asIssuer, {
      issuer: started.body?.issuer
    });
    check('resource = AS 声明的 MCP 资源', started.body?.resource === CFG.asResource);
    check('AS /register 恰好新增 1 次', delta.register === 1, { register: delta.register });
    check('Set-Cookie 下发绑定 Cookie', !!started.cookieValue);
    check('state 台账 1 条', (await pendingStates(appA.appId)) === 1);
    const { oauth } = await nodeOauth(appA.appId);
    check('节点保存真实 DCR clientId', typeof oauth?.client?.clientId === 'string' && oauth.client.clientId.length > 0);
    check('token_endpoint_auth_method=none', oauth?.client?.tokenEndpointAuthMethod === 'none', {
      method: oauth?.client?.tokenEndpointAuthMethod
    });
    check('AS 未返回 RFC 7592 registration_client_uri', oauth?.client?.registrationClientUri === undefined, {
      registrationClientUri: oauth?.client?.registrationClientUri
    });
    check('DCR client 不含 clientSecret', oauth?.client?.clientSecret === undefined);
    check('start 响应不含 clientSecret/secret',
      !hasForbiddenKeys(started.body, new Set(['clientSecret', 'secret', 'access_token', 'refresh_token'])));
    const authUrl = new URL(started.body?.authorizationUrl ?? 'http://invalid/');
    check('授权 URL 使用 response_type=code + PKCE S256',
      authUrl.searchParams.get('response_type') === 'code' &&
        authUrl.searchParams.get('code_challenge_method') === 'S256' &&
        !!authUrl.searchParams.get('code_challenge')
    );
    check('授权 URL 携带真实 resource', authUrl.searchParams.get('resource') === CFG.asResource);
    check('授权 URL 的 redirect_uri 由 FE_DOMAIN 派生',
      authUrl.searchParams.get('redirect_uri') === redirectUri(), {
        redirectUriMatches: authUrl.searchParams.get('redirect_uri') === redirectUri()
      });
    note(`AS 分配 clientId=${sha256_12(oauth?.client?.clientId ?? '')}（指纹）`);
  });

  await runCase('real-dcr-03-authorize-callback', '真实 /authorize → /consent → /confirm → callback', async () => {
    await clearRateLimits();
    const before = captureAsCounters();
    const flow = await performAuthorization(appA.start.body.authorizationUrl);
    appA.flow = flow;
    check('AS /authorize -> 302 /consent', flow.authorize.status === 302 && /\/consent/.test(
      flow.authorize.location ?? ''
    ), { status: flow.authorize.status });
    check('AS /consent 返回 HTML 同意页', flow.consent?.status === 200 && /<form/i.test(flow.consent.text));
    check('AS /confirm -> 302 回调地址', flow.confirm?.status === 302);
    check('回调携带 code/state/iss', !!flow.code && !!flow.state && !!flow.iss);
    check('iss 等于真实 AS issuer', flow.iss === CFG.asIssuer, { issMatches: flow.iss === CFG.asIssuer });
    check('AS /confirm 被真实命中', asDelta(before).confirm === 1);

    const outcome = await doCallback({
      state: flow.state,
      code: flow.code,
      iss: flow.iss,
      cookie: `${appA.start.cookieName}=${appA.start.cookieValue}`
    });
    appA.outcome = outcome;
    const delta = asDelta(before);
    check('callback -> HTTP 302', outcome.redirected, { status: outcome.status });
    check('callback 跳转 oauth=success', outcome.oauth === 'success', {
      oauth: outcome.oauth,
      appIdMatches: outcome.appId === appA.appId,
      code: outcome.code
    });
    check('AS /token(authorization_code) 恰好 1 次', delta.tokenAuthorizationCode === 1, {
      token: delta.tokenAuthorizationCode
    });
    check('state 一次性消费', (await consumedStates(appA.appId)) === 1);
    const { oauth } = await nodeOauth(appA.appId);
    check('token 加密落库（iv:hex:hex）', /^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/.test(
      oauth?.token?.secret?.access_token?.secret ?? ''
    ));
    check('refresh_token 已落库', !!oauth?.token?.secret?.refresh_token?.secret);
    check('credentialSeq 递增', (oauth?.credentialSeq ?? 0) > 0, {
      credentialSeq: oauth?.credentialSeq
    });
    check('token 有效期来自真实 AS（> now）', typeof oauth?.token?.expiresAt === 'number' && oauth.token.expiresAt > Date.now(), {
      expiresInSec: typeof oauth?.token?.expiresAt === 'number'
        ? Math.round((oauth.token.expiresAt - Date.now()) / 1000)
        : null
    });
    check('授予 scope = mcp:tools', oauth?.scope === 'mcp:tools', { scope: oauth?.scope });
  });

  await runCase('real-dcr-04-status', 'status=authorized，响应无 token 泄漏', async () => {
    await clearRateLimits();
    const { res, status } = await statusOf(appA.appId);
    check('status -> HTTP 200', res.status === 200);
    check('state=authorized', status?.state === 'authorized', { state: status?.state });
    check('authorized=true', status?.authorized === true);
    check('hasAccessToken=true', status?.hasAccessToken === true);
    check('hasRefreshToken=true', status?.hasRefreshToken === true);
    check('clientSource=dcr', status?.clientSource === 'dcr');
    check(
      '响应无 access_token/refresh_token/clientSecret/secret 字段',
      !hasForbiddenKeys(status, new Set(['access_token', 'refresh_token', 'clientSecret', 'secret', 'codeVerifier']))
    );
    check('响应不含 Bearer 明文', !/Bearer\s+[A-Za-z0-9._~-]{16,}/.test(res.text));
    check('status.issuer 来自真实 AS', status?.issuer === CFG.asIssuer, { issuer: status?.issuer });
    check('status.resource = MCP 资源', status?.resource === CFG.asResource);
    check('status.scope = mcp:tools', status?.scope === 'mcp:tools', { scope: status?.scope });
    check('canStart/canDisconnect/canResetClient 均为 true',
      status?.canStart === true && status?.canDisconnect === true && status?.canResetClient === true);
    check('authorizedAt 已记录', typeof status?.authorizedAt === 'number' && status.authorizedAt > 0);
    check('hasClientSecret=false（public client）', status?.hasClientSecret === false, {
      hasClientSecret: status?.hasClientSecret
    });
  });

  await runCase('real-dcr-05-get-tools', 'getTools 通过真实 Bearer 调用 tools/list', async () => {
    await clearRateLimits();
    const before = captureAsCounters();
    const res = await getTools(appA.appId);
    const tools = apiData(res);
    check('getTools -> HTTP 200', res.status === 200, { status: res.status });
    check('返回工具数组', Array.isArray(tools), { count: tools?.length });
    check('包含真实 AS 的 echo 工具', tools?.some((tool) => tool.name === 'echo'));
    check('包含真实 AS 的 whoami 工具', tools?.some((tool) => tool.name === 'whoami'));
    check('工具数量 = 2（whoami/echo）', tools?.length === 2, { count: tools?.length });
    check('工具带 description', tools?.every((tool) => typeof tool.description === 'string' && tool.description.length > 0));
    check('echo 工具 inputSchema 含 text', tools?.find((tool) => tool.name === 'echo')?.inputSchema?.properties?.text?.type === 'string');
    check('AS /mcp 被真实命中且 2xx', readAsLog().slice(before.logLength).some(
      (entry) => isMcp(entry) && entry.status >= 200 && entry.status < 300
    ));
  });

  await runCase('real-dcr-06-run-tool', 'runTool 通过真实 Bearer 调用 tools/call', async () => {
    await clearRateLimits();
    const res = await runTool(appA.appId);
    check('runTool -> HTTP 200', res.status === 200, { status: res.status });
    check('echo 返回 hello-e2e', apiData(res)?.content?.[0]?.text === 'hello-e2e', {
      text: apiData(res)?.content?.[0]?.text
    });
    check('runTool 响应不含 Bearer/refresh_token 明文',
      !/Bearer\s+[A-Za-z0-9._~-]{16,}/.test(res.text) &&
        !hasForbiddenKeys(res.json, new Set(['access_token', 'refresh_token'])));
    const whoami = await runTool(appA.appId, 'whoami', {});
    check('第二个真实工具 whoami 可调用', whoami.status === 200, { status: whoami.status });
  });

  await runCase('real-dcr-07-proactive-refresh', 'token 进入刷新窗口 → 真实 /token refresh 并轮换', async () => {
    await clearRateLimits();
    const { node, oauth } = await nodeOauth(appA.appId);
    const atBefore = tokenFingerprint(oauth?.token?.secret?.access_token);
    const rtBefore = tokenFingerprint(oauth?.token?.secret?.refresh_token);
    const seqBefore = oauth?.credentialSeq ?? 0;
    const expiresBefore = oauth?.token?.expiresAt ?? 0;
    check('已取得 access/refresh 指纹', !!atBefore && !!rtBefore);
    check('expiresAt 被压到刷新窗口', await forceTokenExpiring(appA.appId, node.nodeId));
    const before = captureAsCounters();
    const res = await runTool(appA.appId);
    const delta = asDelta(before);
    check('runTool -> HTTP 200', res.status === 200, { status: res.status });
    check('AS /token refresh 恰好 1 次', delta.tokenRefresh === 1, { refresh: delta.tokenRefresh });
    check('未重复交换 code', delta.tokenAuthorizationCode === 0);
    const after = await nodeOauth(appA.appId);
    const atAfter = tokenFingerprint(after.oauth?.token?.secret?.access_token);
    const rtAfter = tokenFingerprint(after.oauth?.token?.secret?.refresh_token);
    check('access token 已更换', !!atAfter && atAfter !== atBefore);
    check('refresh token 已轮换', !!rtAfter && rtAfter !== rtBefore);
    check('credentialSeq 递增', (after.oauth?.credentialSeq ?? 0) > seqBefore, {
      before: seqBefore,
      after: after.oauth?.credentialSeq
    });
    check('expiresAt 已前移', (after.oauth?.token?.expiresAt ?? 0) > expiresBefore);
    check('结果正确', apiData(res)?.content?.[0]?.text === 'hello-e2e');
  });

  await runCase('real-dcr-08-401-single-refresh', '真实 401 → 强制刷新一次 → 重试成功', async () => {
    await clearRateLimits();
    const { oauth } = await nodeOauth(appA.appId);
    const accessToken = decryptStoredSecret(oauth?.token?.secret?.access_token);
    const revokedAt = tokenFingerprint(oauth?.token?.secret?.access_token);
    check('可在内存中取得当前 access token', !!accessToken);
    const revoke = await asRequest('/revoke', {
      method: 'POST',
      form: new URLSearchParams({
        token: accessToken,
        client_id: oauth?.client?.clientId ?? '',
        token_type_hint: 'access_token'
      })
    });
    check('真实 /revoke -> 2xx', revoke.status >= 200 && revoke.status < 300, {
      status: revoke.status
    });
    const before = captureAsCounters();
    const res = await runTool(appA.appId);
    const delta = asDelta(before);
    const mcpEntries = readAsLog().slice(before.logLength).filter(isMcp);
    check('runTool -> HTTP 200（刷新后重试）', res.status === 200, { status: res.status });
    check('AS 返回 401 至少一次', mcpEntries.some((entry) => entry.status === 401), {
      unauthorizedResponses: mcpEntries.filter((entry) => entry.status === 401).length
    });
    check('刷新恰好 1 次', delta.tokenRefresh === 1, { refresh: delta.tokenRefresh });
    check('重试后出现 2xx', mcpEntries.some((entry) => entry.status >= 200 && entry.status < 300));
    const refreshed = await nodeOauth(appA.appId);
    check('重试使用新的 access token', tokenFingerprint(refreshed.oauth?.token?.secret?.access_token) !== revokedAt);
    check('refresh_token 同步轮换', tokenFingerprint(refreshed.oauth?.token?.secret?.refresh_token) !== null);
    check('工具结果正确', apiData(res)?.content?.[0]?.text === 'hello-e2e');
  });

  await runCase('real-dcr-09-disconnect', 'disconnect：真实 /revoke + 清 token', async () => {
    await clearRateLimits();
    const before = captureAsCounters();
    const res = await api('/api/core/app/mcpTools/oauth/disconnect', {
      method: 'POST',
      token: sessionToken,
      body: { appId: appA.appId, confirm: true }
    });
    const delta = asDelta(before);
    check('disconnect -> HTTP 200', res.status === 200, { status: res.status });
    check('disconnected=true', res.json?.disconnected === true);
    check('revoked=true', res.json?.revoked === true);
    // access_token 与 refresh_token 各撤销一次（RFC 7009 不保证级联）。
    check('AS /revoke 被真实命中 2 次（AT+RT）', delta.revoke === 2, { revoke: delta.revoke });
    const { oauth } = await nodeOauth(appA.appId);
    check('节点 token 已清除', oauth?.token === undefined);
    const { status } = await statusOf(appA.appId);
    check('status=reauth_required', status?.state === 'reauth_required', { state: status?.state });
    check('断开后 canStart=true / canDisconnect=false',
      status?.canStart === true && status?.canDisconnect === false, {
        canStart: status?.canStart,
        canDisconnect: status?.canDisconnect
      });
    const mcpBefore = asCount(isMcp);
    const denied = await runTool(appA.appId);
    check('断开后运行期立即失败', denied.status >= 400, { status: denied.status });
    check('断开后无新的 MCP 调用', asCount(isMcp) === mcpBefore);
  });

  await runCase('real-dcr-10-client-reset', 'client/reset：清空本地 client；AS 不支持 RFC 7592 时如实记录', async () => {
    await clearRateLimits();
    const before = captureAsCounters();
    const res = await api('/api/core/app/mcpTools/oauth/client/reset', {
      method: 'POST',
      token: sessionToken,
      body: { appId: appA.appId, confirm: true }
    });
    const delta = asDelta(before);
    check('reset -> HTTP 200', res.status === 200, { status: res.status });
    check('reset reset=true', res.json?.reset === true);
    check('上游未提供 registration_client_uri → deregistered=false', res.json?.deregistered === false, {
      deregistered: res.json?.deregistered
    });
    check('未向 AS 发送 DELETE（无 RFC 7592 端点）', delta.register === 0 && delta.revoke === 0);
    const cleared = await nodeOauth(appA.appId);
    check('client 清除', cleared.oauth?.client === undefined);
    check('server 清除', cleared.oauth?.server === undefined);
    check('token 清除', cleared.oauth?.token === undefined);
    const { status } = await statusOf(appA.appId);
    check('status=client_missing', status?.state === 'client_missing', { state: status?.state });
    check('reset 后 canStart=true / canResetClient=false',
      status?.canStart === true && status?.canResetClient === false, {
        canStart: status?.canStart,
        canResetClient: status?.canResetClient
      });
    note('上游 AS 的 /register 响应不含 registration_client_uri，RFC 7592 不可用；reset 仅清理本地状态。');
  });

  await runCase('real-dcr-11-reregister', 'reset 后再次 start → 重新 DCR（/register 恰好 1 次）', async () => {
    await clearRateLimits();
    const before = captureAsCounters();
    const started = await startOAuth(appA.appId, { clientMode: 'auto', scope: 'mcp:tools' });
    appA.start2 = started;
    const delta = asDelta(before);
    check('start -> HTTP 200', started.res.status === 200, { status: started.res.status });
    check('clientSource=dcr', started.body?.clientSource === 'dcr');
    check('AS /register 新增 1 次', delta.register === 1, { register: delta.register });
    const { oauth } = await nodeOauth(appA.appId);
    check('生成新的 clientId', !!oauth?.client?.clientId);
    appA.clientId2 = oauth?.client?.clientId;
  });

  await runCase('real-dcr-12-negative-state-cookie-issuer', 'state 重放 / Cookie 绑定 / iss 不一致均被拒绝', async () => {
    await clearRateLimits();
    const flow = await performAuthorization(appA.start2.body.authorizationUrl);
    const cookie = `${appA.start2.cookieName}=${appA.start2.cookieValue}`;
    const first = await doCallback({ state: flow.state, code: flow.code, iss: flow.iss, cookie });
    check('首次回调成功', first.oauth === 'success', { oauth: first.oauth, code: first.code });
    const replay = await doCallback({ state: flow.state, code: flow.code, iss: flow.iss, cookie });
    check('重放回调被拒绝', replay.redirected && replay.oauth === 'error');
    check('错误码=state_replayed', replay.code === 'mcp_oauth_state_replayed', { code: replay.code });
    check('重放未改写已授权 token', !!(await nodeOauth(appA.appId)).oauth?.token);

    await clearRateLimits();
    const missingStart = await startOAuth(appA.appId, { clientMode: 'auto' });
    const missingFlow = await performAuthorization(missingStart.body.authorizationUrl);
    const missing = await doCallback({ state: missingFlow.state, code: missingFlow.code });
    check('缺少 Cookie → 302 error', missing.redirected && missing.oauth === 'error');
    check('错误码=state_cookie_missing', missing.code === 'mcp_oauth_state_cookie_missing', {
      code: missing.code
    });

    await clearRateLimits();
    const mismatchStart = await startOAuth(appA.appId, { clientMode: 'auto' });
    const mismatchFlow = await performAuthorization(mismatchStart.body.authorizationUrl);
    const mismatch = await doCallback({
      state: mismatchFlow.state,
      code: mismatchFlow.code,
      cookie: `${mismatchStart.cookieName}=not-the-issued-value`
    });
    check('Cookie 不匹配 → 302 error', mismatch.redirected && mismatch.oauth === 'error');
    check('错误码=state_binding_mismatch', mismatch.code === 'mcp_oauth_state_binding_mismatch', {
      code: mismatch.code
    });

    await clearRateLimits();
    const issuerStart = await startOAuth(appA.appId, { clientMode: 'auto' });
    const issuerFlow = await performAuthorization(issuerStart.body.authorizationUrl);
    const issuer = await doCallback({
      state: issuerFlow.state,
      code: issuerFlow.code,
      iss: 'https://evil.example',
      cookie: `${issuerStart.cookieName}=${issuerStart.cookieValue}`
    });
    check('iss 不一致 → 302 error', issuer.redirected && issuer.oauth === 'error');
    check('错误码=issuer_mismatch', issuer.code === 'mcp_oauth_issuer_mismatch', {
      code: issuer.code
    });
  });

  await runCase('real-dcr-13-negative-scope', '真实 AS 拒绝 scope=other → callback error，不落 token', async () => {
    await clearRateLimits();
    const { appId } = await createApp({
      name: `E2E real-scope ${Date.now()}`,
      url: mcpUrl,
      clientMode: 'auto'
    });
    const start = await startOAuth(appId, { clientMode: 'auto', scope: 'other' });
    check('start 仍返回授权 URL（start 不预判 AS scope）', start.res.status === 200 && !!start.body?.authorizationUrl, {
      status: start.res.status
    });
    const flow = await performAuthorization(start.body.authorizationUrl);
    check('AS 以 error=invalid_scope 重定向', flow.error === 'invalid_scope', {
      error: flow.error,
      description: flow.errorDescription
    });
    const outcome = await doCallback({
      state: flow.state,
      code: flow.code,
      iss: flow.iss,
      error: flow.error,
      errorDescription: flow.errorDescription,
      cookie: `${start.cookieName}=${start.cookieValue}`
    });
    check('callback 返回 oauth=error', outcome.redirected && outcome.oauth === 'error', {
      oauth: outcome.oauth,
      code: outcome.code
    });
    check('token 未写入', (await nodeOauth(appId)).oauth?.token === undefined);
    const scopeStatus = await statusOf(appId);
    check('scope 被拒后 status 不是 authorized', scopeStatus.status?.state !== 'authorized', {
      state: scopeStatus.status?.state
    });
    note(`callback 错误码=${outcome.code ?? '(none)'}`);
  });

  await runCase('real-dcr-14-ssrf', 'SSRF：loopback MCP URL 仍被拒绝', async () => {
    await clearRateLimits();
    const loopback = await createApp({
      name: `E2E real-ssrf ${Date.now()}`,
      url: 'http://127.0.0.1:18200/mcp',
      clientMode: 'auto'
    });
    check('loopback MCP URL 在 create 即被拒绝', loopback.res.status >= 400, {
      status: loopback.res.status,
      reason: /private network|内网/i.test(loopback.res.text) ? 'private_url' : 'other'
    });
    check('create 未返回 appId', !loopback.appId);
    note('172.17.0.0/16 的放行由既有 CHECK_INTERNAL_IP=false（默认）控制，不是新增测试开关；loopback 始终拒绝。');
  });

  await runCase('real-dcr-15-normalize', 'start 传 clientMode=cimd/dcr 均归一为 auto 且复用 client', async () => {
    await clearRateLimits();
    const before = captureAsCounters();
    const startCimd = await startOAuth(appA.appId, { clientMode: 'cimd', scope: 'mcp:tools' });
    const deltaCimd = asDelta(before);
    check('clientMode=cimd → 响应 auto', startCimd.body?.clientMode === 'auto');
    check('clientMode=cimd → clientSource=dcr（FE_DOMAIN 非 https）', startCimd.body?.clientSource === 'dcr', {
      clientSource: startCimd.body?.clientSource
    });
    check('复用已保存 client，无新 /register', deltaCimd.register === 0, { register: deltaCimd.register });

    const before2 = captureAsCounters();
    const startDcr = await startOAuth(appA.appId, { clientMode: 'dcr', scope: 'mcp:tools' });
    const deltaDcr = asDelta(before2);
    check('clientMode=dcr → 响应 auto', startDcr.body?.clientMode === 'auto');
    check('clientMode=dcr → clientSource=dcr', startDcr.body?.clientSource === 'dcr');
    check('再次复用，无新 /register', deltaDcr.register === 0, { register: deltaDcr.register });
  });
};

/* ------------------------------ 主流程 ------------------------------ */

const main = async () => {
  console.log(`[real-e2e] phase: ${CFG.phase}`);
  console.log(`[real-e2e] FastGPT: ${CFG.appBase}  FE_DOMAIN=${CFG.feDomain}`);
  console.log(`[real-e2e] real AS: ${CFG.asBase}`);
  console.log(`[real-e2e] AS boundary log: ${CFG.asLogPath}`);
  console.log(`[real-e2e] mongo: ${CFG.mongoUri.replace(/\/\/[^@/]+@/, '//<redacted>@')}`);

  let seeded;
  let asHealth;
  try {
    await ensureAppReady();
    asHealth = await ensureAsReady();
    seeded = await seedAuth();
    await clearRateLimits();
    console.log(
      `[real-e2e] seeded session team=${seeded.teamId.slice(-6)} tmb=${seeded.tmbId.slice(-6)}`
    );

    if (CFG.phase === 'cimd') await runCimdPhase();
    else await runDcrPhase();
  } finally {
    const summary = {
      schemaVersion: 1,
      design: 'mcp-oauth-v2.4',
      mode: 'real-as',
      phase: CFG.phase,
      startedAt: cases[0]?.startedAt ?? nowIso(),
      finishedAt: nowIso(),
      topology: {
        fastgpt: CFG.appBase,
        feDomain: CFG.feDomain,
        authorizationServer: CFG.asBase,
        issuer: CFG.asIssuer,
        resource: CFG.asResource,
        asHealth
      },
      seeded: seeded
        ? { teamIdSuffix: seeded.teamId.slice(-6), tmbIdSuffix: seeded.tmbId.slice(-6) }
        : null,
      cases,
      summary: {
        cases: cases.length,
        assertions: cases.reduce((sum, item) => sum + item.checks.length, 0),
        passed: cases.reduce((sum, item) => sum + item.checks.filter((c) => c.ok).length, 0),
        failed: cases.reduce((sum, item) => sum + item.checks.filter((c) => !c.ok).length, 0)
      }
    };
    fs.mkdirSync(path.dirname(CFG.evidencePath), { recursive: true });
    fs.writeFileSync(CFG.evidencePath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

    console.log('\n================ SUMMARY ================');
    console.log(
      `phase=${CFG.phase} cases=${summary.summary.cases} assertions=${summary.summary.assertions} ` +
        `passed=${summary.summary.passed} failed=${summary.summary.failed}`
    );
    if (summary.summary.failed > 0) {
      console.log('failing assertions:');
      for (const item of cases) {
        for (const assertion of item.checks.filter((c) => !c.ok)) {
          console.log(` - ${item.id}: ${assertion.label} :: ${JSON.stringify(assertion.detail)}`);
        }
      }
    }
    console.log(`evidence: ${CFG.evidencePath}`);

    redis?.close();
    await mongoose?.disconnect().catch(() => {});
  }

  process.exitCode = fs.existsSync(CFG.evidencePath)
    ? (JSON.parse(fs.readFileSync(CFG.evidencePath, 'utf8')).summary.failed ?? 0) > 0
      ? 1
      : 0
    : 1;
};

main().catch((error) => {
  console.error('[real-e2e] fatal:', error);
  process.exitCode = 1;
});
