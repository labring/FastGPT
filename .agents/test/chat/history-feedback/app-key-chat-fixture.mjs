import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { success, poll } from '../../support/scenario.mjs';
import { Blocked } from '../../support/runtime.mjs';
import { getGate } from '../../support/gate.mjs';
import { redisTools } from '../../support/private.mjs';
import { openEventStream } from '../../support/stream.mjs';

export const digest = (value) => createHash('sha256').update(value).digest('hex');

/** 每个场景从真实 API 建立会话；业务参数夹具仅修改本轮消息，不伪造请求成功。 */
export async function chatFixture(w, { key = w.Ka, target = {}, completion = {} } = {}) {
  const chat = await w.completion(key, w.W, completion);
  const rows = chat.items.sort((a, b) => String(a._id).localeCompare(String(b._id)));
  const ai = rows.find((r) => r.obj === 'AI');
  const call = async (route, body, method = 'POST', credential = key) =>
    success(await request(route, body, method, credential));
  const request = (route, body, method = 'POST', credential = key) => {
    body = { ...target, ...body };
    const query = ['GET', 'DELETE'].includes(method) && !route.endsWith('/record/delete');
    return w.c.request({
      role: 'A',
      kind: 'key',
      keyValue: credential.value,
      method,
      route:
        '/api' +
        route +
        (query && body
          ? '?' +
            new URLSearchParams(
              Object.entries(body).map(([k, v]) => [
                k,
                typeof v === 'object' ? JSON.stringify(v) : v
              ])
            )
          : ''),
      body: query ? undefined : body
    });
  };
  return { chat, rows, ai, call, request, chatId: chat.chatId };
}

/** 真实 Mongo 引用关系夹具；不调用向量生成或改变共享知识库，清理限定新 ID。 */
export async function quoteFixture(w, context, f) {
  const datasetId = w.oid(),
    collectionId = w.oid();
  const time = new Date(new Date(f.ai.time).getTime() - 86400000);
  const collections = ['datasets', 'dataset_collections', 'dataset_datas'];
  context.itemFinalizers.push(async () => {
    await w.db.collection('dataset_datas').deleteMany({ teamId: w.teamId, datasetId });
    await w.db.collection('dataset_collections').deleteMany({ teamId: w.teamId, datasetId });
    await w.db.collection('datasets').deleteOne({ _id: datasetId, teamId: w.teamId });
  });
  const identity = { teamId: w.teamId, tmbId: w.oid(w.c.actor('owner').tmbId) };
  await w.db.collection(collections[0]).insertOne({
    _id: datasetId,
    ...identity,
    name: 'FG-TEST-' + w.label('quote'),
    type: 'dataset',
    createTime: time,
    updateTime: time,
    avatar: '/icon/logo.svg',
    intro: '',
    inheritPermission: true
  });
  await w.db.collection(collections[1]).insertOne({
    _id: collectionId,
    ...identity,
    datasetId,
    type: 'virtual',
    name: 'FG-TEST-quote',
    createTime: time,
    updateTime: time
  });
  const data = Array.from({ length: 5 }, (_, index) => ({
    _id: w.oid(),
    ...identity,
    datasetId,
    collectionId,
    chunkIndex: index,
    q: w.label('quote-' + index),
    a: 'FG-TEST answer ' + index,
    updateTime: time
  }));
  await w.db.collection(collections[2]).insertMany(data);
  await w.db
    .collection('chatitems')
    .updateOne({ _id: f.ai._id }, { $set: { citeCollectionIds: [collectionId] } });
  return {
    datasetId: String(datasetId),
    collectionId: String(collectionId),
    data,
    quote: {
      chatId: f.chatId,
      chatItemDataId: f.ai.dataId,
      collectionIdList: [String(collectionId)],
      datasetDataIdList: [String(data[2]._id)]
    },
    full: {
      chatId: f.chatId,
      chatItemDataId: f.ai.dataId,
      collectionId: String(collectionId),
      initialId: String(data[2]._id),
      anchor: 2,
      pageSize: 1
    }
  };
}

/** 在已有 dev 内启动本轮 HTTP barrier，运行真实流和租约；收尾先放行、停止流，再删应用。 */
export async function runningFixture(w, context, proxy) {
  // 多个场景共用一轮 gate；不能替换已经监听的服务所使用的凭证。
  if (!context.resources.has('gate')) {
    const tokenName = 'FASTGPT_TEST_GATE_' + randomBytes(6).toString('hex');
    process.env[tokenName] = randomBytes(24).toString('hex');
    w.c.fixture.gate = { port: 0, bindHost: '127.0.0.1', tokenEnv: tokenName };
    context.finalizers.push(() => {
      delete process.env[tokenName];
    });
  }
  const gate = await getGate(context, w.c),
    redis = await redisTools(context, w.c);
  const { HttpNode468 } = redis.load('packages/global/core/workflow/template/system/http468.ts');
  const { NodeInputKeyEnum } = redis.load('packages/global/core/workflow/constants.ts');
  const prototype = await w.db
    .collection('app_versions')
    .findOne({ appId: w.oid(w.W), isPublish: true }, { sort: { time: -1 } });
  const graph = structuredClone(prototype),
    node = structuredClone(HttpNode468);
  node.nodeId = 'Gate';
  node.position = { x: 150, y: 100 };
  for (const [key, value] of [
    [NodeInputKeyEnum.httpReqUrl, 'http://127.0.0.1:' + gate.address.port + '/wait'],
    [NodeInputKeyEnum.httpTimeout, 100],
    [
      NodeInputKeyEnum.httpHeaders,
      Object.entries(gate.requestHeaders).map(([key, value]) => ({ key, value }))
    ],
    [NodeInputKeyEnum.httpJsonBody, JSON.stringify({ runId: '{{$Start.userChatInput$}}' })]
  ])
    node.inputs.find((i) => i.key === key).value = value;
  graph.nodes.splice(1, 0, node);
  graph.edges = [
    ['Start', 'Gate'],
    ['Gate', 'Reply']
  ].map(([source, target]) => ({
    source,
    target,
    sourceHandle: source + '-source-right',
    targetHandle: target + '-target-left'
  }));
  const appId = await w.app('running-matrix', { graph });
  if (proxy) {
    await w.acl('B', appId, 1);
    await w.acl('A', appId, 0);
  }
  const key = proxy?.key ?? (await w.createKey('owner', appId)),
    question = w.label('barrier'),
    chatId = w.label('running');
  const barrier = gate.register(question),
    streams = [];
  context.itemFinalizers.push(async () => {
    barrier.release();
    await Promise.all(streams.map((s) => s.cancel()));
    await poll(
      async () =>
        assert.equal(await redis.client.get(redis.leaseKey({ sourceId: appId, chatId })), null),
      60000
    );
  });
  const raw = await w.completion(key, appId, {
    raw: true,
    stream: true,
    question,
    chatId,
    ...(proxy
      ? { uid: proxy.tmbId, body: { appId, customUid: undefined, authProxy: proxy.authProxy } }
      : {})
  });
  streams.push(openEventStream(raw.response));
  await barrier.entered();
  return { appId, key, chatId, barrier, streams };
}

/** 正式发布真实 TTS 资源，只使用 dev 已启用模型，不修改系统模型或上游配置。 */
export async function audioFixture(w, context) {
  const catalog = await w.db.collection('ai_default_models').findOne({ scope: 'system' });
  const defaultId = w.c.fixture.appKeys?.ttsModelId ?? catalog?.defaultModelIds?.tts;
  const model = await w.db.collection('ai_models').findOne(
    {
      scope: 'system',
      type: 'tts',
      isActive: true,
      ...(defaultId ? { _id: w.oid(defaultId) } : {})
    },
    { projection: { model: 1, 'config.voices': 1 } }
  );
  if (!model?.config?.voices?.length) throw new Blocked('本地 dev 需要已启用且有音色的 TTS 模型');
  const ttsConfig = {
    type: 'model',
    modelId: String(model._id),
    voice: model.config.voices[0].value,
    speed: 1
  };
  const version = await w.db
    .collection('app_versions')
    .findOne({ appId: w.oid(w.W), isPublish: true }, { sort: { time: -1 } });
  success(
    await w.c.request({
      kind: 'state',
      role: 'owner',
      route: '/api/core/app/version/publish?appId=' + w.W,
      body: {
        nodes: version.nodes,
        edges: version.edges,
        chatConfig: { ...version.chatConfig, ttsConfig },
        isPublish: true,
        versionName: 'FG-TEST audio'
      }
    })
  );
  const input = '这是应用接口测试，批次' + randomBytes(4).toString('hex');
  const cacheQuery = {
    bufferId: model.model + '-' + ttsConfig.voice,
    text: JSON.stringify({ text: input, speed: 1 })
  };
  context.itemFinalizers.push(() => w.db.collection('buffer_tts').deleteMany(cacheQuery));
  return { ttsConfig, input, model, cacheQuery };
}

/** 二进制响应和 multipart 仍使用共享凭证构造，报告只记录音频摘要。 */
export async function audioRequest(
  w,
  a,
  {
    route = '/core/chat/record/getSpeech',
    target = {},
    credential = w.Ka.value,
    kind = 'key',
    patch = {},
    bytes
  } = {}
) {
  const body = route.includes('transcriptions')
    ? { chatId: a.chatId, duration: 2, ...target, ...patch }
    : { ttsConfig: a.ttsConfig, input: a.input, ...target, ...patch };
  let formData;
  if (route.includes('transcriptions')) {
    formData = new FormData();
    formData.set('data', JSON.stringify(body));
    formData.set('file', new Blob([bytes], { type: 'audio/mpeg' }), 'FG-TEST.mp3');
  }
  const response = await w.c.request({
    role: 'A',
    kind,
    keyValue: kind === 'key' ? credential : undefined,
    route: '/api' + route,
    body,
    formData,
    raw: true
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  let json;
  try {
    json = JSON.parse(buffer.toString('utf8'));
  } catch {
    /* 音频本身不写入报告。 */
  }
  const result = {
    http: response.status,
    json,
    events: [],
    error: response.status >= 400 || (json?.code !== undefined && json.code !== 200),
    bytes: buffer,
    hash: digest(buffer)
  };
  w.c.record('音频实际响应', {
    route,
    body,
    http: result.http,
    json,
    byteLength: buffer.length,
    sha256: result.hash
  });
  return result;
}

/** 正常 API 创建已开启代理的个人密钥；仅本轮临时成员在准备时升为 owner，测试前恢复原角色。 */
export async function proxyFixture(w, context) {
  const memberId = w.oid(w.c.actor('A').tmbId);
  const member = await w.db.collection('team_members').findOne({ _id: memberId, teamId: w.teamId });
  let key;
  try {
    await w.db.collection('team_members').updateOne({ _id: memberId }, { $set: { role: 'owner' } });
    key = await w.createKey('A', undefined, { authProxy: true });
  } finally {
    await w.db
      .collection('team_members')
      .updateOne(
        { _id: memberId },
        Object.hasOwn(member, 'role') ? { $set: { role: member.role } } : { $unset: { role: 1 } }
      );
  }
  assert.notEqual((await w.db.collection('team_members').findOne({ _id: memberId })).role, 'owner');
  await w.acl('A', w.W, 0);
  const tmbId = w.c.actor('B').tmbId;
  const authProxy = { tmbId };
  w.c.record('代理准备后实际角色', {
    role: member.role,
    keyId: key.id,
    credentialMember: String(key.tmbId),
    proxyMember: tmbId
  });
  return {
    key,
    tmbId,
    authProxy,
    target: { appId: w.W, authProxy },
    completion: { uid: tmbId, body: { appId: w.W, customUid: undefined, authProxy } }
  };
}
