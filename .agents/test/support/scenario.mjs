import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { Blocked } from './runtime.mjs';

/** 解析真实 JSON 或 SSE；多行 data、CRLF、中文分块与错误事件均保留。 */
export async function readHttpResult(response) {
  const raw = await response.text();
  const sse = response.headers.get('content-type')?.includes('text/event-stream');
  const events = [];
  let json;
  if (sse) {
    for (const block of raw.replace(/\r\n/g, '\n').split('\n\n').filter(Boolean)) {
      const lines = block.split('\n');
      const value = lines
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).replace(/^ /, ''))
        .join('\n');
      if (!value) continue;
      events.push({
        event:
          lines
            .find((line) => line.startsWith('event:'))
            ?.slice(6)
            .trim() ?? 'message',
        data: value === '[DONE]' ? value : JSON.parse(value)
      });
    }
  } else {
    try {
      json = JSON.parse(raw);
    } catch {
      /* 非 JSON 错误页面由成功/拒绝断言分别处理。 */
    }
  }
  const error =
    response.status >= 400 ||
    Boolean(json?.error) ||
    (json?.code !== undefined && json.code !== 200) ||
    events.some((event) => event.event === 'error' || event.data?.error);
  const text = sse
    ? events
        .flatMap((event) => event.data?.choices ?? [])
        .map((choice) => choice.delta?.content ?? '')
        .join('')
    : json?.choices?.[0]?.message?.content;
  return {
    http: response.status,
    contentType: response.headers.get('content-type'),
    requestId: response.headers.get('x-request-id'),
    json,
    events,
    text,
    error,
    done: events.some((event) => event.data === '[DONE]'),
    raw
  };
}

/** 测试身份和连接只按配置中指定的环境变量读取。 */
export function required(value, label) {
  if (value === undefined || value === null || value === '')
    throw new Blocked('缺少测试配置：' + label);
  return value;
}

/** 复用真实 HTTP 与限定数据库查询；写入只允许显式隔离应用，并经正常 API 回收。 */
export function createScenario(context) {
  const { fixture, observations, run, cleanups } = context;
  const resources = context.resources;
  const secretValues = context.secrets;
  const record = (label, value) =>
    observations.push({ label, value: sanitize(value, secretValues) });
  resources.set('record', record);
  const actor = (name) => required(fixture.actors?.[name], 'actors.' + name);
  const secret = (name) => {
    const value = required(process.env[required(name, '环境变量名')], name);
    secretValues.add(value);
    return value;
  };

  /** 每个请求单独构造凭证，不把认证头、Cookie 或连接串写入取证。 */
  async function request({
    role = 'owner',
    route,
    body,
    method = 'POST',
    keyEnv,
    keyValue,
    kind,
    metadataOnly = false,
    raw = false,
    signal,
    baseUrl = fixture.baseUrl,
    extraHeaders = {}
  }) {
    const identity = actor(role);
    if (kind === 'state') required(identity.stateEnv, role + '.stateEnv');
    const url = new URL(baseUrl.replace(/\/$/, '') + '/' + route.replace(/^\//, ''));
    const headers = { 'content-type': 'application/json', 'fastgpt-web-request': '1' };
    Object.assign(headers, extraHeaders);
    if (kind === 'key' || keyEnv || keyValue || !identity.stateEnv) {
      const value = keyValue ?? secret(keyEnv ?? identity.keyEnv);
      secretValues.add(value);
      headers.Authorization = 'Bearer ' + value;
    } else {
      const state = JSON.parse(await readFile(secret(identity.stateEnv), 'utf8'));
      headers.Cookie = state.cookies
        .filter((cookie) => {
          const domain = cookie.domain.replace(/^\./, '');
          const matchesDomain =
            url.hostname === domain ||
            (cookie.domain.startsWith('.') && url.hostname.endsWith('.' + domain));
          const cookiePath = cookie.path || '/';
          const matchesPath =
            url.pathname === cookiePath ||
            url.pathname.startsWith(cookiePath.endsWith('/') ? cookiePath : cookiePath + '/');
          return (
            matchesDomain &&
            matchesPath &&
            (!cookie.secure || url.protocol === 'https:') &&
            (cookie.expires === -1 || cookie.expires > Date.now() / 1000)
          );
        })
        .map((cookie) => `${cookie.name}=${cookie.value}`)
        .join('; ');
      required(headers.Cookie, identity.stateEnv + ' 中的目标站点 Cookie');
      secretValues.add(headers.Cookie);
      for (const cookie of state.cookies) secretValues.add(cookie.value);
    }
    const response = await fetch(url, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: 'error',
      signal: signal ?? AbortSignal.timeout(120000)
    });
    if (raw) {
      record('HTTP 流连接', {
        method,
        route,
        role,
        body,
        http: response.status,
        contentType: response.headers.get('content-type')
      });
      return response;
    }
    const result = await readHttpResult(response);
    record('HTTP', {
      method,
      route,
      role,
      body,
      response: metadataOnly
        ? {
            http: result.http,
            error: result.error,
            code: result.json?.code,
            statusText: result.json?.statusText
          }
        : result
    });
    return result;
  }

  /** tokenLogin 只用于确认本轮 Cookie 的实际成员；完整账号详情不写入证据。 */
  async function sessionInfo(role) {
    const response = await request({
      role,
      kind: 'state',
      route: '/api/support/user/account/tokenLogin',
      metadataOnly: true
    });
    if (response.error) throw new Blocked(role + ' 登录态失效，不能作为权限拒绝证据');
    const user = success(response);
    const value = { teamId: user?.team?.teamId, tmbId: user?.team?.tmbId };
    record('登录夹具元数据', { role, ...value });
    if (value.teamId !== fixture.teamId || value.tmbId !== actor(role).tmbId)
      throw new Blocked(role + ' 登录态与声明成员不符');
    return value;
  }

  /** 按显式 URI 环境变量复用连接，并在所有业务清理完成后关闭客户端。 */
  async function database(log = false) {
    const name = fixture.mongo?.[log ? 'logUriEnv' : 'uriEnv'] ?? fixture.mongo?.uriEnv;
    const key = 'mongo:' + name;
    if (!resources.has(key)) {
      const uri = secret(name);
      const { MongoClient } = createRequire(
        new URL('../../../packages/service/package.json', import.meta.url)
      )('mongoose').mongo;
      const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
      try {
        await client.connect();
      } catch (error) {
        throw new Blocked('Mongo 测试连接失败：' + error.name);
      }
      resources.set(key, client.db());
      cleanups.unshift(async () => {
        await client.close();
      });
    }
    return resources.get(key);
  }

  /** 仅按显式 ID/Key 核验夹具元数据，不读取密码；Key 不进入观察记录。 */
  async function memberInfo(id) {
    if (!/^[0-9a-f]{24}$/i.test(id ?? '')) throw new Blocked('成员夹具需要真实 ObjectId');
    const { ObjectId } = createRequire(
      new URL('../../../packages/service/package.json', import.meta.url)
    )('mongoose').mongo;
    const value = await (await database())
      .collection('team_members')
      .findOne({ _id: new ObjectId(id) }, { projection: { teamId: 1, status: 1 } });
    record('成员夹具元数据', { id, ...value });
    return value;
  }

  async function appInfo(id) {
    if (!/^[0-9a-f]{24}$/i.test(id ?? '')) throw new Blocked('应用夹具需要真实 ObjectId');
    const { ObjectId } = createRequire(
      new URL('../../../packages/service/package.json', import.meta.url)
    )('mongoose').mongo;
    const value = await (await database())
      .collection('apps')
      .findOne({ _id: new ObjectId(id) }, { projection: { teamId: 1 } });
    record('应用夹具元数据', { id, ...value });
    return value;
  }
  /** 核验 Key 的真实团队、有效成员与代理开关，避免无效凭证冒充权限反例。 */
  async function keyInfo(role) {
    const identity = actor(role);
    const value = await (await database())
      .collection('openapis')
      .findOne(
        { apiKey: secret(identity.keyEnv) },
        { projection: { teamId: 1, tmbId: 1, appId: 1, authProxy: 1 } }
      );
    record('Key 夹具元数据', { role, ...value });
    if (!value || String(value.teamId) !== fixture.teamId || String(value.tmbId) !== identity.tmbId)
      throw new Blocked(role + ' Key 与声明的团队/成员不符');
    if (role === 'proxy' && (!value.authProxy || value.appId))
      throw new Blocked('proxy 必须是开启代理的团队级 Key');
    if (['A', 'N'].includes(role) && value.authProxy)
      throw new Blocked(role + ' 应使用未启用代理的普通 Key');
    const member = await memberInfo(identity.tmbId);
    if (!member || member.status !== 'active' || String(member.teamId) !== fixture.teamId)
      throw new Blocked(role + ' 不是本团队有效成员');
    return value;
  }

  /** 所有读取固定为配置中的团队、显式应用及 chatId 白名单。 */
  async function snapshot(appId, chatIds) {
    assert.ok(chatIds.length && chatIds.every((id) => typeof id === 'string' && id.length));
    const { ObjectId } = createRequire(
      new URL('../../../packages/service/package.json', import.meta.url)
    )('mongoose').mongo;
    const q = {
      teamId: new ObjectId(required(fixture.teamId, 'teamId')),
      appId: new ObjectId(appId),
      chatId: { $in: chatIds }
    };
    const db = await database();
    const logs = await database(true);
    if (fixture.lifecycle?.disposeApps?.includes(appId) && !resources.has('disposable:' + appId)) {
      const app = await db
        .collection('apps')
        .findOne({ _id: q.appId, teamId: q.teamId }, { projection: { name: 1 } });
      if (!app?.name?.startsWith('FG-TEST-'))
        throw new Blocked('可回收应用必须真实存在于测试团队，且名称以 FG-TEST- 开头');
      resources.set('disposable:' + appId, true);
    }
    const value = {
      chats: await db
        .collection('chats')
        .find(q, {
          projection: {
            chatId: 1,
            tmbId: 1,
            outLinkUid: 1,
            source: 1,
            chatGenerateStatus: 1,
            title: 1,
            customTitle: 1,
            hasGoodFeedback: 1,
            updateTime: 1
          }
        })
        .toArray(),
      items: await db
        .collection('chatitems')
        .find(q, { projection: { chatId: 1, dataId: 1, obj: 1, value: 1, errorMsg: 1 } })
        .sort({ _id: 1 })
        .toArray(),
      logs: await logs
        .collection('app_chat_logs')
        .find(q, { projection: { chatId: 1, userId: 1, source: 1, chatItemCount: 1 } })
        .toArray()
    };
    record('Mongo 白名单快照', value);
    return value;
  }

  /** 对话在发出写请求前登记，失败响应和中途异常也会进入统一清理。 */
  function trackChat(appId, chatId) {
    if (!resources.has('disposable:' + appId))
      throw new Blocked('写入前须登记并核验 lifecycle.disposeApps 中的独立 FG-TEST- 应用');
    const key = 'chats:' + appId;
    if (!resources.has(key)) {
      const ids = new Set();
      resources.set(key, ids);
      cleanups.push(async () => {
        const response = await request({
          route: '/api/core/chat/history/batchDelete',
          body: { appId, chatIds: [...ids] }
        });
        success(response);
        await poll(async () => {
          const value = await snapshot(appId, [...ids]);
          assert.equal(value.chats.length + value.items.length, 0);
        });
        // 批量删会话保留 app_chat_logs；只有删除独立应用的正常生命周期才回收统计。
        const deleted = success(
          await request({
            method: 'DELETE',
            route: '/api/core/app/del?appId=' + encodeURIComponent(appId)
          })
        );
        assert.ok(Array.isArray(deleted) && deleted.includes(appId), '应用删除未确认本轮 appId');
        await poll(async () => {
          const value = await snapshot(appId, [...ids]);
          assert.equal(value.chats.length + value.items.length + value.logs.length, 0);
        });
        return { appId, chatIds: [...ids], applicationAndStatisticsDeleted: true };
      });
    }
    resources.get(key).add(chatId);
  }

  async function completion({
    appId = required(fixture.apps?.identity, 'apps.identity'),
    chatId,
    uid,
    role = 'A',
    authProxy,
    version = 'v1',
    stream = false,
    question,
    extra = {},
    baseUrl,
    extraHeaders,
    raw,
    signal,
    kind = 'key'
  }) {
    if (!resources.has('disposable:' + appId)) await snapshot(appId, [chatId]);
    trackChat(appId, chatId);
    if (!resources.has('cleanup-verified:' + appId)) {
      success(
        await request({
          route: '/api/core/chat/history/batchDelete',
          body: { appId, chatIds: [run + '-cleanup-preflight'] }
        })
      );
      resources.set('cleanup-verified:' + appId, true);
    }
    return request({
      role,
      kind,
      raw,
      signal,
      baseUrl,
      extraHeaders,
      route: `/api/${version}/chat/completions`,
      body: {
        appId,
        chatId,
        messages: [{ role: 'user', content: question }],
        detail: true,
        stream,
        ...(uid === undefined ? {} : { customUid: uid }),
        ...(authProxy === undefined ? {} : { authProxy }),
        ...extra
      }
    });
  }
  return {
    fixture,
    run,
    itemId: context.itemId,
    actor,
    secret,
    record,
    request,
    snapshot,
    trackChat,
    completion,
    resources,
    cleanups,
    memberInfo,
    sessionInfo,
    appInfo,
    keyInfo
  };
}

/** 只认真实成功协议；HTTP 200 内业务错误、SSE error 或非 JSON 页面不能算通过。 */
export function success(result) {
  assert.equal(result.error, false, '请求返回 HTTP/业务/SSE 错误');
  assert.equal(result.http, 200);
  if (result.events.length) assert.ok(result.done, 'SSE 缺少 DONE');
  else
    assert.ok(
      result.json && (result.json.code === 200 || Array.isArray(result.json.choices)),
      '缺少业务成功结构'
    );
  return result.json?.data;
}

/** 权限反例必须是已知鉴权错误；参数错误、余额不足和任意 500 均不能冒充权限验证。 */
export function permissionDenied(result) {
  assert.equal(result.error, true);
  assert.ok(
    result.json &&
      (['unAuthApp', 'unAuthChat', 'unAuthorization', 'openapiUnExist', 'openapiUnAuth'].includes(
        result.json.statusText
      ) ||
        [401, 403].includes(result.json.code)),
    '不是已知鉴权拒绝：' +
      JSON.stringify({
        http: result.http,
        code: result.json?.code,
        statusText: result.json?.statusText
      })
  );
}

/** 用观察条件重试读取，保留最后一个断言；不会重复发起业务写请求。 */
export async function poll(observe, timeout = 30000) {
  const end = Date.now() + timeout;
  while (true) {
    try {
      return await observe();
    } catch (error) {
      if (error instanceof Blocked || Date.now() >= end) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

/** 证据中的认证材料脱敏；保留业务 UID、请求与数据库差集用于验收。 */
export function sanitize(value, secrets = new Set()) {
  const ancestors = new Set();
  function visit(value) {
    if (typeof value === 'string') {
      let result = value;
      for (const secret of secrets)
        if (secret.length >= 6) result = result.split(secret).join('[REDACTED]');
      return result.replace(/mongodb(?:\+srv)?:\/\/[^\s"']+/g, '[REDACTED_MONGO_URI]');
    }
    if (value?.toHexString) return value.toHexString();
    if (value instanceof Date) return value.toISOString();
    if (value && typeof value === 'object') {
      if (ancestors.has(value)) return '[Circular]';
      ancestors.add(value);
      const result = Array.isArray(value)
        ? value.map(visit)
        : Object.fromEntries(
            Object.entries(value).map(([key, item]) => [
              key,
              /^(authorization|cookie|set-cookie|password|token|apiKey|ticket)$/i.test(key)
                ? '[REDACTED]'
                : visit(item)
            ])
          );
      ancestors.delete(value);
      return result;
    }
    return value;
  }
  return visit(value);
}
