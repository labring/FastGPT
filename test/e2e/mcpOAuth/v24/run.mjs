/**
 * MCP OAuth v2.4 真实 HTTP 端到端验收（handoff §「安全与验收」）。
 *
 * 真实 FastGPT 生产构建（`next start`）+ 真实 HTTP + 真实 Mongo/Redis。
 * 仅 OAuth AS / MCP server 是进程内 fixture（见 fixtures/oauthMcpServer.mjs），
 * 因为它扮演的是「第三方授权服务器」，本来就不属于 FastGPT。
 *
 * 运行方式（见 run.sh）：先构建并启动 FastGPT，再执行本脚本。
 *
 * 安全：
 *  - 不打印、不落盘 access/refresh token、authorization code、state、client secret；
 *    证据里只保留状态码、计数、issuer/resource 等非敏感值。
 *  - authMode=oauth 的鉴权只使用节点内加密凭据；本脚本不注入任何生产开关。
 */
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { createMockOAuthProvider } from './fixtures/oauthMcpServer.mjs';
import { createRespClient } from './lib/respClient.mjs';

const ROOT = path.resolve(import.meta.dirname, '../../../..');
const APP_DIR = path.join(ROOT, 'projects/app');
const requireFromApp = createRequire(path.join(APP_DIR, 'package.json'));

const CFG = {
  appBase: (process.env.E2E_APP_BASE_URL || 'http://127.0.0.1:13100').replace(/\/+$/, ''),
  fixtureHost: process.env.E2E_FIXTURE_HOST || '172.17.0.34',
  fixturePort: Number(process.env.E2E_FIXTURE_PORT || 18200),
  mongoUri:
    process.env.MONGODB_URI ||
    'mongodb://127.0.0.1:27017/fastgpt_mcp_oauth_e2e?replicaSet=rs0',
  redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  evidencePath: process.env.E2E_EVIDENCE_PATH || '/tmp/mcp-oauth-e2e/evidence.json',
  timeoutMs: Number(process.env.E2E_HTTP_TIMEOUT_MS || 30000)
};

const sha256_12 = (value) =>
  crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 12);
const nowIso = () => new Date().toISOString();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ------------------------------ HTTP 基础 ------------------------------ */

const request = async (
  target,
  { method = 'GET', token, body, cookie, headers = {}, timeoutMs = CFG.timeoutMs } = {}
) => {
  const init = {
    method,
    redirect: 'manual',
    headers: { accept: 'application/json', ...headers },
    signal: AbortSignal.timeout(timeoutMs)
  };
  if (body !== undefined) {
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
    setCookies: typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [],
    location: response.headers.get('location'),
    text,
    json
  };
};

const api = (apiPath, options = {}) => request(`${CFG.appBase}${apiPath}`, options);
const apiData = (res) => (res.json && typeof res.json === 'object' ? res.json.data : undefined);

const redactUrl = (value) => {
  try {
    const url = new URL(value);
    for (const key of ['code', 'state', 'access_token', 'refresh_token', 'code_verifier']) {
      if (url.searchParams.has(key)) url.searchParams.set(key, '<redacted>');
    }
    return url.toString();
  } catch {
    return '<unparsable>';
  }
};

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
  const marker = item.ok ? 'PASS' : 'FAIL';
  console.log(`  [${marker}] ${label}${detail === undefined ? '' : ` :: ${JSON.stringify(detail)}`}`);
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

/** 打开 authorizationUrl（模拟浏览器），返回 code/state/iss（仅内存使用）。 */
const openAuthorizeUrl = async (authorizationUrl) => {
  const res = await request(authorizationUrl, { method: 'GET' });
  if (res.status !== 302 || !res.location) {
    return { res, error: `authorize did not redirect (status=${res.status})` };
  }
  const location = new URL(res.location);
  return {
    res,
    location,
    code: location.searchParams.get('code') ?? undefined,
    state: location.searchParams.get('state') ?? undefined,
    iss: location.searchParams.get('iss') ?? undefined
  };
};

const callbackPath = (params) => {
  const url = new URL(`${CFG.appBase}/api/core/app/mcpTools/oauth/callback`);
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

const doCallback = async ({ state, code, cookie, iss }) =>
  parseCallbackOutcome(
    await request(callbackPath({ state, code, iss }), {
      method: 'GET',
      cookie
    })
  );

const statusOf = async (appId) => {
  const res = await api(
    `/api/core/app/mcpTools/oauth/status?appId=${encodeURIComponent(appId)}`,
    { token: sessionToken }
  );
  return { res, status: res.json };
};

const getTools = async (appId) =>
  api('/api/core/app/mcpTools/getTools', {
    method: 'POST',
    token: sessionToken,
    body: { appId }
  });

const runTool = async (appId) =>
  api('/api/core/app/mcpTools/runTool', {
    method: 'POST',
    token: sessionToken,
    body: { appId, toolName: 'echo', params: { text: 'hello-e2e' } }
  });

const nodeOauth = async (appId) => {
  const oid = new (requireFromApp('mongoose').Types.ObjectId)(appId);
  const version = await db.collection('app_versions').findOne(
    { appId: oid, isPublish: true },
    { sort: { time: -1, _id: -1 } }
  );
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

const stats = (scenario) => fixture.control.stats(scenario);

/** 完整授权：start → authorize → callback，返回各步结果。 */
const completeAuthorization = async (appId, extra = {}) => {
  const start = await startOAuth(appId, extra);
  if (start.res.status !== 200 || !start.body?.authorizationUrl) {
    return { start, authorize: null, callback: null };
  }
  const authorize = await openAuthorizeUrl(start.body.authorizationUrl);
  if (!authorize.code || !authorize.state) return { start, authorize, callback: null };
  const callback = await doCallback({
    state: authorize.state,
    code: authorize.code,
    cookie: `${start.cookieName}=${start.cookieValue}`
  });
  return { start, authorize, callback };
};

/* ------------------------------ 启动前置 ------------------------------ */

let mongoose;
let fixture;

const seedAuth = async () => {
  mongoose = requireFromApp('mongoose');
  await mongoose.connect(CFG.mongoUri, { serverSelectionTimeoutMS: 15000 });
  const connection = mongoose.connection;
  db = {
    collection: (name) => connection.collection(name)
  };

  // 专用测试库：每次运行前清空，避免历史用户/应用影响断言。
  await connection.dropDatabase().catch(() => {});
  await connection.client
    .db('fastgpt_mcp_oauth_e2e_log')
    .dropDatabase()
    .catch(() => {});

  const oid = mongoose.Types.ObjectId;
  const userId = new oid();
  const teamId = new oid();
  const tmbId = new oid();

  await db.collection('users').insertOne({
    _id: userId,
    username: 'e2e-user',
    status: 'active',
    createTime: new Date()
  });
  await db.collection('teams').insertOne({
    _id: teamId,
    name: 'E2E Team',
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
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const res = await request(`${CFG.appBase}/login`, { timeoutMs: 8000 });
      if (res.status === 200) return res.status;
    } catch {
      /* retry */
    }
    await sleep(1000);
  }
  throw new Error(`FastGPT is not serving HTTP at ${CFG.appBase}`);
};

/* ------------------------------ 用例 ------------------------------ */

const main = async () => {
  console.log(`[e2e] FastGPT: ${CFG.appBase}`);
  console.log(`[e2e] fixture: http://${CFG.fixtureHost}:${CFG.fixturePort}`);
  console.log(`[e2e] mongo: ${CFG.mongoUri.replace(/\/\/[^@/]+@/, '//<redacted>@')}`);

  fixture = createMockOAuthProvider({ host: CFG.fixtureHost, port: CFG.fixturePort });
  await fixture.listen();
  const fixtureBase = fixture.base;

  let seeded;
  try {
    await ensureAppReady();
    seeded = await seedAuth();
    await clearRateLimits();
    console.log(
      `[e2e] seeded session for team=${seeded.teamId.slice(-6)} tmb=${seeded.tmbId.slice(-6)}`
    );

    /* ---------- 正向 1：创建 mcpToolSet 应用 ---------- */
    const appA = {};
    await runCase('positive-01-create', '创建 mcpToolSet 应用（oauth + auto + scope）', async () => {
      await clearRateLimits();
      const { res, appId } = await createApp({
        name: `E2E CIMD ${Date.now()}`,
        url: fixture.control.mcpUrl('a'),
        clientMode: 'auto',
        scope: 'mcp:tools'
      });
      check('create -> HTTP 200', res.status === 200, { status: res.status });
      check('create -> appId returned', typeof appId === 'string' && /^[0-9a-f]{24}$/.test(appId));
      const { node, oauth } = await nodeOauth(appId);
      check('app_versions 存在 toolSet 节点', !!node, { nodeId: node?.nodeId });
      check('节点 authMode=oauth', node?.toolConfig?.mcpToolSet?.authMode === 'oauth');
      check('节点 clientMode=auto', oauth?.clientMode === 'auto', { clientMode: oauth?.clientMode });
      check('节点 scope=mcp:tools', oauth?.scope === 'mcp:tools', { scope: oauth?.scope });
      appA.appId = appId;
    });

    /* ---------- 正向 2：CIMD start（DCR 必须 0 次） ---------- */
    await runCase('positive-02-start-cimd', 'start 走 CIMD，DCR /register 调用 = 0', async () => {
      await clearRateLimits();
      fixture.control.reset('a');
      const started = await startOAuth(appA.appId, { clientMode: 'auto', scope: 'mcp:tools' });
      appA.start = started;
      check('start -> HTTP 200', started.res.status === 200, { status: started.res.status });
      check('clientSource=cimd', started.body?.clientSource === 'cimd', {
        clientSource: started.body?.clientSource
      });
      check('clientMode=auto', started.body?.clientMode === 'auto');
      check('issuer 指向 fixture scenario a', started.body?.issuer === fixture.control.issuer('a'));
      check('resource = MCP URL', started.body?.resource === fixture.control.mcpUrl('a'));
      check('Set-Cookie 下发绑定 Cookie', !!started.cookieValue);
      const pending = await pendingStates(appA.appId);
      check('mcp_oauth_states 写入 1 条未消费台账', pending === 1, { pending });
      const counters = stats('a');
      check('fixture /register 调用次数 = 0', counters.register === 0, {
        register: counters.register
      });
      check('authorize 尚未被调用', counters.authorize === 0, { authorize: counters.authorize });
      check('start 未中断/未要求用户选择 client', !/manual|choose|select/i.test(started.res.text));
    });

    /* ---------- 正向 3：模拟浏览器授权 + 回调 ---------- */
    await runCase('positive-03-callback', '授权页 302 → 回调绑定 Cookie → 成功', async () => {
      await clearRateLimits();
      const authorize = await openAuthorizeUrl(appA.start.body.authorizationUrl);
      check('authorize -> HTTP 302', authorize.res.status === 302, { status: authorize.res.status });
      check('authorize 返回 code/state', !!authorize.code && !!authorize.state);
      check('authorize 返回 RFC 9207 iss', authorize.iss === fixture.control.issuer('a'), {
        issMatches: authorize.iss === fixture.control.issuer('a')
      });
      const outcome = await doCallback({
        state: authorize.state,
        code: authorize.code,
        iss: authorize.iss,
        cookie: `${appA.start.cookieName}=${appA.start.cookieValue}`
      });
      check('callback -> HTTP 302', outcome.redirected, { status: outcome.status });
      check('callback 跳转 oauth=success', outcome.oauth === 'success', {
        oauth: outcome.oauth,
        appIdMatches: outcome.appId === appA.appId
      });
      check(
        '回调跳转目标只包含 appId/oauth[/code]',
        outcome.redirected &&
          outcome.appId === appA.appId &&
          ['success', 'error'].includes(outcome.oauth ?? '')
      );
      const counters = stats('a');
      check('fixture 记录 1 次 code 交换', counters.tokenExchange === 1, {
        tokenExchange: counters.tokenExchange
      });
      check('state 台账已一次性消费', (await consumedStates(appA.appId)) === 1, {
        consumed: await consumedStates(appA.appId)
      });
      const { oauth } = await nodeOauth(appA.appId);
      check('节点写入加密 token（iv:hex:hex）', /^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/.test(
        oauth?.token?.secret?.access_token?.secret ?? ''
      ));
      check('节点写入 refresh_token', !!oauth?.token?.secret?.refresh_token?.secret);
      check('凭据序号递增（callback CAS 成功）', (oauth?.credentialSeq ?? 0) > 0, {
        credentialSeq: oauth?.credentialSeq
      });
    });

    /* ---------- 正向 4：status 只读、无泄漏 ---------- */
    await runCase('positive-04-status', 'status = authorized，响应不含 token/secret', async () => {
      await clearRateLimits();
      const { res, status } = await statusOf(appA.appId);
      check('status -> HTTP 200', res.status === 200, { status: res.status });
      check('state=authorized', status?.state === 'authorized', { state: status?.state });
      check('authorized=true', status?.authorized === true);
      check('hasAccessToken=true', status?.hasAccessToken === true);
      check('hasRefreshToken=true', status?.hasRefreshToken === true);
      check('clientSource=cimd', status?.clientSource === 'cimd');
      check(
        '响应无 access_token/refresh_token/clientSecret/secret 字段',
        !hasForbiddenKeys(status, new Set(['access_token', 'refresh_token', 'clientSecret', 'secret', 'codeVerifier']))
      );
      check('响应不含 Bearer 明文', !/Bearer\s+[A-Za-z0-9._~-]{16,}/.test(res.text));
    });

    /* ---------- 正向 5：getTools 真实 tools/list ---------- */
    await runCase('positive-05-get-tools', 'getTools 通过真实 Bearer 调用 tools/list', async () => {
      await clearRateLimits();
      fixture.control.reset('a');
      const res = await getTools(appA.appId);
      const tools = apiData(res);
      check('getTools -> HTTP 200', res.status === 200, { status: res.status });
      check('返回工具数组', Array.isArray(tools), { count: tools?.length });
      check('包含 fixture 的 echo 工具', tools?.some((tool) => tool.name === 'echo'));
      const events = fixture.control.events('a');
      check(
        'fixture 收到真实 JSON-RPC tools/list',
        events.some((event) => event.kind === 'mcp-rpc' && event.method === 'tools/list')
      );
      check('fixture 收到带 Bearer 的 POST', stats('a').mcpAuthorizedRequests > 0, {
        mcpAuthorizedRequests: stats('a').mcpAuthorizedRequests
      });
      // getTools 是只读接口：tools/list 结果由响应返回，toolList 仍由保存动作写入节点。
      check(
        '节点仍保留工具集定义',
        Array.isArray((await nodeOauth(appA.appId)).toolSet?.toolList)
      );
    });

    /* ---------- 正向 6：runTool 真实 tools/call ---------- */
    await runCase('positive-06-run-tool', 'runTool 通过真实 Bearer 调用 tools/call', async () => {
      await clearRateLimits();
      const res = await runTool(appA.appId);
      const result = apiData(res);
      check('runTool -> HTTP 200', res.status === 200, { status: res.status });
      check('tool 返回 echo 内容', result?.content?.[0]?.text === 'hello-e2e');
    });

    /* ---------- 正向 7：token 过期主动刷新 ---------- */
    await runCase('positive-07-refresh', '短期 token 到期前主动刷新并成功调用', async () => {
      await clearRateLimits();
      fixture.control.reset('short');
      const appId = (
        await createApp({
          name: `E2E short ${Date.now()}`,
          url: fixture.control.mcpUrl('short'),
          clientMode: 'auto',
          scope: 'mcp:tools'
        })
      ).appId;
      const flow = await completeAuthorization(appId);
      check('short 授权成功', flow.callback?.oauth === 'success', {
        oauth: flow.callback?.oauth
      });
      fixture.control.reset('short');
      const before = stats('short');
      const res = await runTool(appId);
      const counters = stats('short');
      check('runTool -> HTTP 200（刷新后）', res.status === 200, { status: res.status });
      check('刷新次数 = 1', counters.refresh === 1, { refresh: counters.refresh });
      check('未重复交换 code', counters.tokenExchange === 0);
      check('result 内容正确', apiData(res)?.content?.[0]?.text === 'hello-e2e');
      note(`refresh before/after: ${before.refresh}`);
    });

    /* ---------- 正向 8：401 → 强制刷新一次 + 重试成功 ---------- */
    await runCase('positive-08-401-single-retry', 'MCP 401 → 强制刷新一次 → 重试成功', async () => {
      await clearRateLimits();
      fixture.control.expireAccessTokens('a');
      fixture.control.reset('a');
      const res = await runTool(appA.appId);
      const counters = stats('a');
      check('runTool -> HTTP 200', res.status === 200, { status: res.status });
      check('fixture 记录 1 次 401', counters.mcp401 === 1, { mcp401: counters.mcp401 });
      check('强制刷新恰好 1 次', counters.refresh === 1, { refresh: counters.refresh });
      check('重试使用新 token 成功', counters.mcpAuthorizedRequests >= 1);
      // Streamable HTTP 在初始化成功后会打开一次 GET SSE 流；fixture 返回 405，
      // SDK 静默处理。这不是“401 后降级到 SSE”，因此只记录次数。
      note(`mcpGets after successful call: ${counters.mcpGets} (normal SSE probe, 405)`);
      check('工具结果正确', apiData(res)?.content?.[0]?.text === 'hello-e2e');
    });

    /* ---------- 正向 9：始终 401 → 只重试一次、不降级 SSE ---------- */
    await runCase('positive-09-always-401', '始终 401：刷新 1 次、重试 1 次、无 SSE、返回 reauth', async () => {
      await clearRateLimits();
      fixture.control.setMcpMode('a', 'always401');
      fixture.control.reset('a');
      fixture.control.setMcpMode('a', 'always401');
      const res = await runTool(appA.appId);
      const counters = stats('a');
      check('runTool 非 2xx', res.status >= 400, { status: res.status });
      check('恰好两次 401（首调 + 一次重试）', counters.mcp401 === 2, { mcp401: counters.mcp401 });
      check('只刷新 1 次', counters.refresh === 1, { refresh: counters.refresh });
      check('没有第三次请求', counters.mcp401 + counters.mcpAuthorizedRequests === 2, {
        total: counters.mcp401 + counters.mcpAuthorizedRequests
      });
      check('未降级 SSE（GET 次数 0）', counters.mcpGets === 0, { mcpGets: counters.mcpGets });
      check(
        '运行期错误来自“重试后仍 401”路径',
        /rejected the refreshed token/i.test(res.text),
        { httpStatus: res.status, body: res.text.slice(0, 240) }
      );
      note(
        '契约差异：runTool 直接返回 HTTP 500 + message，未携带 oauthCode=mcp_oauth_reauth_required（NextAPI 通用错误映射）。'
      );
      fixture.control.setMcpMode('a', 'ok');
      // 恢复：刷新后的 token 在 fixture 中仍有效，重新走一次正常调用。
      fixture.control.setMcpMode('a', 'ok');
    });

    /* ---------- 正向 10：disconnect ---------- */
    await runCase('positive-10-disconnect', 'disconnect：清 token + 尽力撤销 + status=reauth_required', async () => {
      await clearRateLimits();
      fixture.control.setMcpMode('a', 'ok');
      const before = stats('a');
      const res = await api('/api/core/app/mcpTools/oauth/disconnect', {
        method: 'POST',
        token: sessionToken,
        body: { appId: appA.appId, confirm: true }
      });
      check('disconnect -> HTTP 200', res.status === 200, { status: res.status });
      check('disconnected=true', res.json?.disconnected === true);
      check('revoked=true（fixture 收到 RFC 7009）', res.json?.revoked === true, {
        revokeDelta: stats('a').revoke - before.revoke
      });
      check('fixture revoke 被调用', stats('a').revoke > before.revoke);
      const { oauth } = await nodeOauth(appA.appId);
      check('节点 token 已清除', oauth?.token === undefined);
      const { status } = await statusOf(appA.appId);
      check('status=reauth_required', status?.state === 'reauth_required', {
        state: status?.state
      });
      check('hasAccessToken=false', status?.hasAccessToken === false);
      const countersBefore = stats('a');
      const denied = await runTool(appA.appId);
      check('断开后运行期立即失败（不回退 header）', denied.status >= 400, {
        status: denied.status
      });
      check('断开后无新的 MCP 授权请求', stats('a').mcpAuthorizedRequests === countersBefore.mcpAuthorizedRequests);
    });

    /* ---------- 正向 11：DCR 恰好 1 次 + reset 注销 ---------- */
    const appB = {};
    await runCase('positive-11-dcr-reset', 'DCR 仅注册一次；reset 清空 client/server 并 RFC 7592 注销', async () => {
      await clearRateLimits();
      fixture.control.reset('b');
      const { res, appId } = await createApp({
        name: `E2E DCR ${Date.now()}`,
        url: fixture.control.mcpUrl('b'),
        clientMode: 'auto',
        scope: 'mcp:tools'
      });
      check('create -> HTTP 200', res.status === 200, { status: res.status });
      appB.appId = appId;
      const started = await startOAuth(appId, { clientMode: 'auto', scope: 'mcp:tools' });
      appB.start = started;
      check('clientSource=dcr', started.body?.clientSource === 'dcr', {
        clientSource: started.body?.clientSource
      });
      check('fixture /register 恰好 1 次', stats('b').register === 1, { register: stats('b').register });
      const { oauth } = await nodeOauth(appId);
      check('节点保存 DCR clientId', !!oauth?.client?.clientId);
      check('节点保存 registration_client_uri', !!oauth?.client?.registrationClientUri);

      const authorize = await openAuthorizeUrl(started.body.authorizationUrl);
      const outcome = await doCallback({
        state: authorize.state,
        code: authorize.code,
        iss: authorize.iss,
        cookie: `${started.cookieName}=${started.cookieValue}`
      });
      check('DCR 授权回调成功', outcome.oauth === 'success', { oauth: outcome.oauth });
      const toolsRes = await getTools(appId);
      check('DCR 授权后可取工具', toolsRes.status === 200, { status: toolsRes.status });

      const disconnect = await api('/api/core/app/mcpTools/oauth/disconnect', {
        method: 'POST',
        token: sessionToken,
        body: { appId, confirm: true }
      });
      check('disconnect -> 200', disconnect.status === 200);
      check('disconnect revoked=true', disconnect.json?.revoked === true);
      const afterDisconnect = await statusOf(appId);
      check('disconnect 后 status=reauth_required', afterDisconnect.status?.state === 'reauth_required', {
        state: afterDisconnect.status?.state
      });

      const deregisterBefore = stats('b').deregister;
      const reset = await api('/api/core/app/mcpTools/oauth/client/reset', {
        method: 'POST',
        token: sessionToken,
        body: { appId, confirm: true }
      });
      check('reset -> HTTP 200', reset.status === 200, { status: reset.status });
      check('reset reset=true', reset.json?.reset === true);
      check('reset deregistered=true', reset.json?.deregistered === true, {
        deregisterDelta: stats('b').deregister - deregisterBefore
      });
      check('fixture 收到 RFC 7592 DELETE', stats('b').deregister === deregisterBefore + 1);
      const cleared = await nodeOauth(appId);
      check('reset 后 client 清除', cleared.oauth?.client === undefined);
      check('reset 后 token 清除', cleared.oauth?.token === undefined);
      check('reset 后 server 清除', cleared.oauth?.server === undefined);
      const afterReset = await statusOf(appId);
      check('reset 后 status=client_missing', afterReset.status?.state === 'client_missing', {
        state: afterReset.status?.state
      });
    });

    /* ---------- 正向 12：C 场景（DCR 拒绝）manual 兜底可完成授权 ---------- */
    await runCase('positive-12-manual-fallback', 'DCR 拒绝后 auto 自动使用 manual client 完成授权', async () => {
      await clearRateLimits();
      fixture.control.reset('c');
      const { appId } = await createApp({
        name: `E2E manual ${Date.now()}`,
        url: fixture.control.mcpUrl('c'),
        clientMode: 'auto',
        scope: 'mcp:tools'
      });
      const flow = await completeAuthorization(appId, {
        clientMode: 'auto',
        scope: 'mcp:tools',
        manualClient: { clientId: 'manual-client', tokenEndpointAuthMethod: 'none' }
      });
      check('start -> HTTP 200（未中断）', flow.start.res.status === 200, {
        status: flow.start.res.status
      });
      check('clientSource=manual', flow.start.body?.clientSource === 'manual', {
        clientSource: flow.start.body?.clientSource
      });
      check('DCR 被尝试且失败 1 次', stats('c').register === 1, { register: stats('c').register });
      check('授权回调成功', flow.callback?.oauth === 'success', { oauth: flow.callback?.oauth });
      const toolsRes = await getTools(appId);
      check('manual client 可正常调用 tools/list', toolsRes.status === 200, {
        status: toolsRes.status
      });
      check('代码交换使用 manual client', stats('c').tokenExchange === 1);
    });

    /* ---------- 正向 13：C 场景无 manual → 明确 registration_rejected ---------- */
    await runCase('positive-13-no-manual', 'C 场景未提供 manual → registration_rejected（不落库）', async () => {
      await clearRateLimits();
      fixture.control.reset('c');
      const { appId } = await createApp({
        name: `E2E c-fail ${Date.now()}`,
        url: fixture.control.mcpUrl('c'),
        clientMode: 'auto',
        scope: 'mcp:tools'
      });
      const started = await startOAuth(appId, { clientMode: 'auto', scope: 'mcp:tools' });
      check('start -> HTTP 400', started.res.status === 400, { status: started.res.status });
      check('oauthCode=registration_rejected',
        started.body?.data?.oauthCode === 'mcp_oauth_registration_rejected',
        { oauthCode: started.body?.data?.oauthCode }
      );
      check('未下发授权 URL', started.body?.authorizationUrl === undefined);
      check('未写 state 台账', (await pendingStates(appId)) === 0);
    });

    /* ---------- 正向 14：legacy clientMode 归一化 ---------- */
    await runCase('positive-14-normalize', 'start body 传 cimd/dcr 均按 auto 处理', async () => {
      await clearRateLimits();
      fixture.control.reset('a');
      const normA = await createApp({
        name: `E2E legacy-cimd ${Date.now()}`,
        url: fixture.control.mcpUrl('a'),
        clientMode: 'cimd'
      });
      const { oauth: storedOauth } = await nodeOauth(normA.appId);
      check('create 后节点 clientMode=auto', storedOauth?.clientMode === 'auto', {
        clientMode: storedOauth?.clientMode
      });
      const startA = await startOAuth(normA.appId, { clientMode: 'dcr', scope: 'mcp:tools' });
      check('start(clientMode=dcr) 响应 clientMode=auto', startA.body?.clientMode === 'auto', {
        clientMode: startA.body?.clientMode
      });
      check('A 场景仍选 CIMD', startA.body?.clientSource === 'cimd', {
        clientSource: startA.body?.clientSource
      });
      check('A 场景 DCR = 0', stats('a').register === 0, { register: stats('a').register });

      await clearRateLimits();
      fixture.control.reset('b');
      const normB = await createApp({
        name: `E2E legacy-dcr ${Date.now()}`,
        url: fixture.control.mcpUrl('b'),
        clientMode: 'dcr'
      });
      const startB = await startOAuth(normB.appId, { clientMode: 'cimd', scope: 'mcp:tools' });
      check('start(clientMode=cimd) 响应 clientMode=auto', startB.body?.clientMode === 'auto', {
        clientMode: startB.body?.clientMode
      });
      check('B 场景选 DCR', startB.body?.clientSource === 'dcr', {
        clientSource: startB.body?.clientSource
      });
      check('B 场景 /register 恰好 1 次', stats('b').register === 1, { register: stats('b').register });
    });

    /* ---------- 负向 15：state 重放 / Cookie 绑定 / issuer ---------- */
    await runCase('negative-15-state-cookie-issuer', 'state 重放、Cookie 绑定、issuer 不一致均被拒绝', async () => {
      await clearRateLimits();
      fixture.control.reset('b');

      // (a) 首次成功 + 重放
      const replayApp = await createApp({
        name: `E2E replay ${Date.now()}`,
        url: fixture.control.mcpUrl('b'),
        clientMode: 'auto',
        scope: 'mcp:tools'
      });
      const start = await startOAuth(replayApp.appId, { clientMode: 'auto' });
      const authorize = await openAuthorizeUrl(start.body.authorizationUrl);
      const cookie = `${start.cookieName}=${start.cookieValue}`;
      const first = await doCallback({ state: authorize.state, code: authorize.code, cookie });
      check('首次回调成功', first.oauth === 'success');
      const replay = await doCallback({ state: authorize.state, code: authorize.code, cookie });
      check('重放回调被拒绝（302 error）', replay.redirected && replay.oauth === 'error');
      check('错误码=state_replayed', replay.code === 'mcp_oauth_state_replayed', {
        code: replay.code
      });

      // (b) 缺少绑定 Cookie
      await clearRateLimits();
      const missingApp = await createApp({
        name: `E2E cookie-missing ${Date.now()}`,
        url: fixture.control.mcpUrl('b'),
        clientMode: 'auto'
      });
      const missingStart = await startOAuth(missingApp.appId, { clientMode: 'auto' });
      const missingAuth = await openAuthorizeUrl(missingStart.body.authorizationUrl);
      const missing = await doCallback({
        state: missingAuth.state,
        code: missingAuth.code
      });
      check('缺少 Cookie → 302 error', missing.redirected && missing.oauth === 'error');
      check('错误码=state_cookie_missing', missing.code === 'mcp_oauth_state_cookie_missing', {
        code: missing.code
      });

      // (c) Cookie 值不匹配
      const mismatchApp = await createApp({
        name: `E2E cookie-mismatch ${Date.now()}`,
        url: fixture.control.mcpUrl('b'),
        clientMode: 'auto'
      });
      const mismatchStart = await startOAuth(mismatchApp.appId, { clientMode: 'auto' });
      const mismatchAuth = await openAuthorizeUrl(mismatchStart.body.authorizationUrl);
      const mismatch = await doCallback({
        state: mismatchAuth.state,
        code: mismatchAuth.code,
        cookie: `${mismatchStart.cookieName}=not-the-issued-value`
      });
      check('Cookie 不匹配 → 302 error', mismatch.redirected && mismatch.oauth === 'error');
      check('错误码=state_binding_mismatch', mismatch.code === 'mcp_oauth_state_binding_mismatch', {
        code: mismatch.code
      });

      // (d) issuer 不一致
      const issuerApp = await createApp({
        name: `E2E issuer ${Date.now()}`,
        url: fixture.control.mcpUrl('b'),
        clientMode: 'auto'
      });
      const issuerStart = await startOAuth(issuerApp.appId, { clientMode: 'auto' });
      const issuerAuth = await openAuthorizeUrl(issuerStart.body.authorizationUrl);
      const issuer = await doCallback({
        state: issuerAuth.state,
        code: issuerAuth.code,
        iss: 'https://evil.example',
        cookie: `${issuerStart.cookieName}=${issuerStart.cookieValue}`
      });
      check('iss 不一致 → 302 error', issuer.redirected && issuer.oauth === 'error');
      check('错误码=issuer_mismatch', issuer.code === 'mcp_oauth_issuer_mismatch', {
        code: issuer.code
      });
      check('iss 不一致未写入 token', (await nodeOauth(issuerApp.appId)).oauth?.token === undefined);
    });

    /* ---------- 负向 16：scope 扩大 ---------- */
    await runCase('negative-16-scope-widen', 'AS 扩大 scope → scope_widened，凭据不落库', async () => {
      await clearRateLimits();
      fixture.control.reset('widen');
      const { appId } = await createApp({
        name: `E2E widen ${Date.now()}`,
        url: fixture.control.mcpUrl('widen'),
        clientMode: 'auto',
        scope: 'mcp:tools'
      });
      const flow = await completeAuthorization(appId, { clientMode: 'auto', scope: 'mcp:tools' });
      check('回调被拒绝（302 error）', flow.callback?.redirected && flow.callback?.oauth === 'error');
      check('错误码=scope_widened', flow.callback?.code === 'mcp_oauth_scope_widened', {
        code: flow.callback?.code
      });
      check('token 未写入', (await nodeOauth(appId)).oauth?.token === undefined);
      check('fixture 完成过一次 code 交换', stats('widen').tokenExchange === 1);
    });

    /* ---------- 负向 17：PRM resource 不匹配 + SSRF ---------- */
    await runCase('negative-17-prm-ssrf', 'PRM resource 不匹配与内网地址均被拒绝', async () => {
      await clearRateLimits();
      fixture.control.reset('prm');
      const prmApp = await createApp({
        name: `E2E prm ${Date.now()}`,
        url: fixture.control.mcpUrl('prm'),
        clientMode: 'auto'
      });
      const prmStart = await startOAuth(prmApp.appId, { clientMode: 'auto' });
      check('PRM mismatch start -> 400', prmStart.res.status === 400, {
        status: prmStart.res.status
      });
      check('oauthCode=prm_resource_mismatch',
        prmStart.body?.data?.oauthCode === 'mcp_oauth_prm_resource_mismatch',
        { oauthCode: prmStart.body?.data?.oauthCode }
      );

      const ssrfCreate = await createApp({
        name: `E2E ssrf-direct ${Date.now()}`,
        url: `http://127.0.0.1:${CFG.fixturePort}/s/b/mcp`,
        clientMode: 'auto'
      });
      check('loopback MCP URL 在 create 即被拒绝', ssrfCreate.res.status >= 400, {
        status: ssrfCreate.res.status,
        reason: /private network|内网/i.test(ssrfCreate.res.text) ? 'private_url' : 'other'
      });
      check('create 未返回 appId', !ssrfCreate.appId);

      const ssrfApp = await createApp({
        name: `E2E ssrf-prm ${Date.now()}`,
        url: fixture.control.mcpUrl('ssrf'),
        clientMode: 'auto'
      });
      const ssrfStart = await startOAuth(ssrfApp.appId, { clientMode: 'auto' });
      check('PRM 指向 127.0.0.1 → start 400', ssrfStart.res.status === 400, {
        status: ssrfStart.res.status
      });
      check('oauthCode=private_url',
        ssrfStart.body?.data?.oauthCode === 'mcp_oauth_private_url',
        { oauthCode: ssrfStart.body?.data?.oauthCode }
      );
      check('SSRF 被拒后未写 state', (await pendingStates(ssrfApp.appId)) === 0);
    });

    /* ---------- 负向 18：无 refresh token ---------- */
    await runCase('negative-18-no-refresh', 'token 即将过期且无 refresh_token → reauth_required，不发无效请求', async () => {
      await clearRateLimits();
      fixture.control.reset('norefresh');
      const { appId } = await createApp({
        name: `E2E norefresh ${Date.now()}`,
        url: fixture.control.mcpUrl('norefresh'),
        clientMode: 'auto',
        scope: 'mcp:tools'
      });
      const flow = await completeAuthorization(appId, { clientMode: 'auto', scope: 'mcp:tools' });
      check('授权成功但无 refresh_token', flow.callback?.oauth === 'success');
      const { oauth } = await nodeOauth(appId);
      check('节点无 refresh_token', !oauth?.token?.secret?.refresh_token);
      fixture.control.reset('norefresh');
      const res = await runTool(appId);
      check('runTool 非 2xx', res.status >= 400, { status: res.status });
      check('未发起 refresh 请求', stats('norefresh').refresh === 0);
      check('未发起任何 token 请求', stats('norefresh').tokenErrors === 0);
      check('fixture 未收到 MCP 调用', stats('norefresh').mcpAuthorizedRequests === 0);
      const { status } = await statusOf(appId);
      check('status=reauth_required', status?.state === 'reauth_required', { state: status?.state });
      check(
        '错误来自“无 refresh token”分支',
        /No refresh token or client configuration/i.test(res.text),
        { httpStatus: res.status, body: res.text.slice(0, 240) }
      );
      note(
        '契约差异：runTool 直接返回 HTTP 500 + message，未携带 oauthCode=mcp_oauth_reauth_required（NextAPI 通用错误映射）。'
      );
    });

    /* ---------- 负向 19：403 insufficient_scope 不刷新 ---------- */
    await runCase('negative-19-insufficient-scope', 'MCP 403 insufficient_scope 直接失败，不刷新、不降级 SSE', async () => {
      await clearRateLimits();
      fixture.control.reset('b');
      const { appId } = await createApp({
        name: `E2E 403 ${Date.now()}`,
        url: fixture.control.mcpUrl('b'),
        clientMode: 'auto',
        scope: 'mcp:tools'
      });
      const flow = await completeAuthorization(appId, { clientMode: 'auto', scope: 'mcp:tools' });
      check('授权成功', flow.callback?.oauth === 'success');
      fixture.control.setMcpMode('b', 'insufficient_scope');
      fixture.control.reset('b');
      fixture.control.setMcpMode('b', 'insufficient_scope');
      const res = await runTool(appId);
      const counters = stats('b');
      check('runTool 非 2xx', res.status >= 400, { status: res.status });
      check('fixture 返回 1 次 403', counters.mcp403 === 1, { mcp403: counters.mcp403 });
      check('未刷新 token', counters.refresh === 0, { refresh: counters.refresh });
      check('未发生 401', counters.mcp401 === 0);
      check('未降级 SSE', counters.mcpGets === 0);
      check(
        '错误包含 insufficient_scope 语义',
        /insufficient|scope/i.test(res.text),
        { body: res.text.slice(0, 240) }
      );
      fixture.control.setMcpMode('b', 'ok');
    });

    /* ---------- 负向 20：headers 隔离 ---------- */
    await runCase('negative-20-headers-isolation', 'headers 模式不读 OAuth；oauth 无 token 不回退 headers', async () => {
      await clearRateLimits();
      fixture.control.reset('b');
      const headersApp = await createApp({
        name: `E2E headers ${Date.now()}`,
        url: fixture.control.mcpUrl('b'),
        authMode: 'headers',
        headerSecret: { authorization: { value: 'Bearer fixture-not-oauth' } },
        toolList: [
          {
            name: 'echo',
            description: 'echo',
            inputSchema: { type: 'object', properties: { text: { type: 'string' } } }
          }
        ]
      });
      check('headers 应用创建成功', headersApp.res.status === 200);
      const { oauth: headersOauth } = await nodeOauth(headersApp.appId);
      check('headers 应用无 oauth 配置', headersOauth === undefined);
      const headersStatus = await statusOf(headersApp.appId);
      check('headers status authMode=headers', headersStatus.status?.authMode === 'headers');
      check('headers state=headers', headersStatus.status?.state === 'headers', {
        state: headersStatus.status?.state
      });
      check('headers 无 access token', headersStatus.status?.hasAccessToken === false);
      check('headers 不可发起 OAuth', headersStatus.status?.canStart === false);

      const oauthNoToken = await createApp({
        name: `E2E oauth-no-token ${Date.now()}`,
        url: fixture.control.mcpUrl('b'),
        clientMode: 'auto'
      });
      fixture.control.reset('b');
      const noTokenStatus = await statusOf(oauthNoToken.appId);
      check('oauth 无 token 时 hasAccessToken=false', noTokenStatus.status?.hasAccessToken === false);
      const denied = await runTool(oauthNoToken.appId);
      check('oauth 无 token runTool 非 2xx', denied.status >= 400, { status: denied.status });
      check('未发起 OAuth 授权/交换', stats('b').authorize === 0 && stats('b').tokenExchange === 0);
      check('未向 MCP 发送任何带凭据请求', stats('b').mcpAuthorizedRequests === 0);
    });
  } finally {
    const summary = {
      schemaVersion: 1,
      design: 'mcp-oauth-v2.4',
      startedAt: cases[0]?.startedAt ?? nowIso(),
      finishedAt: nowIso(),
      appBase: CFG.appBase,
      fixtureBase,
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
      `cases=${summary.summary.cases} assertions=${summary.summary.assertions} ` +
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

    await fixture.close().catch(() => {});
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
  console.error('[e2e] fatal:', error);
  process.exitCode = 1;
});
