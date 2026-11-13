import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile, rm, chmod } from 'node:fs/promises';
import path from 'node:path';
import { createScenario, poll, required, success, permissionDenied } from './scenario.mjs';
import { privateDatabase } from './private.mjs';
import { Blocked } from './runtime.mjs';

// 输入为真实 ACL 角色，不替代服务端权限计算；来源：global/support/permission/{constant,user/constant,app/constant}.ts。
export const roles = { none: 0, manage: 1, write: 2, read: 4, logs: 8, createKey: 32 };

/** 真实服务操作复用 dev 配置，限定本轮团队；凭证经 stdin 传递，进程日志不作为业务证据。 */
export async function appKeyService(context, c, operation, extra = {}) {
  const child = spawn(
    process.execPath,
    [fileURLToPath(new URL('./app-key-service.mjs', import.meta.url))],
    { stdio: ['pipe', 'pipe', 'pipe'] }
  );
  let output = '';
  let stderr = '';
  child.stdout.on('data', (value) => {
    output += value;
  });
  child.stderr.on('data', (value) => {
    stderr += value;
  });
  const timer = setTimeout(() => child.kill('SIGTERM'), 120000);
  child.stdin.end(
    JSON.stringify({
      operation,
      environmentFile: c.secret(
        c.fixture.serviceEnvFileEnv ?? c.fixture.privateEnvironment?.serviceEnvFileEnv
      ),
      teamId: c.fixture.teamId,
      ...extra
    })
  );
  let exitSignal;
  const code = await new Promise((resolve, reject) => {
    child.once('exit', (code, signal) => {
      exitSignal = signal;
      resolve(code);
    });
    child.once('error', reject);
  }).finally(() => clearTimeout(timer));
  const errorCode = stderr.match(/\bERR_[A-Z_]+\b/)?.[0];
  if (code !== 0) c.record('服务进程异常退出', { operation, code, signal: exitSignal, errorCode });
  const errorLine = output.split('\n').find((line) => line.startsWith('FG_TEST_ERROR='));
  const serviceError = errorLine ? JSON.parse(errorLine.slice('FG_TEST_ERROR='.length)) : undefined;
  assert.equal(
    code,
    0,
    'dev 服务操作失败：' +
      (serviceError
        ? serviceError.name + ': ' + serviceError.message
        : (errorCode ?? exitSignal ?? '查看环境依赖'))
  );
  const line = output.split('\n').find((line) => line.startsWith('FG_TEST_RESULT='));
  assert.ok(line, '服务操作没有返回业务验证结果');
  const result = JSON.parse(line.slice('FG_TEST_RESULT='.length));
  c.record('真实服务执行结果', { operation, result });
  return result;
}

/** 每项新建应用/Key；凭证只存内存，权限夹具和清理只涉及本轮 dev 资源 ID。 */
export async function appKeyWorld(context) {
  const c = createScenario(context);
  const { db, ObjectId } = await privateDatabase(context, c);
  const oid = (value) => new ObjectId(value);
  const teamId = oid(c.fixture.teamId);
  // 业务用例会创建多个独立副本；只扩充本轮自建团队的应用夹具容量，不改变 Key 额度。
  if (
    c.fixture.environment === 'local-dev' &&
    c.fixture.ownedResources?.teamIds?.includes(c.fixture.teamId)
  ) {
    await db
      .collection('team_subscriptions')
      .updateOne({ teamId, type: 'standard' }, { $max: { maxApp: 100 } });
    c.record('本轮团队应用夹具容量', { maxApp: 100 });
  }
  for (const role of ['owner', 'A', 'B', 'N']) await c.sessionInfo(role);
  for (const role of ['A', 'B']) {
    await c.keyInfo(role);
    const member = await db.collection('team_members').findOne({ _id: oid(c.actor(role).tmbId) });
    assert.equal(member.status, 'active');
    assert.notEqual(member.role, 'owner', role + ' 不能用团队 owner 代替应用管理员');
  }
  const source = required(
    c.fixture.appKeys?.templateAppId ?? c.fixture.apps?.empty,
    'appKeys.templateAppId'
  );
  const prototype = await db
    .collection('app_versions')
    .findOne({ appId: oid(source), isPublish: true }, { sort: { time: -1 } });
  if (!prototype) throw new Blocked('需要真实已发布的固定回显工作流模板');
  const apps = new Map(),
    keys = [],
    restores = [],
    temporary = [];
  let sequence = 0;
  const startedAt = new Date();
  const label = (name) => `${c.run}-${context.itemId}-${name}-${++sequence}`;
  const keyName = (name) => label(name).slice(-50);
  const logName = c.fixture.mongo.logUriEnv ?? c.fixture.mongo.uriEnv;
  const { MongoClient } = createRequire(
    new URL('../../../packages/service/package.json', import.meta.url)
  )('mongoose').mongo;
  const logClient = await new MongoClient(c.secret(logName)).connect();
  context.cleanups.unshift(() => logClient.close());
  const log = logClient.db();

  /** 初态只写本轮资源；保存原 BSON，清理时逐条还原，不能影响下一验收项。 */
  async function acl(role, resourceId, permission, resourceType = 'app') {
    const query = {
      teamId,
      tmbId: oid(c.actor(role).tmbId),
      resourceType,
      resourceId: resourceId ? oid(resourceId) : null
    };
    const before = await db.collection('resource_permissions').findOne(query);
    if (!resourceId || !apps.has(resourceId))
      restores.push(async () => {
        await db.collection('resource_permissions').deleteMany(query);
        if (before) await db.collection('resource_permissions').insertOne(before);
      });
    await db
      .collection('resource_permissions')
      .updateOne(query, { $set: { permission } }, { upsert: true });
    c.record('角色夹具', { role, resourceId, resourceType, permission });
  }

  /** 所有测试应用由正常创建/发布入口建立；只有这些 ID 可以被本执行器删除。 */
  async function app(name, { role = 'owner', graph = prototype } = {}) {
    const chatConfig = { ...graph.chatConfig };
    delete chatConfig._id;
    const config = {
      ...chatConfig,
      fileSelectConfig: { canSelectFile: true, canSelectImg: true, maxFiles: 5, maxFileSize: 5 }
    };
    const id = success(
      await c.request({
        role,
        kind: 'state',
        route: '/api/core/app/create',
        body: {
          type: 'advanced',
          name: 'FG-TEST-' + label(name),
          nodes: graph.nodes,
          edges: graph.edges,
          chatConfig: config
        }
      })
    );
    assert.match(id, /^[a-f\d]{24}$/i);
    const document = await db.collection('apps').findOne({ _id: oid(id) });
    assert.ok(document.name.startsWith('FG-TEST-' + c.run));
    apps.set(id, { teamId: document.teamId, role });
    success(
      await c.request({
        role,
        kind: 'state',
        route: '/api/core/app/version/publish?appId=' + id,
        body: {
          nodes: graph.nodes,
          edges: graph.edges,
          chatConfig: config,
          isPublish: true,
          versionName: 'FG-TEST script'
        }
      })
    );
    return id;
  }

  async function createKey(role, appId, extra = {}) {
    const response = await c.request({
      role,
      kind: 'state',
      metadataOnly: true,
      route: '/api/support/openapi/create',
      body: {
        type: appId ? 'app' : 'personal',
        ...(appId ? { appId } : {}),
        name: keyName('key'),
        ...extra
      }
    });
    const value = success(response);
    assert.equal(typeof value, 'string');
    context.secrets.add(value);
    const row = await db
      .collection('openapis')
      .findOne({ apiKey: value }, { projection: { apiKey: 0 } });
    assert.ok(row);
    const key = { ...row, id: String(row._id), value };
    keys.push(key);
    return key;
  }
  const keySnapshot = async (ids) => {
    const rows = await db
      .collection('openapis')
      .find({ _id: { $in: ids.map(oid) } }, { projection: { apiKey: 0, lastUsedTime: 0 } })
      .sort({ _id: 1 })
      .toArray();
    c.record('Key 白名单快照', rows);
    return rows;
  };
  async function snapshot(appId, chatIds) {
    assert.ok(apps.has(appId), '只允许读取本次显式创建的应用');
    assert.ok(
      chatIds.length && chatIds.every((id) => typeof id === 'string' && id.startsWith(c.run))
    );
    const query = { teamId: apps.get(appId).teamId, appId: oid(appId), chatId: { $in: chatIds } };
    const value = {
      chats: await db.collection('chats').find(query).sort({ _id: 1 }).toArray(),
      items: await db.collection('chatitems').find(query).sort({ _id: 1 }).toArray(),
      logs: await log.collection('app_chat_logs').find(query).sort({ _id: 1 }).toArray()
    };
    c.record('对话白名单快照', { appId, chatIds, ...value });
    return value;
  }
  /** 默认省略 appId，expectedAppId 始终是 Key 的绑定，不从待测响应推导预期。 */
  async function completion(key, appId, options = {}) {
    const chatId = options.chatId ?? label('chat'),
      question = options.question ?? label('question');
    const uid = options.uid ?? c.run + '-user';
    const request = {
      chatId,
      customUid: uid,
      messages: [{ role: 'user', content: question }],
      stream: options.stream ?? false,
      detail: true,
      ...options.body
    };
    const response = await c.request({
      role: 'A',
      kind: 'key',
      keyValue: options.credential ?? key.value,
      route: '/api/' + (options.version ?? 'v2') + '/chat/completions',
      body: request,
      ...(options.raw ? { raw: true, extraHeaders: { 'x-fastgpt-stream-resume': '1' } } : {})
    });
    if (options.raw) return { response, chatId, question, uid };
    success(response);
    assert.equal(
      response.text,
      required(c.fixture.echoTemplate, 'echoTemplate')
        .replaceAll('{{question}}', question)
        .replaceAll('{{userId}}', uid)
    );
    const value = await poll(async () => {
      const current = await snapshot(appId, [chatId]);
      assert.equal(current.chats.length, 1);
      assert.equal(current.items.length, (options.round ?? 1) * 2);
      assert.equal(current.logs.length, 1);
      // 同一统计桶保留首轮使用者；Key 交接后的默认身份可改变本轮鉴权成员。
      assert.equal(current.logs[0].userId, options.bucketUserId ?? uid);
      assert.equal(current.logs[0].chatItemCount, options.round ?? 1);
      return current;
    });
    return { response, chatId, question, uid, ...value };
  }
  async function keyRequest(key, route, body, method = 'POST') {
    return c.request({ role: 'A', kind: 'key', keyValue: key.value, route, body, method });
  }
  async function denied(response, validation = false) {
    if (validation) {
      assert.equal(response.http, 400);
      assert.equal(response.json?.code, 400);
    } else if (response.json?.statusText === 'unAuthApiKey') assert.equal(response.error, true);
    else permissionDenied(response);
  }

  /** 外域资源是真实第二团队和登录会话，不用不存在 ID 冒充跨团队校验。 */
  async function foreignApp() {
    const foreignTeam = new ObjectId(),
      userId = new ObjectId(),
      tmbId = new ObjectId();
    const password = randomBytes(24).toString('hex'),
      hash = (v) => createHash('sha256').update(v).digest('hex');
    context.secrets.add(password);
    const username = 'FG-TEST-' + label('foreign') + '-' + randomBytes(6).toString('hex');
    const stateEnv = 'FASTGPT_TEST_FOREIGN_' + randomBytes(6).toString('hex');
    const privatePath = path.join(
      path.dirname(
        c.secret(c.fixture.serviceEnvFileEnv ?? c.fixture.privateEnvironment?.serviceEnvFileEnv)
      ),
      stateEnv + '.json'
    );
    const role = 'foreign-' + context.itemId;
    temporary.push(async () => {
      const state = await readFile(privatePath, 'utf8').catch(() => undefined);
      if (state) {
        await fetch(c.fixture.baseUrl + '/api/support/user/account/loginout', {
          headers: {
            Cookie: JSON.parse(state)
              .cookies.map((cookie) => `${cookie.name}=${cookie.value}`)
              .join('; ')
          }
        });
      }
      await rm(privatePath, { force: true });
      delete process.env[stateEnv];
      delete c.fixture.actors[role];
      for (const collection of [
        'resource_permissions',
        'team_member_groups',
        'team_subscriptions',
        'usages',
        'usage_items',
        'team_orgs',
        'team_org_members'
      ]) {
        await db.collection(collection).deleteMany({ teamId: foreignTeam });
      }
      await db.collection('team_group_members').deleteMany({ tmbId });
      await log.collection('operationlogs').deleteMany({ teamId: foreignTeam });
      await db.collection('users').deleteOne({ _id: userId });
      await db.collection('team_members').deleteOne({ _id: tmbId });
      await db.collection('teams').deleteOne({ _id: foreignTeam });
    });
    await db.collection('users').insertOne({
      _id: userId,
      username,
      password: hash(hash(password)),
      status: 'active',
      language: 'zh-CN',
      lastLoginTmbId: tmbId
    });
    await db.collection('teams').insertOne({
      _id: foreignTeam,
      ownerId: userId,
      name: username,
      balance: 1000000,
      createTime: new Date()
    });
    await db.collection('team_members').insertOne({
      _id: tmbId,
      userId,
      teamId: foreignTeam,
      name: username,
      status: 'active',
      role: 'owner',
      defaultTeam: true
    });
    const { request } = createRequire(new URL('../../../package.json', import.meta.url))(
      '@playwright/test'
    );
    const session = await request.newContext({
      baseURL: c.fixture.baseUrl,
      extraHTTPHeaders: { 'fastgpt-web-request': '1' }
    });
    try {
      const pre = await (
        await session.get(
          '/api/support/user/account/preLogin?username=' + encodeURIComponent(username)
        )
      ).json();
      const login = await (
        await session.post('/api/support/user/account/loginByPassword', {
          data: { username, password: hash(password), code: pre.data?.code, language: 'zh-CN' }
        })
      ).json();
      assert.equal(login.code, 200, '第二团队账号必须实际登录成功');
      await session.storageState({ path: privatePath });
      await chmod(privatePath, 0o600);
    } finally {
      await session.dispose();
    }
    process.env[stateEnv] = privatePath;
    c.fixture.actors[role] = { tmbId: String(tmbId), stateEnv };
    const id = await app('foreign', { role });
    const key = await createKey(role, id);
    return { appId: id, key, role, teamId: String(foreignTeam) };
  }
  context.itemFinalizers.push(async () => {
    const errors = [];
    // 尽可能完成全部清理；一个失败不能阻止其他应用、凭证和 ACL 的回收。
    for (const [id, entry] of [...apps].reverse()) {
      try {
        const sandboxResources = context.resources.has('sandbox:' + id)
          ? await db
              .collection('agent_sandbox_instances_v3')
              .find(
                { sourceType: 'app', sourceId: id },
                { projection: { sandboxId: 1, sourceId: 1, instanceId: 1, _id: 0 } }
              )
              .toArray()
          : undefined;
        if (sandboxResources) c.record('Sandbox 清理前资源', sandboxResources);
        const current = await db.collection('apps').findOne({ _id: oid(id) });
        if (current && sandboxResources?.length && c.fixture.environment === 'local-dev') {
          await appKeyService(context, c, 'cleanup-owned-sandbox-app', { appId: id });
        } else if (current && !current.deleteTime) {
          const result = success(
            await c.request({
              role: entry.role,
              kind: 'state',
              method: 'DELETE',
              route: '/api/core/app/del?appId=' + id
            })
          );
          assert.ok(result.includes(id));
        }
        await poll(async () => {
          assert.equal(await db.collection('chats').countDocuments({ appId: oid(id) }), 0);
          assert.equal(await db.collection('chatitems').countDocuments({ appId: oid(id) }), 0);
          assert.equal(await log.collection('app_chat_logs').countDocuments({ appId: oid(id) }), 0);
          assert.equal(
            await db
              .collection('openapis')
              .countDocuments({ appId: { $regex: '^' + id + '$', $options: 'i' } }),
            0
          );
        }, 60000);
        if (sandboxResources)
          await appKeyService(context, c, 'verify-sandbox-cleanup', {
            appId: id,
            resources: sandboxResources
          });
        for (const url of context.resources.get('storage-check:' + id) ?? []) {
          await poll(async () => {
            const r = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(10000) });
            assert.ok([403, 404].includes(r.status), '应用删除后 S3 对象应已回收');
          }, 60000);
        }
        c.record('应用及对话清理', { appId: id, removed: true });
      } catch (error) {
        errors.push(error.message);
      }
    }
    for (const key of keys) {
      try {
        if (await db.collection('openapis').findOne({ _id: oid(key.id) })) {
          const role = Object.keys(c.fixture.actors).find(
            (role) => c.actor(role).tmbId === String(key.tmbId)
          );
          success(
            await c.request({
              role,
              kind: 'state',
              method: 'DELETE',
              route: '/api/support/openapi/delete?id=' + key.id
            })
          );
        }
      } catch (error) {
        errors.push(error.message);
      }
    }
    for (const restore of [...restores].reverse())
      await restore().catch((error) => errors.push(error.message));
    for (const cleanup of [...temporary].reverse())
      await cleanup().catch((error) => errors.push(error.message));
    assert.deepEqual(errors, [], '私有夹具清理必须全部成功');
  });
  const W = await app('bound'),
    X = await app('other');
  for (const role of ['A', 'B']) for (const id of [W, X]) await acl(role, id, roles.manage);
  const Ka = await createKey('A', W),
    Kb = await createKey('B', W),
    Kx = await createKey('B', X);
  return {
    c,
    db,
    log,
    oid,
    teamId,
    startedAt,
    apps,
    keys,
    W,
    X,
    Ka,
    Kb,
    Kx,
    label,
    keyName,
    app,
    acl,
    createKey,
    keySnapshot,
    snapshot,
    completion,
    keyRequest,
    denied,
    foreignApp,
    personal: (role = 'A') => ({
      value: c.secret(c.actor(role).keyEnv),
      tmbId: c.actor(role).tmbId
    })
  };
}
