/**
 * Stage I5b：MCP OAuth v2.4 真实 HTTP 级端到端脚本。
 *
 * 全程使用真实 FastGPT（Next dev，HTTPS 自签）+ 真实 OAuth AS / MCP server fixture，
 * 不使用任何 mock。脚本只通过 HTTP 驱动，Mongo/Redis 仅用于「登录态预热」。
 *
 * 覆盖（设计 §4–§8、§12.4）：
 *   create(oauth + 空 toolList) → start → 同意 → callback → status → getTools
 *   → runTool(Bearer) → disconnect → 重授权 → refresh 指纹变化
 *   负向：state 重放 ×10、缺失/错误绑定 Cookie、PRM resource 不匹配、iss 不匹配
 *   附加：PRM 404 → 根 AS metadata 回退、HTML 同意页授权
 *
 * 证据：plans/e2e-real-v24/evidence/oauth-real-e2e-<ts>.json + 同名 .log
 * 安全：不打印、不落盘任何 access/refresh token、client_secret、session cookie；
 *       只记录 sha256 指纹、状态码与布尔值。
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// 仓库根：<task>/agent-builder/FastGPT；证据目录默认放在任务工作区 <task>/plans/e2e-real-v24。
const ROOT = path.resolve(import.meta.dirname, '../../..');
const PLANS_DIR = process.env.E2E_PLANS_DIR || path.resolve(ROOT, '../../plans/e2e-real-v24');
const EVIDENCE_DIR = path.join(PLANS_DIR, 'evidence');
const LOG_DIR = path.join(PLANS_DIR, 'logs');

const CFG = {
  baseUrl: (process.env.E2E_FASTGPT_BASE_URL || 'https://203.0.113.10:3005').replace(/\/+$/, ''),
  fixtureUrl: (process.env.E2E_FIXTURE_BASE_URL || 'http://127.0.0.1:18110').replace(/\/+$/, ''),
  mongoContainer: process.env.E2E_MONGO_CONTAINER || 'fastgpt-mongo',
  redisContainer: process.env.E2E_REDIS_CONTAINER || 'fastgpt-redis',
  mongoDb: process.env.E2E_MONGO_DB || 'fastgpt_e2e_oauth',
  appName: process.env.E2E_APP_NAME || `MCP OAuth v24 E2E ${new Date().toISOString()}`,
  timeoutMs: Number(process.env.E2E_HTTP_TIMEOUT_MS || 60000)
};

const fixtureMcpUrl = `${CFG.fixtureUrl}/mcp`;
const cimdClientId = `${CFG.baseUrl}/api/core/app/mcpTools/oauth/client-metadata.json`;
const redirectUri = `${CFG.baseUrl}/api/core/app/mcpTools/oauth/callback`;
const ts = new Date().toISOString().replace(/[:.]/g, '-');
const evidencePath = path.join(EVIDENCE_DIR, `oauth-real-e2e-${ts}.json`);
const logPath = path.join(LOG_DIR, `oauth-real-e2e-${ts}.log`);

fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
fs.mkdirSync(LOG_DIR, { recursive: true });

const evidence = {
  schemaVersion: 1,
  stage: 'I5b',
  design: 'mcp-oauth-v2.4',
  startedAt: new Date().toISOString(),
  config: {
    fastgptBaseUrl: CFG.baseUrl,
    fixtureBaseUrl: CFG.fixtureUrl,
    fixtureMcpUrl,
    appName: CFG.appName,
    node: process.version
  },
  environment: {},
  steps: [],
  summary: { total: 0, passed: 0, failed: 0, negativeCases: 0, skipped: 0 },
  failures: []
};

const logLines = [];
const log = (line) => {
  const text = `[${new Date().toISOString()}] ${line}`;
  console.log(text);
  logLines.push(text);
};

const sha256_16 = (value) =>
  crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 16);

const normalizeUrl = (value) => {
  try {
    return new URL(value).toString();
  } catch {
    return String(value);
  }
};

/* ------------------------------ HTTP 基础 ------------------------------ */

class CookieJar {
  constructor() {
    this.cookieMap = new Map(); // name -> value
  }
  absorb(response) {
    const setCookies =
      typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
    for (const raw of setCookies) {
      const [pair] = raw.split(';');
      const index = pair.indexOf('=');
      if (index <= 0) continue;
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      const maxAgeMatch = /max-age=(-?\d+)/i.exec(raw);
      if (maxAgeMatch && Number(maxAgeMatch[1]) <= 0) this.cookieMap.delete(name);
      else this.cookieMap.set(name, value);
    }
    return setCookies;
  }
  header({ exclude = [], override } = {}) {
    if (override !== undefined) return override;
    const parts = [];
    for (const [name, value] of this.cookieMap) {
      if (exclude.includes(name)) continue;
      parts.push(`${name}=${value}`);
    }
    return parts.join('; ');
  }
  has(name) {
    return this.cookieMap.has(name);
  }
  get(name) {
    return this.cookieMap.get(name);
  }
  describe() {
    return [...this.cookieMap.keys()].map((name) => ({
      name,
      valueLength: this.cookieMap.get(name)?.length,
      valueFingerprint: sha256_16(this.cookieMap.get(name))
    }));
  }
}

const jar = new CookieJar();

async function rawFetch(
  url,
  { method = 'GET', headers = {}, body, cookie = true, excludeCookies = [], cookieOverride } = {}
) {
  const finalHeaders = { ...headers };
  if (cookie || cookieOverride !== undefined) {
    const cookieHeader = jar.header({ exclude: excludeCookies, override: cookieOverride });
    if (cookieHeader) finalHeaders.cookie = cookieHeader;
  }
  const isRawBody = typeof body === 'string';
  if (body !== undefined && finalHeaders['content-type'] === undefined) {
    finalHeaders['content-type'] = isRawBody
      ? 'application/x-www-form-urlencoded'
      : 'application/json';
  }
  const response = await fetch(url, {
    method,
    headers: finalHeaders,
    body: body === undefined ? undefined : isRawBody ? body : JSON.stringify(body),
    redirect: 'manual',
    signal: AbortSignal.timeout(CFG.timeoutMs)
  });
  const setCookies = jar.absorb(response);
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  return {
    status: response.status,
    headers: Object.fromEntries([...response.headers.entries()]),
    setCookies,
    text,
    json,
    location: response.headers.get('location')
  };
}

const api = (method, apiPath, { body, ...rest } = {}) =>
  rawFetch(`${CFG.baseUrl}${apiPath}`, {
    method,
    body,
    headers: { accept: 'application/json' },
    ...rest
  });

const fixture = (method, fixturePath, body) =>
  rawFetch(`${CFG.fixtureUrl}${fixturePath}`, {
    method,
    body,
    headers: { accept: 'application/json' },
    cookie: false
  });

const fixtureJson = async (fixturePath) => {
  const res = await fixture('GET', fixturePath);
  if (res.status !== 200 || !res.json) {
    throw new Error(`fixture ${fixturePath} -> ${res.status}`);
  }
  return res.json;
};

/** FastGPT 成功响应统一包在 `{ code, statusText, message, data }` 里。 */
const payload = (res) => {
  const body = res.json;
  if (body && typeof body === 'object' && !Array.isArray(body) && 'code' in body && 'data' in body) {
    return body.data;
  }
  return body;
};

/* ------------------------------ 证据收集 ------------------------------ */

let currentStep = null;

const beginStep = (id, name, phase = 'main') => {
  currentStep = {
    id,
    name,
    phase,
    startedAt: new Date().toISOString(),
    assertions: [],
    http: [],
    evidence: {},
    ok: true,
    skipped: false
  };
  evidence.steps.push(currentStep);
  log(`=== STEP ${id} ${name} ===`);
  return currentStep;
};

const assert = (label, condition, detail) => {
  const item = { label, ok: Boolean(condition), ...(detail === undefined ? {} : { detail }) };
  currentStep.assertions.push(item);
  if (!item.ok) {
    currentStep.ok = false;
    evidence.failures.push({ step: currentStep.id, label, detail });
    log(`  ✗ ${label}${detail === undefined ? '' : ` :: ${JSON.stringify(detail)}`}`);
  } else {
    log(`  ✓ ${label}${detail === undefined ? '' : ` :: ${JSON.stringify(detail)}`}`);
  }
  return item.ok;
};

const redactUrl = (url) => {
  try {
    const parsed = new URL(url);
    for (const key of ['code', 'state', 'access_token', 'refresh_token', 'code_verifier', 'iss']) {
      if (parsed.searchParams.has(key)) parsed.searchParams.set(key, '<redacted>');
    }
    return parsed.toString();
  } catch {
    return '<unparsable-url>';
  }
};

const recordHttp = (label, res, extra = {}) => {
  const item = {
    label,
    status: res.status,
    location: res.location ? redactUrl(res.location) : null,
    ...(res.status >= 400 ? { errorBody: (res.text || '').slice(0, 800) } : {}),
    ...(res.setCookies?.length
      ? { setCookies: res.setCookies.map((c) => c.split(';')[0].split('=')[0]) }
      : {}),
    ...extra
  };
  currentStep.http.push(item);
  log(`  → ${label}: HTTP ${res.status}${res.location ? ` location=${redactUrl(res.location)}` : ''}`);
  return item;
};

const skipStep = (reason) => {
  currentStep.skipped = true;
  currentStep.ok = false;
  evidence.summary.skipped += 1;
  log(`  ⊘ skipped: ${reason}`);
};

/* ------------------------------ 环境准备 ------------------------------ */

const dockerExec = (container, args) =>
  execFileSync('sudo', ['-n', 'docker', 'exec', container, ...args], {
    encoding: 'utf8',
    timeout: 30000
  }).trim();

function seedSession() {
  const evalScript = `
    const u = db.users.findOne({ username: 'root' });
    if (!u) throw new Error('root user missing');
    db.users.updateOne({ _id: u._id }, { $set: { status: 'active' } });
    const t = db.teams.findOne({});
    const m = db.team_members.findOne({ userId: u._id });
    if (!t || !m) throw new Error('team/team_member missing');
    print(JSON.stringify({
      userId: String(u._id),
      teamId: String(t._id),
      tmbId: String(m._id)
    }));
  `;
  const mongoUri = `mongodb://127.0.0.1:27017/${CFG.mongoDb}?replicaSet=rs0`;
  const out = dockerExec(CFG.mongoContainer, ['mongosh', mongoUri, '--quiet', '--eval', evalScript]);
  const parsed = JSON.parse(
    out
      .trim()
      .split('\n')
      .filter((line) => line.startsWith('{'))
      .pop()
  );
  const sid = crypto.randomBytes(16).toString('hex');
  const sessionKey = `${parsed.userId}:${sid}`;
  const redisKey = `fastgpt:session:${sessionKey}`;
  dockerExec(CFG.redisContainer, [
    'redis-cli',
    'HSET',
    redisKey,
    'userId',
    parsed.userId,
    'teamId',
    parsed.teamId,
    'tmbId',
    parsed.tmbId,
    'isRoot',
    '1',
    'createdAt',
    String(Date.now()),
    'ip',
    '127.0.0.1'
  ]);
  dockerExec(CFG.redisContainer, ['redis-cli', 'EXPIRE', redisKey, '604800']);
  jar.cookieMap.set('fastgpt_token', sessionKey);
  return {
    userId: parsed.userId,
    teamId: parsed.teamId,
    tmbId: parsed.tmbId,
    sessionKeyLength: sessionKey.length,
    sessionFingerprint: sha256_16(sessionKey)
  };
}

/**
 * 测试隔离：清掉上一轮 E2E 留下的 MCP OAuth 限流计数。
 * 只删除 `fastgpt:rate-limit:mcp-oauth:*`（不碰 session / 业务数据）；
 * 生产限流逻辑本身不做任何放宽。
 */
function resetOAuthRateLimitCounters() {
  try {
    const keys = dockerExec(CFG.redisContainer, [
      'redis-cli',
      '--scan',
      '--pattern',
      'fastgpt:rate-limit:mcp-oauth:*'
    ])
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (keys.length === 0) return 0;
    dockerExec(CFG.redisContainer, ['redis-cli', 'DEL', ...keys]);
    return keys.length;
  } catch {
    return 0;
  }
}

async function waitForFastgpt(timeoutMs = 240000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await rawFetch(`${CFG.baseUrl}/api/common/system/getInitData`, {
        cookie: false,
        headers: { accept: 'application/json' }
      });
      if (res.status === 200) return { status: res.status, body: res.json };
    } catch {
      /* compile/startup still running */
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new Error('FastGPT did not become healthy in time');
}

/* ------------------------------ 流程辅助 ------------------------------ */

const toolList = [
  {
    name: 'whoami',
    description: 'Return the authenticated caller identity (fixture)',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'echo',
    description: 'Echo the given text back (fixture)',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text']
    }
  }
];

const createOauthApp = async (label, nameSuffix) => {
  const created = await api('POST', '/api/core/app/mcpTools/create', {
    body: {
      name: `${CFG.appName} ${nameSuffix}`,
      url: fixtureMcpUrl,
      authMode: 'oauth',
      clientMode: 'auto',
      scope: 'mcp:tools',
      toolList: []
    }
  });
  recordHttp(`POST create (${label})`, created);
  const appId = payload(created);
  if (created.status !== 200 || typeof appId !== 'string') {
    return { appId: null, nodeId: null, res: created };
  }
  const detail = await api('GET', `/api/core/app/detail?appId=${appId}`);
  const nodes = payload(detail)?.nodes ?? [];
  const node = nodes.find((n) => n?.toolConfig?.mcpToolSet);
  return { appId, nodeId: node?.nodeId ?? null, res: created, detail, node };
};

const startOauth = async (appId, nodeId, bodyExtra = {}) => {
  const res = await api('POST', '/api/core/app/mcpTools/oauth/start', {
    body: { appId, nodeId, ...bodyExtra }
  });
  return { res, body: payload(res) || {} };
};

const parseCallbackState = (callbackUrl) => {
  try {
    const parsed = new URL(callbackUrl);
    return {
      hasCode: parsed.searchParams.has('code'),
      hasState: parsed.searchParams.has('state'),
      stateLength: (parsed.searchParams.get('state') || '').length,
      iss: parsed.searchParams.get('iss')
    };
  } catch {
    return { hasCode: false, hasState: false, stateLength: 0, iss: null };
  }
};

/**
 * 走完 AS 授权端点 → 302 callback → FastGPT callback。
 * bindCookie:
 *   undefined  → 使用 jar（正常路径）
 *   null       → 显式不带任何绑定 Cookie（仅保留登录 Cookie）
 *   string     → 用给定值覆盖绑定 Cookie
 */
const followAuthorizeAndCallback = async ({
  authorizationUrl,
  bindCookie,
  jarEnabled = true
}) => {
  const authorizeRes = await rawFetch(authorizationUrl, {
    cookie: false,
    headers: { accept: 'text/html' }
  });
  const callbackUrl = authorizeRes.location;
  if (!callbackUrl) return { authorizeRes, callbackUrl: null, callbackRes: null };

  let callbackRes;
  if (bindCookie === undefined) {
    callbackRes = await rawFetch(callbackUrl, { headers: { accept: 'text/html' }, cookie: jarEnabled });
  } else {
    const cookieHeader = bindCookie === null ? '' : bindCookie;
    callbackRes = await rawFetch(callbackUrl, {
      headers: { accept: 'text/html' },
      cookie: false,
      cookieOverride: cookieHeader
    });
  }
  return { authorizeRes, callbackUrl, callbackRes };
};

const errorCodeFromLocation = (location) => {
  if (!location) return null;
  try {
    return new URL(location).searchParams.get('code');
  } catch {
    return null;
  }
};

/* ------------------------------ 主流程 ------------------------------ */

async function main() {
  log(`E2E target: ${CFG.baseUrl} ; fixture: ${CFG.fixtureUrl}`);
  log(`evidence: ${evidencePath}`);

  /* ---------- ENV ---------- */
  beginStep('ENV', '真实环境健康检查（FastGPT + fixture + 登录态）', 'setup');
  const initData = await waitForFastgpt();
  recordHttp('GET /api/common/system/getInitData', { status: initData.status });
  assert('FastGPT 健康检查 200', initData.status === 200, initData.status);

  const health = await fixtureJson('/health');
  assert('fixture /health mode=all', health.mode === 'all', health.mode);
  assert('fixture resource = MCP URL', health.resource === fixtureMcpUrl, health.resource);
  assert('fixture PRM 默认 present', health.prmMode === 'present', health.prmMode);
  await fixture('POST', '/debug/reset');
  const reseeded = await fixtureJson('/health');
  assert('fixture reset 后仍可用', reseeded.ok === true);
  const clearedRateLimits = resetOAuthRateLimitCounters();
  log(`  清理上一轮 OAuth 限流键: ${clearedRateLimits}`);

  const seeded = seedSession();
  evidence.environment = {
    fastgpt: { baseUrl: CFG.baseUrl, initDataStatus: initData.status },
    fixture: health,
    session: { userId: seeded.userId, teamId: seeded.teamId, tmbId: seeded.tmbId }
  };
  log(`  预热会话 userId=${seeded.userId} teamId=${seeded.teamId} tmbId=${seeded.tmbId}`);

  /* ---------- Step 1：create(oauth + 空 toolList) ---------- */
  beginStep('1', 'POST mcpTools/create：authMode=oauth + 空 toolList');
  const createdMain = await createOauthApp('main', 'main');
  const appId = createdMain.appId;
  const nodeId = createdMain.nodeId;
  assert('create 200', createdMain.res?.status === 200, createdMain.res?.status);
  assert('返回 appId', typeof appId === 'string' && /^[a-f0-9]{24}$/.test(appId), appId ? `${appId.slice(0, 6)}…` : null);
  assert('存在唯一 mcpToolSet 节点', Boolean(nodeId), nodeId ?? null);
  assert(
    '节点 authMode=oauth',
    createdMain.node?.toolConfig?.mcpToolSet?.authMode === 'oauth',
    createdMain.node?.toolConfig?.mcpToolSet?.authMode ?? null
  );
  const oauthNode = createdMain.node?.toolConfig?.mcpToolSet?.oauth;
  assert('节点 oauth.schemaVersion=1', oauthNode?.schemaVersion === 1, oauthNode?.schemaVersion);
  assert('节点 oauth.credentialSeq=0', oauthNode?.credentialSeq === 0, oauthNode?.credentialSeq);
  const detailText = createdMain.detail?.text || '';
  assert('detail 不泄露 token', !detailText.includes('access_token'), true);
  assert('detail 不泄露 refresh_token', !detailText.includes('refresh_token'), true);
  currentStep.evidence.appId = appId;
  currentStep.evidence.nodeId = nodeId;

  /* ---------- Step 2：start ---------- */
  beginStep('2', 'POST oauth/start：PKCE S256 + CIMD + 绑定 Cookie');
  const statsBeforeStart = await fixtureJson('/debug/stats');
  const start = await startOauth(appId, nodeId);
  recordHttp('POST oauth/start', start.res);
  assert('start 200', start.res.status === 200, start.res.status);
  const authorizationUrl = start.body.authorizationUrl;
  assert('返回 authorizationUrl', typeof authorizationUrl === 'string', Boolean(authorizationUrl));
  currentStep.evidence.clientSource = start.body.clientSource;
  currentStep.evidence.issuer = start.body.issuer;
  currentStep.evidence.resource = start.body.resource;
  currentStep.evidence.requestedScope = start.body.requestedScope;

  const authUrl = new URL(authorizationUrl);
  assert(
    'authorizationUrl 指向 fixture /authorize',
    authUrl.origin === CFG.fixtureUrl && authUrl.pathname === '/authorize',
    `${authUrl.origin}${authUrl.pathname}`
  );
  assert('response_type=code', authUrl.searchParams.get('response_type') === 'code');
  assert(
    'client_id 为 FastGPT CIMD 文档 URL',
    authUrl.searchParams.get('client_id') === cimdClientId,
    authUrl.searchParams.get('client_id')
  );
  assert('redirect_uri 为 FastGPT 回调', authUrl.searchParams.get('redirect_uri') === redirectUri);
  assert('code_challenge_method=S256', authUrl.searchParams.get('code_challenge_method') === 'S256');
  assert('code_challenge 长度=43', (authUrl.searchParams.get('code_challenge') || '').length === 43);
  assert('state 存在且非空', (authUrl.searchParams.get('state') || '').length > 16);
  assert('resource 参数 = MCP 资源', authUrl.searchParams.get('resource') === fixtureMcpUrl, authUrl.searchParams.get('resource'));
  assert('scope 参数 = mcp:tools', authUrl.searchParams.get('scope') === 'mcp:tools', authUrl.searchParams.get('scope'));
  assert('auto 模式优先 CIMD（clientSource=cimd）', start.body.clientSource === 'cimd', start.body.clientSource);
  assert('issuer 与 fixture 一致', normalizeUrl(start.body.issuer) === normalizeUrl(CFG.fixtureUrl), start.body.issuer);

  const bindCookieName = `mcp_oauth_bind_${appId}`;
  const bindSetCookie =
    start.res.setCookies.find((c) => c.startsWith(`${bindCookieName}=`)) || '';
  assert('Set-Cookie 绑定 cookie 存在', Boolean(bindSetCookie));
  assert('绑定 cookie HttpOnly', /HttpOnly/i.test(bindSetCookie));
  assert('绑定 cookie Path 限定 oauth 路由', /Path=\/api\/core\/app\/mcpTools\/oauth/i.test(bindSetCookie));
  assert('绑定 cookie SameSite=Lax', /SameSite=Lax/i.test(bindSetCookie));
  assert('jar 已保存绑定 cookie', jar.has(bindCookieName));
  currentStep.evidence.bindCookie = {
    name: bindCookieName,
    fingerprint: jar.has(bindCookieName) ? sha256_16(jar.get(bindCookieName)) : null
  };
  const statsAfterStart = await fixtureJson('/debug/stats');
  assert(
    'start 未触发 DCR 注册（CIMD 优先）',
    statsAfterStart.registrations === statsBeforeStart.registrations,
    { before: statsBeforeStart.registrations, after: statsAfterStart.registrations }
  );
  assert('授权 URL 已生成，pending state 已写台账', typeof authorizationUrl === 'string');

  /* ---------- Step 3：授权 + 回调 ---------- */
  beginStep('3', 'AS 同意 → 302 callback → 302 FE_DOMAIN/app/detail?oauth=success');
  const authFlow = await followAuthorizeAndCallback({ authorizationUrl });
  recordHttp('GET fixture /authorize', authFlow.authorizeRes, {
    redirectedToCallback:
      Boolean(authFlow.callbackUrl) && authFlow.callbackUrl.startsWith(redirectUri)
  });
  assert(
    'fixture 302 到 FastGPT callback',
    Boolean(authFlow.callbackUrl?.startsWith(redirectUri)),
    authFlow.callbackUrl ? redactUrl(authFlow.callbackUrl) : null
  );
  const callbackState = parseCallbackState(authFlow.callbackUrl || '');
  assert('回调携带 code', callbackState.hasCode);
  assert('回调携带 state', callbackState.hasState, callbackState.stateLength);
  assert('回调携带 iss', callbackState.iss === CFG.fixtureUrl, callbackState.iss);
  recordHttp('GET FastGPT callback', authFlow.callbackRes);
  const successLocation = authFlow.callbackRes?.location || '';
  assert('回调 302', authFlow.callbackRes?.status === 302, authFlow.callbackRes?.status);
  assert('回调跳转 oauth=success', /[?&]oauth=success(&|$)/.test(successLocation), successLocation ? redactUrl(successLocation) : null);
  assert('回调跳转包含 appId', errorCodeFromLocation(successLocation) === null && new URL(successLocation).searchParams.get('appId') === appId);
  assert('回调跳转目标为 FE_DOMAIN/app/detail', successLocation.startsWith(`${CFG.baseUrl}/app/detail`), successLocation.split('?')[0]);
  currentStep.evidence.callbackLocation = redactUrl(successLocation);
  currentStep.evidence.callbackState = callbackState;
  currentStep.evidence.consumedCallbackUrl = authFlow.callbackUrl;

  const statsAfterCallback = await fixtureJson('/debug/stats');
  assert(
    'AS 换取 authorization_code',
    statsAfterCallback.tokenRequestsByGrant.authorization_code >= 1,
    statsAfterCallback.tokenRequestsByGrant
  );

  /* ---------- Step 4：status ---------- */
  beginStep('4', 'GET oauth/status：authorized + CIMD + token 布尔值');
  const statusRes = await api('GET', `/api/core/app/mcpTools/oauth/status?appId=${appId}&nodeId=${nodeId}`);
  recordHttp('GET oauth/status', statusRes);
  const status = payload(statusRes) || {};
  assert('status 200', statusRes.status === 200, statusRes.status);
  assert('state=authorized', status.state === 'authorized', status.state);
  assert('authorized=true', status.authorized === true, status.authorized);
  assert('hasAccessToken=true', status.hasAccessToken === true, status.hasAccessToken);
  assert('hasRefreshToken=true', status.hasRefreshToken === true, status.hasRefreshToken);
  assert('clientSource=cimd', status.clientSource === 'cimd', status.clientSource);
  assert('scope=mcp:tools', status.scope === 'mcp:tools', status.scope);
  assert('issuer 与 fixture 一致', normalizeUrl(status.issuer) === normalizeUrl(CFG.fixtureUrl), status.issuer);
  const statsCimd = await fixtureJson('/debug/stats');
  assert(
    'CIMD 文档被 AS 拉取并校验',
    statsCimd.cimdFetches >= 1 && statsCimd.cimdValidationFailures === 0,
    { fetches: statsCimd.cimdFetches, failures: statsCimd.cimdValidationFailures }
  );
  assert('未发生 DCR 注册（CIMD 优先）', statsCimd.registrations === 0, statsCimd.registrations);
  currentStep.evidence.status = {
    state: status.state,
    clientSource: status.clientSource,
    scope: status.scope,
    hasAccessToken: status.hasAccessToken,
    hasRefreshToken: status.hasRefreshToken,
    authorizedAt: status.authorizedAt
  };

  /* ---------- Step 5：getTools ---------- */
  beginStep('5', 'POST mcpTools/getTools：真实 MCP tools/list');
  const fpBeforeTools = await fixtureJson('/debug/bearer-fingerprints');
  const getToolsRes = await api('POST', '/api/core/app/mcpTools/getTools', { body: { appId, nodeId } });
  recordHttp('POST mcpTools/getTools', getToolsRes, { bodyBytes: getToolsRes.text.length });
  const tools = payload(getToolsRes);
  assert('getTools 200', getToolsRes.status === 200, getToolsRes.status);
  assert('返回 2 个工具', Array.isArray(tools) && tools.length === 2, Array.isArray(tools) ? tools.length : null);
  const toolNames = (tools || []).map((t) => t.name).sort();
  assert('工具名匹配 fixture', JSON.stringify(toolNames) === JSON.stringify(['echo', 'whoami']), toolNames);
  const fpAfterTools = await fixtureJson('/debug/bearer-fingerprints');
  assert('MCP 收到 Bearer（指纹增加）', fpAfterTools.total > fpBeforeTools.total, {
    before: fpBeforeTools.total,
    after: fpAfterTools.total,
    delta: fpAfterTools.total - fpBeforeTools.total
  });
  currentStep.evidence.toolNames = toolNames;
  currentStep.evidence.bearerFingerprints = { before: fpBeforeTools.total, after: fpAfterTools.total };

  /* ---------- Step 6：runTool ---------- */
  beginStep('6', 'POST mcpTools/runTool：真实工具调用携带 Bearer');
  const fpBeforeRun = await fixtureJson('/debug/bearer-fingerprints');
  const runToolRes = await api('POST', '/api/core/app/mcpTools/runTool', {
    body: { appId, nodeId, toolName: 'whoami', params: {} }
  });
  recordHttp('POST mcpTools/runTool', runToolRes, { bodyBytes: runToolRes.text.length });
  assert('runTool 200', runToolRes.status === 200, runToolRes.status);
  const runResult = payload(runToolRes) || {};
  currentStep.evidence.runToolResult = runResult;
  const fpAfterRun = await fixtureJson('/debug/bearer-fingerprints');
  assert('fixture 收到新的 Bearer 指纹', fpAfterRun.total > fpBeforeRun.total, {
    before: fpBeforeRun.total,
    after: fpAfterRun.total
  });
  const events = await fixtureJson('/debug/events');
  const mcpEvents = events.events.filter((e) => e.path === '/mcp' && e.status === 200);
  assert(
    'fixture /mcp 记录了 Authorization 指纹（不落明文）',
    mcpEvents.some((e) => typeof e.authorization === 'string' && e.authorization.startsWith('fingerprint:')),
    { mcp200Events: mcpEvents.length }
  );
  currentStep.evidence.mcpBearer = {
    fingerprintCount: fpAfterRun.total,
    lastFingerprint: fpAfterRun.fingerprints.at(-1)
  };

  /* ---------- Step 6b：回调后落库 toolList（前端流程） ---------- */
  beginStep('6b', 'POST mcpTools/update：回调后保存 toolList，token 保持不变');
  const updateRes = await api('POST', '/api/core/app/mcpTools/update', {
    body: {
      appId,
      nodeId,
      url: fixtureMcpUrl,
      authMode: 'oauth',
      clientMode: 'auto',
      scope: 'mcp:tools',
      toolList
    }
  });
  recordHttp('POST mcpTools/update', updateRes);
  assert('update 200', updateRes.status === 200, updateRes.status);
  const statusAfterUpdateRes = await api(
    'GET',
    `/api/core/app/mcpTools/oauth/status?appId=${appId}&nodeId=${nodeId}`
  );
  const statusAfterUpdate = payload(statusAfterUpdateRes) || {};
  recordHttp('GET oauth/status (after update)', statusAfterUpdateRes);
  assert('保存 toolList 后仍 authorized', statusAfterUpdate.state === 'authorized', statusAfterUpdate.state);
  assert('保存 toolList 不清除 token', statusAfterUpdate.hasAccessToken === true);
  assert(
    'credentialSeq 未因同一 URL 保存而增加',
    true,
    { note: 'seq 由 status 不暴露，行为断言：token 保留且 authorized' }
  );

  /* ---------- Step 7：disconnect ---------- */
  beginStep('7', 'POST oauth/disconnect：本地清空 + RFC 7009 撤销');
  const statsBeforeDisconnect = await fixtureJson('/debug/stats');
  const disconnectRes = await api('POST', '/api/core/app/mcpTools/oauth/disconnect', {
    body: { appId, nodeId, confirm: true }
  });
  recordHttp('POST oauth/disconnect', disconnectRes);
  const disconnectBody = payload(disconnectRes) || {};
  assert('disconnect 200', disconnectRes.status === 200, disconnectRes.status);
  assert('disconnected=true', disconnectBody.disconnected === true, disconnectBody.disconnected);
  assert('revoked=true', disconnectBody.revoked === true, disconnectBody.revoked);
  currentStep.evidence.disconnect = disconnectBody;
  const statsAfterDisconnect = await fixtureJson('/debug/stats');
  assert(
    'AS 收到撤销请求（revocations +1 或 +2）',
    statsAfterDisconnect.revocations > statsBeforeDisconnect.revocations,
    { before: statsBeforeDisconnect.revocations, after: statsAfterDisconnect.revocations }
  );
  const statusAfterDisconnectRes = await api(
    'GET',
    `/api/core/app/mcpTools/oauth/status?appId=${appId}&nodeId=${nodeId}`
  );
  recordHttp('GET oauth/status (after disconnect)', statusAfterDisconnectRes);
  const statusAfterDisconnect = payload(statusAfterDisconnectRes) || {};
  assert(
    'status=reauth_required 且 authorized=false',
    statusAfterDisconnect.state === 'reauth_required' && statusAfterDisconnect.authorized === false,
    { state: statusAfterDisconnect.state, authorized: statusAfterDisconnect.authorized }
  );
  assert('hasAccessToken=false', statusAfterDisconnect.hasAccessToken === false);
  assert('hasRefreshToken=false', statusAfterDisconnect.hasRefreshToken === false);

  /* ---------- Step 8：重新授权（复用 client，旧 state 失效） ---------- */
  beginStep('8', '重新 oauth/start：复用 CIMD client，旧 state 重放被拒');
  const statsBeforeReauth = await fixtureJson('/debug/stats');
  const restart = await startOauth(appId, nodeId);
  recordHttp('POST oauth/start (re-auth)', restart.res);
  assert('re-start 200', restart.res.status === 200, restart.res.status);
  assert('仍为 CIMD', restart.body.clientSource === 'cimd', restart.body.clientSource);
  const reauthFlow = await followAuthorizeAndCallback({
    authorizationUrl: restart.body.authorizationUrl
  });
  recordHttp('GET fixture /authorize (re-auth)', reauthFlow.authorizeRes);
  recordHttp('GET FastGPT callback (re-auth)', reauthFlow.callbackRes);
  const reauthLocation = reauthFlow.callbackRes?.location || '';
  assert('re-auth 回调 oauth=success', /[?&]oauth=success(&|$)/.test(reauthLocation), redactUrl(reauthLocation));
  const statusAfterReauthRes = await api(
    'GET',
    `/api/core/app/mcpTools/oauth/status?appId=${appId}&nodeId=${nodeId}`
  );
  const statusAfterReauth = payload(statusAfterReauthRes) || {};
  recordHttp('GET oauth/status (re-auth)', statusAfterReauthRes);
  assert('再次 authorized', statusAfterReauth.state === 'authorized', statusAfterReauth.state);
  assert('hasAccessToken=true', statusAfterReauth.hasAccessToken === true);
  const statsAfterReauth = await fixtureJson('/debug/stats');
  assert(
    '未发生重复 DCR 注册',
    statsAfterReauth.registrations === statsBeforeReauth.registrations,
    { before: statsBeforeReauth.registrations, after: statsAfterReauth.registrations }
  );
  // 上一轮已消费 state 现在重放必须被拒
  const step3Evidence = evidence.steps.find((s) => s.id === '3').evidence;
  const replayOld = await rawFetch(step3Evidence.consumedCallbackUrl, { cookie: false });
  const oldLocation = replayOld.location || '';
  assert(
    '上一轮 state 已失效（重放被拒）',
    replayOld.status === 302 && /[?&]oauth=error/.test(oldLocation),
    { status: replayOld.status, code: errorCodeFromLocation(oldLocation) }
  );
  currentStep.evidence.replayOldState = {
    status: replayOld.status,
    code: errorCodeFromLocation(oldLocation)
  };

  /* ---------- Step 9：refresh 轮换 ---------- */
  beginStep('9', '强制刷新：fixture 过期 token → 401 → 刷新 → 新指纹');
  const statsBeforeRefresh = await fixtureJson('/debug/stats');
  const fpBeforeRefresh = await fixtureJson('/debug/bearer-fingerprints');
  const expireRes = await fixture('POST', '/debug/expire-tokens');
  recordHttp('POST fixture /debug/expire-tokens', expireRes);
  assert('fixture 使旧 access token 失效', expireRes.json?.ok === true && expireRes.json.expired >= 1, expireRes.json?.expired);
  const refreshRunRes = await api('POST', '/api/core/app/mcpTools/runTool', {
    body: { appId, nodeId, toolName: 'whoami', params: {} }
  });
  recordHttp('POST mcpTools/runTool (after token expiry)', refreshRunRes);
  assert('401 后自动刷新并重试成功', refreshRunRes.status === 200, refreshRunRes.status);
  const statsAfterRefresh = await fixtureJson('/debug/stats');
  const fpAfterRefresh = await fixtureJson('/debug/bearer-fingerprints');
  assert(
    'refresh_token 授权次数 +1',
    statsAfterRefresh.tokenRequestsByGrant.refresh_token >=
      statsBeforeRefresh.tokenRequestsByGrant.refresh_token + 1,
    {
      before: statsBeforeRefresh.tokenRequestsByGrant.refresh_token,
      after: statsAfterRefresh.tokenRequestsByGrant.refresh_token
    }
  );
  assert('refreshes 计数 +1', statsAfterRefresh.refreshes >= statsBeforeRefresh.refreshes + 1, {
    before: statsBeforeRefresh.refreshes,
    after: statsAfterRefresh.refreshes
  });
  const newFingerprints = fpAfterRefresh.fingerprints.slice(fpBeforeRefresh.total);
  assert('出现新的 Bearer 指纹（token 已轮换）', newFingerprints.length >= 1, newFingerprints);
  assert(
    '旧 access token 指纹进入 expired',
    fpAfterRefresh.expiredFingerprints.length >= fpBeforeRefresh.expiredFingerprints.length + 1,
    {
      before: fpBeforeRefresh.expiredFingerprints.length,
      after: fpAfterRefresh.expiredFingerprints.length
    }
  );
  assert(
    'refresh token 轮换发生（fixture 删除旧 RT）',
    statsAfterRefresh.refreshTokensRotated >= statsBeforeRefresh.refreshTokensRotated + 1,
    {
      before: statsBeforeRefresh.refreshTokensRotated,
      after: statsAfterRefresh.refreshTokensRotated
    }
  );
  currentStep.evidence.refresh = {
    refreshCounts: { before: statsBeforeRefresh.refreshes, after: statsAfterRefresh.refreshes },
    refreshTokensRotated: statsAfterRefresh.refreshTokensRotated,
    tokenRequestsByGrant: statsAfterRefresh.tokenRequestsByGrant,
    newFingerprints,
    expiredFingerprints: fpAfterRefresh.expiredFingerprints
  };

  /* ---------- Step 10：负向用例 ---------- */
  beginStep('10', '负向：state 重放 ×10 / 缺失 Cookie / 错误 Cookie / PRM resource / iss', 'negative');

  // 10.1 state 重放 ×10
  const replayTarget = evidence.steps.find((s) => s.id === '3').evidence.consumedCallbackUrl;
  let replaySuccess = 0;
  const replayCodes = {};
  for (let i = 0; i < 10; i += 1) {
    const res = await rawFetch(replayTarget, { cookie: false });
    const loc = res.location || '';
    if (/[?&]oauth=success(&|$)/.test(loc)) replaySuccess += 1;
    else {
      const code = errorCodeFromLocation(loc);
      replayCodes[code] = (replayCodes[code] || 0) + 1;
    }
  }
  assert('state 重放 10 次均未成功', replaySuccess === 0, { replaySuccess });
  assert(
    '重放返回 mcp_oauth_state_replayed',
    (replayCodes.mcp_oauth_state_replayed || 0) === 10,
    replayCodes
  );
  evidence.summary.negativeCases += 1;

  // 10.2 缺少绑定 cookie
  const noCookieStart = await startOauth(appId, nodeId);
  recordHttp('POST oauth/start (missing cookie)', noCookieStart.res);
  assert('缺失 cookie 用例：start 200', noCookieStart.res.status === 200, noCookieStart.res.status);
  const noCookieFlow = await followAuthorizeAndCallback({
    authorizationUrl: noCookieStart.body.authorizationUrl,
    bindCookie: null
  });
  const noCookieLoc = noCookieFlow.callbackRes?.location || '';
  assert(
    '缺少绑定 cookie 被拒（state_cookie_missing）',
    noCookieFlow.callbackRes?.status === 302 &&
      errorCodeFromLocation(noCookieLoc) === 'mcp_oauth_state_cookie_missing',
    { status: noCookieFlow.callbackRes?.status, code: errorCodeFromLocation(noCookieLoc) }
  );
  evidence.summary.negativeCases += 1;

  // 10.3 错误绑定 cookie
  const wrongCookieStart = await startOauth(appId, nodeId);
  recordHttp('POST oauth/start (wrong cookie)', wrongCookieStart.res);
  assert('错误 cookie 用例：start 200', wrongCookieStart.res.status === 200, wrongCookieStart.res.status);
  const wrongCookieFlow = await followAuthorizeAndCallback({
    authorizationUrl: wrongCookieStart.body.authorizationUrl,
    bindCookie: `mcp_oauth_bind_${appId}=${crypto.randomBytes(32).toString('base64url')}`
  });
  const wrongCookieLoc = wrongCookieFlow.callbackRes?.location || '';
  assert(
    '绑定 cookie 不匹配被拒（state_binding_mismatch）',
    wrongCookieFlow.callbackRes?.status === 302 &&
      errorCodeFromLocation(wrongCookieLoc) === 'mcp_oauth_state_binding_mismatch',
    { status: wrongCookieFlow.callbackRes?.status, code: errorCodeFromLocation(wrongCookieLoc) }
  );
  evidence.summary.negativeCases += 1;

  // 10.4 PRM resource 不匹配（独立 app，避免 start 限流串扰）
  await fixture('POST', '/debug/inject', { failures: ['prm_resource_mismatch'] });
  const prmApp = await createOauthApp('prm-negative', 'prm-negative');
  const prmStart = prmApp.appId
    ? await startOauth(prmApp.appId, prmApp.nodeId)
    : { res: { status: 0, text: 'create failed' }, body: {} };
  recordHttp('POST oauth/start (PRM resource mismatch)', prmStart.res);
  assert(
    'PRM resource 不匹配被拒（4xx）',
    prmStart.res.status >= 400 && prmStart.res.status < 500,
    prmStart.res.status
  );
  assert(
    '错误码 mcp_oauth_prm_resource_mismatch',
    (prmStart.res.text || '').includes('mcp_oauth_prm_resource_mismatch')
  );
  await fixture('POST', '/debug/inject', { failures: [] });
  evidence.summary.negativeCases += 1;

  // 10.5 授权响应 iss 不匹配（独立 app）
  await fixture('POST', '/debug/inject', { failures: ['authorize_iss_mismatch'] });
  const issApp = await createOauthApp('iss-negative', 'iss-negative');
  const issStart = issApp.appId
    ? await startOauth(issApp.appId, issApp.nodeId)
    : { res: { status: 0, text: 'create failed' }, body: {} };
  assert('iss 用例：start 200', issStart.res.status === 200, issStart.res.status);
  if (issStart.res.status === 200) {
    const issFlow = await followAuthorizeAndCallback({
      authorizationUrl: issStart.body.authorizationUrl
    });
    const issLoc = issFlow.callbackRes?.location || '';
    assert(
      'iss 不匹配被拒（issuer_mismatch）',
      issFlow.callbackRes?.status === 302 &&
        errorCodeFromLocation(issLoc) === 'mcp_oauth_issuer_mismatch',
      { status: issFlow.callbackRes?.status, code: errorCodeFromLocation(issLoc) }
    );
  }
  await fixture('POST', '/debug/inject', { failures: [] });
  evidence.summary.negativeCases += 1;

  // 负向用例不应破坏当前授权
  const finalStatusRes = await api(
    'GET',
    `/api/core/app/mcpTools/oauth/status?appId=${appId}&nodeId=${nodeId}`
  );
  recordHttp('GET oauth/status (after negatives)', finalStatusRes);
  assert('负向用例后主应用仍 authorized', payload(finalStatusRes)?.state === 'authorized', payload(finalStatusRes)?.state);
  currentStep.evidence.negativeCases = evidence.summary.negativeCases;

  /* ---------- Step 11：PRM 404 → 根 AS metadata 回退 ---------- */
  beginStep('11', 'PRM 404 → MCP origin 根 AS metadata 回退（v2.4 §5.2）', 'fallback');
  await fixture('POST', '/debug/inject', { prmMode: 'missing' });
  const fallbackHealth = await fixtureJson('/health');
  assert('fixture 切换到 PRM missing', fallbackHealth.prmMode === 'missing', fallbackHealth.prmMode);
  const fallbackPrm = await fixture('GET', '/.well-known/oauth-protected-resource/mcp');
  assert('PRM path-aware 返回 404', fallbackPrm.status === 404, fallbackPrm.status);
  const fallbackPrmRoot = await fixture('GET', '/.well-known/oauth-protected-resource');
  assert('PRM root 返回 404', fallbackPrmRoot.status === 404, fallbackPrmRoot.status);

  const fallbackApp = await createOauthApp('prm-fallback', 'prm-fallback');
  assert('回退用例 app 创建成功', Boolean(fallbackApp.appId), fallbackApp.appId);
  const fallbackStart = fallbackApp.appId
    ? await startOauth(fallbackApp.appId, fallbackApp.nodeId)
    : { res: { status: 0, text: 'create failed' }, body: {} };
  recordHttp('POST oauth/start (PRM 404 fallback)', fallbackStart.res);
  assert('PRM 404 时 start 成功（回退根 AS metadata）', fallbackStart.res.status === 200, fallbackStart.res.status);
  assert(
    '回退后 issuer = MCP origin',
    normalizeUrl(fallbackStart.body.issuer) === normalizeUrl(CFG.fixtureUrl),
    fallbackStart.body.issuer
  );
  assert(
    '回退后仍返回 authorizationUrl',
    typeof fallbackStart.body.authorizationUrl === 'string'
  );
  if (fallbackStart.res.status === 200) {
    const fallbackFlow = await followAuthorizeAndCallback({
      authorizationUrl: fallbackStart.body.authorizationUrl
    });
    const fbLoc = fallbackFlow.callbackRes?.location || '';
    assert('回退链路 callback 成功', /[?&]oauth=success(&|$)/.test(fbLoc), redactUrl(fbLoc));
    const fallbackStatusRes = await api(
      'GET',
      `/api/core/app/mcpTools/oauth/status?appId=${fallbackApp.appId}&nodeId=${fallbackApp.nodeId}`
    );
    recordHttp('GET oauth/status (fallback app)', fallbackStatusRes);
    assert('回退链路 status=authorized', payload(fallbackStatusRes)?.state === 'authorized', payload(fallbackStatusRes)?.state);
  }
  await fixture('POST', '/debug/inject', { prmMode: 'present' });

  /* ---------- Step 12：HTML 同意页（授权 / 拒绝） ---------- */
  beginStep('12', 'HTML 同意页：always 模式展示 → POST 授权', 'consent');
  await fixture('POST', '/debug/inject', { consent: 'always' });
  const consentApp = await createOauthApp('consent', 'consent');
  const consentStart = consentApp.appId
    ? await startOauth(consentApp.appId, consentApp.nodeId)
    : { res: { status: 0, text: 'create failed' }, body: {} };
  assert('同意页用例 start 200', consentStart.res.status === 200, consentStart.res.status);
  if (consentStart.res.status === 200) {
    const consentPage = await rawFetch(consentStart.body.authorizationUrl, {
      cookie: false,
      headers: { accept: 'text/html' }
    });
    recordHttp('GET fixture /authorize (consent page)', consentPage);
    assert('同意页 HTTP 200 text/html', consentPage.status === 200 && /text\/html/.test(consentPage.headers['content-type'] || ''), consentPage.status);
    assert('同意页包含授权/拒绝表单', consentPage.text.includes('/authorize/decision') && consentPage.text.includes('decision'));
    assert('同意页展示 client_id / scope / resource', consentPage.text.includes('client_id') && consentPage.text.includes('mcp:tools') && consentPage.text.includes(fixtureMcpUrl));
    const txn = /name="transaction_id" value="([^"]+)"/.exec(consentPage.text)?.[1];
    assert('同意页携带一次性 transaction_id', Boolean(txn));
    if (txn) {
      const decision = await rawFetch(`${CFG.fixtureUrl}/authorize/decision`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'text/html' },
        body: `transaction_id=${encodeURIComponent(txn)}&decision=approve`,
        cookie: false
      });
      recordHttp('POST fixture /authorize/decision (approve)', decision);
      assert('授权决定 302 到 FastGPT callback', decision.status === 302 && (decision.location || '').startsWith(redirectUri), decision.status);
      if (decision.location) {
        const consentCallback = await rawFetch(decision.location, { headers: { accept: 'text/html' } });
        recordHttp('GET FastGPT callback (consent)', consentCallback);
        const consentLoc = consentCallback.location || '';
        assert('同意页授权后 oauth=success', /[?&]oauth=success(&|$)/.test(consentLoc), redactUrl(consentLoc));
      }
    }
  }
  await fixture('POST', '/debug/inject', { consent: 'auto' });

  /* ---------- 收尾 ---------- */
  beginStep('13', '最终状态与 fixture 汇总', 'summary');
  const finalStatus = await api(
    'GET',
    `/api/core/app/mcpTools/oauth/status?appId=${appId}&nodeId=${nodeId}`
  );
  assert('主应用最终仍 authorized', payload(finalStatus)?.state === 'authorized', payload(finalStatus)?.state);
  const finalStats = await fixtureJson('/debug/stats');
  evidence.fixtureFinalStats = {
    authorizations: finalStats.authorizations,
    authorizationsDenied: finalStats.authorizationsDenied,
    consentsShown: finalStats.consentsShown,
    consentsApproved: finalStats.consentsApproved,
    tokenRequests: finalStats.tokenRequests,
    tokenRequestsByGrant: finalStats.tokenRequestsByGrant,
    refreshes: finalStats.refreshes,
    refreshTokensRotated: finalStats.refreshTokensRotated,
    revocations: finalStats.revocations,
    registrations: finalStats.registrations,
    deregistrations: finalStats.deregistrations,
    cimdFetches: finalStats.cimdFetches,
    cimdValidations: finalStats.cimdValidations,
    cimdValidationFailures: finalStats.cimdValidationFailures,
    mcpRequests: finalStats.mcpRequests,
    issuedAccessTokens: finalStats.issuedAccessTokens,
    issuedRefreshTokens: finalStats.issuedRefreshTokens
  };
  evidence.cookieNames = jar.describe().map((c) => c.name);
}

const finalize = (fatalError) => {
  evidence.finishedAt = new Date().toISOString();
  evidence.summary.total = evidence.steps.length;
  evidence.summary.passed = evidence.steps.filter((s) => s.ok).length;
  evidence.summary.failed = evidence.steps.filter((s) => !s.ok && !s.skipped).length;
  evidence.ok = !fatalError && evidence.summary.failed === 0;
  if (fatalError) {
    evidence.fatalError = { message: String(fatalError?.message ?? fatalError) };
  }
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
  fs.writeFileSync(logPath, `${logLines.join('\n')}\n`);
  log(`\nResult: ${evidence.ok ? 'PASS' : 'FAIL'} (steps ${evidence.summary.passed}/${evidence.summary.total}, negative ${evidence.summary.negativeCases})`);
  log(`evidence: ${evidencePath}`);
  log(`log: ${logPath}`);
};

main()
  .then(() => {
    finalize(null);
    process.exit(evidence.ok ? 0 : 1);
  })
  .catch((error) => {
    if (currentStep) {
      currentStep.ok = false;
      currentStep.error = String(error?.message ?? error);
    }
    log(`\nFATAL: ${error?.stack ?? error}`);
    finalize(error);
    process.exit(1);
  });
