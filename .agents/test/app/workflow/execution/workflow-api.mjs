import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createScenario, success, poll } from '../../../support/scenario.mjs';
import { workflowDatabase } from './workflow-database.mjs';
import { Blocked } from '../../../support/runtime.mjs';

/** 真实 HTTP 及沙盒链路：只按本轮 chatId 关联供应商记录和持久化详情。 */
export async function runHttpWorkflow(c, { name, graph, variables }) {
  const appId = await c.create(name, graph);
  const chatId = `${c.run}-${name}`;
  const response = await c.complete(appId, {
    chatId,
    question: chatId,
    stream: true,
    extra: { variables }
  });
  success(response);
  const stored = await c.persisted(appId, chatId);
  const rows = stored.rows.map((row) => row.data);
  const echo = rows.find((row) => row.nodeId === 'Echo');
  const observe = rows.find((row) => row.nodeId === 'Observe');
  const reply = rows.find((row) => row.nodeId === 'Reply');
  assert.ok(echo && observe && reply, 'HTTP、沙盒和回复节点均必须实际执行');
  assert.equal(echo.errorText, undefined);
  assert.equal(observe.errorText, undefined);
  const calls = (await c.gateObservations()).filter(
    (item) => item.path === '/echo' && item.query?.runId === chatId
  );
  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(reply.textOutput), observe.customOutputs.observed);
  assert.deepEqual(JSON.parse(response.text.trim()), observe.customOutputs.observed);
  c.record('真实 HTTP 与沙盒链路', { chatId, echo, observe, reply, call: calls[0] });
  return { call: calls[0], echo, observe, reply };
}

/** 通过真实管理 API 创建并发布本轮独立图；绑定后的 JSON 和资源 ID 进入证据。 */
export async function workflowScenario(context) {
  const c = createScenario(context);
  await c.sessionInfo('owner');
  const { db, ObjectId } = await workflowDatabase(context, c);
  const gateUrl = context.fixture.workflowRuntime?.gateUrl;
  async function load(name, bindings = {}) {
    const raw = await readFile(new URL('./fixtures/' + name + '.json', import.meta.url), 'utf8');
    let text = raw;
    const values = { __GATE_URL__: gateUrl, ...bindings };
    for (const [key, value] of Object.entries(values))
      if (value !== undefined) text = text.replaceAll(key, String(value));
    if (/__[A-Z_]+__/.test(text)) throw new Blocked('模板尚未绑定全部真实资源：' + name);
    return JSON.parse(text);
  }
  async function create(name, graph) {
    const appId = success(
      await c.request({
        route: '/api/core/app/create',
        body: { type: 'advanced', name: 'FG-TEST-' + c.run + '-' + name, ...graph }
      })
    );
    assert.match(appId, /^[0-9a-f]{24}$/i);
    context.fixture.lifecycle.disposeApps.push(appId);
    // 在发布前登记，鉴权/资源预检导致发布失败时也必须回收刚创建的草稿。
    context.cleanups.push(async () => {
      if (c.resources.has('chats:' + appId)) return;
      success(await c.request({ method: 'DELETE', route: '/api/core/app/del?appId=' + appId }));
      return { appId, deletedUnusedFixture: true };
    });
    c.record('本轮绑定工作流', { appId, name, graph });
    success(
      await c.request({
        route: '/api/core/app/version/publish?appId=' + appId,
        body: { ...graph, isPublish: true, versionName: 'FG-TEST runtime' }
      })
    );
    return appId;
  }
  async function complete(appId, { chatId, question = c.run, ...options } = {}) {
    return c.completion({
      appId,
      chatId: chatId ?? c.run + '-' + c.itemId,
      role: 'owner',
      kind: 'state',
      version: 'v2',
      question,
      ...options
    });
  }
  async function persisted(appId, chatId) {
    const query = {
      teamId: new ObjectId(c.fixture.teamId),
      sourceType: 'app',
      appId: new ObjectId(appId),
      chatId
    };
    const chats = await db.collection('chats').find(query).toArray();
    const items = await db.collection('chatitems').find(query).sort({ _id: 1 }).toArray();
    const rows = await db.collection('chat_item_responses').find(query).toArray();
    const value = { chats, items, rows };
    c.record('运行精确持久化快照', value);
    return value;
  }
  async function gateObservations() {
    if (!gateUrl) throw new Blocked('缺少本轮受控 HTTP gate 地址');
    const response = await fetch(gateUrl + '/observations', { signal: AbortSignal.timeout(10000) });
    assert.equal(response.status, 200);
    const data = await response.json();
    return data.observations;
  }
  /** 仅选择已在本轮隔离目录中启用的真实模型，不更改共享 Dev 模型配置。 */
  async function activeModel(name) {
    const model = await db
      .collection('ai_models')
      .findOne({ model: name, scope: 'system', isActive: true }, { projection: { model: 1 } });
    if (!model) throw new Blocked('本轮隔离环境缺少已启用模型：' + name);
    const value = { modelId: String(model._id), model: model.model };
    c.record('本轮已授权模型', value);
    return value;
  }
  async function release(runId) {
    const response = await fetch(gateUrl + '/release', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ runId }),
      signal: AbortSignal.timeout(10000)
    });
    assert.equal(response.status, 200);
    const result = await response.json();
    c.record('放行本轮屏障', { runId, ...result });
    return result;
  }
  /** 通过真实聊天预签名与 PUT 上传小文件；仅使用本轮私有 S3 凭证删除精确 key。 */
  async function upload({
    appId,
    chatId,
    role = 'owner',
    filename = 'private.txt',
    content = 'FG-TEST private content',
    contentType = filename.endsWith('.pdf') ? 'application/pdf' : 'text/plain'
  }) {
    const data = success(
      await c.request({
        role,
        kind: 'state',
        route: '/api/core/chat/file/presignChatFilePostUrl',
        metadataOnly: true,
        body: {
          appId,
          chatId,
          filename,
          contentType,
          size: Buffer.byteLength(content)
        }
      })
    );
    assert.equal(data.uploadMode, 'single', '本轮小文件应使用单 PUT');
    context.secrets.add(data.url);
    context.secrets.add(data.previewUrl);
    const uploadUrl = new URL(data.url, c.fixture.baseUrl);
    const env = JSON.parse(
      await readFile(c.secret(c.fixture.privateEnvironment.serviceEnvFileEnv), 'utf8')
    );
    const storage = createRequire(
      new URL('../../../../../sdk/storage/package.json', import.meta.url)
    );
    const { S3Client, DeleteObjectCommand, HeadObjectCommand } = storage('@aws-sdk/client-s3');
    const client = new S3Client({
      endpoint: env.STORAGE_S3_ENDPOINT,
      region: env.STORAGE_REGION ?? 'us-east-1',
      forcePathStyle: true,
      credentials: {
        accessKeyId: env.STORAGE_ACCESS_KEY_ID,
        secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY
      }
    });
    // PUT 可能在服务端成功后才因网络错误失败，因此必须提前登记精确 key 的清理。
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: data.headers,
      body: content,
      signal: AbortSignal.timeout(30000)
    });
    c.record('真实上传 HTTP 状态', { status: response.status, host: uploadUrl.hostname });
    assert.ok(response.ok, `真实 PUT 上传必须成功，HTTP ${response.status}`);
    context.itemFinalizers.push(async () => {
      try {
        await client.send(
          new DeleteObjectCommand({ Bucket: env.STORAGE_PRIVATE_BUCKET, Key: data.key })
        );
        await assert.rejects(
          client.send(new HeadObjectCommand({ Bucket: env.STORAGE_PRIVATE_BUCKET, Key: data.key })),
          (error) => error.$metadata?.httpStatusCode === 404
        );
        c.record('精确对象清理', { key: data.key, deleted: true });
      } finally {
        client.destroy();
      }
    });
    const result = { key: data.key, url: data.previewUrl, name: filename, type: 'document' };
    c.record('真实聊天文件上传', {
      key: data.key,
      name: filename,
      size: Buffer.byteLength(content),
      uploadHttp: response.status
    });
    return result;
  }
  return {
    ...c,
    db,
    ObjectId,
    load,
    create,
    complete,
    persisted,
    gateObservations,
    activeModel,
    release,
    upload,
    poll
  };
}
