import assert from 'node:assert/strict';
import { success, permissionDenied, poll } from '../../support/scenario.mjs';
import {
  chatFixture,
  proxyFixture,
  runningFixture,
  audioFixture,
  audioRequest,
  draftFile,
  digest
} from './app-key-chat-fixture.mjs';
import { openEventStream } from '../../support/stream.mjs';
import { redisTools } from '../../support/private.mjs';
import { roles } from '../../support/app-key.mjs';

/** 使用真实 API/存储建立身份对照，字段真值从本轮白名单快照获得。 */
async function userScope(w, context) {
  const f = await chatFixture(w);
  const uid = f.chat.uid;
  const other = await w.completion(w.Kb, w.W, { uid: w.label('U2') });
  const same = await w.completion(w.Kb, w.W, { uid });
  // 不传 customUid 的真实默认成员会话，外部 UID 与成员 ID 相同也不能将其匹配进来。
  const legacyId = w.label('default-member');
  success(
    await w.keyRequest(w.Ka, '/api/v2/chat/completions', {
      chatId: legacyId,
      stream: false,
      messages: [{ role: 'user', content: legacyId }]
    })
  );
  await poll(async () => assert.equal((await w.snapshot(w.W, [legacyId])).items.length, 2));
  const all = [f.chatId, other.chatId, same.chatId, legacyId].sort();
  const list = (customUid) => f.call('/core/chat/history/getHistories', { customUid, pageSize: 1 });
  assert.equal((await list()).total, all.length);
  const page1 = await list(uid);
  assert.equal(page1.total, 2);
  const page2 = await f.call('/core/chat/history/getHistories', {
    customUid: uid,
    offset: 1,
    pageSize: 1
  });
  assert.deepEqual(
    [...page1.list, ...page2.list].map((r) => r.chatId).sort(),
    [f.chatId, same.chatId].sort()
  );
  assert.deepEqual((await list(w.label('unknown'))).list, []);
  assert.deepEqual((await list(w.c.actor('A').tmbId)).list, []);
  const status = await f.call('/core/chat/history/getHistoryStatus', {
    customUid: uid,
    chatIds: all
  });
  assert.deepEqual(status.list.map((r) => r.chatId).sort(), [f.chatId, same.chatId].sort());
  const personal = w.personal();
  await w.acl('A', w.W, roles.manage);
  const own = await f.call(
    '/core/chat/history/getHistories',
    { appId: w.W, customUid: uid },
    'POST',
    personal
  );
  assert.deepEqual(
    own.list.map((r) => r.chatId),
    [f.chatId]
  );
  await draftFile(w, {
    context,
    key: personal,
    target: { appId: w.W },
    chatId: legacyId,
    uid: w.c.actor('A').tmbId
  });
  const draft = await draftFile(w, {
    context,
    key: personal,
    target: { appId: w.W, customUid: uid },
    chatId: f.chatId,
    uid
  });
  await w.denied(
    await w.keyRequest(w.Ka, '/api/core/chat/file/presignDraftChatFilePostUrl', draft)
  );
  await w.acl('A', w.W, roles.none);
  permissionDenied(
    await w.keyRequest(personal, '/api/core/chat/file/presignDraftChatFilePostUrl', draft)
  );

  for (const customUid of [' 客户+/a?=b ', 'x'.repeat(1024)]) {
    const row = await w.completion(w.Ka, w.W, { uid: customUid });
    const found = await list(customUid);
    assert.equal(found.total, 1);
    assert.deepEqual(
      found.list.map((r) => r.chatId),
      [row.chatId]
    );
    assert.deepEqual((await list('!' + customUid.slice(1))).list, []);
  }
  for (const customUid of ['', null, 42, ['user'], 'x'.repeat(1025)]) {
    const result = await f.request('/core/chat/history/getHistories', { customUid });
    assert.equal(result.http, 400);
    assert.ok(result.json?.zodError);
  }
  // 登录态即使是应用 owner，也不能使用 API 使用者参数。
  permissionDenied(
    await w.c.request({
      role: 'owner',
      kind: 'state',
      route: '/api/core/chat/history/getHistories',
      body: { appId: w.W, customUid: uid }
    })
  );
  for (const target of [
    { skillId: w.W },
    { appId: w.W, sourceType: 'workflowBuilder' },
    { appId: w.W, sourceType: 'chatAgentHelper' }
  ]) {
    const result = await f.request('/core/chat/history/getHistories', {
      ...target,
      customUid: uid
    });
    if (result.http === 400) assert.ok(result.json?.zodError);
    else permissionDenied(result);
  }
  const shareId = success(
    await w.c.request({
      role: 'owner',
      kind: 'state',
      route: '/api/support/outLink/create',
      body: { appId: w.W, type: 'share', name: w.label('share'), allowAnonymous: true, app: {} }
    })
  );
  const outLink = await f.request('/core/chat/history/getHistories', {
    customUid: uid,
    outLinkAuthData: { shareId, outLinkUid: uid }
  });
  assert.equal(outLink.http, 400);
  assert.ok(outLink.json?.zodError);

  const redis = await redisTools(context, w.c);
  for (const version of ['v1', 'v2']) {
    const c = await w.completion(w.Ka, w.W, { uid, version });
    const before = await w.snapshot(w.W, [c.chatId]);
    const leaseKey = redis.leaseKey({ sourceId: w.W, chatId: c.chatId });
    await poll(async () => assert.equal(await redis.client.get(leaseKey), null));
    for (const customUid of [other.uid, undefined, null, '']) {
      permissionDenied(
        await w.keyRequest(w.Ka, '/api/' + version + '/chat/completions', {
          chatId: c.chatId,
          customUid,
          stream: false,
          messages: [{ role: 'user', content: 'forbidden' }]
        })
      );
      assert.deepEqual(await w.snapshot(w.W, [c.chatId]), before);
      assert.equal(await redis.client.get(leaseKey), null);
      w.c.record('首次使用者绑定不可更改', {
        version,
        chatId: c.chatId,
        variant:
          customUid === undefined
            ? 'omitted'
            : customUid === null
              ? 'null'
              : customUid === ''
                ? 'empty'
                : 'other-user'
      });
    }
    const defaultBefore = await w.snapshot(w.W, [legacyId]);
    permissionDenied(
      await w.keyRequest(w.Ka, '/api/' + version + '/chat/completions', {
        chatId: legacyId,
        customUid: uid,
        stream: false,
        messages: [{ role: 'user', content: 'cannot-rebind-default' }]
      })
    );
    assert.deepEqual(await w.snapshot(w.W, [legacyId]), defaultBefore);
    await w.completion(w.Ka, w.W, { uid, chatId: c.chatId, version, round: 2 });
  }

  // 首次文件上传先于 Chat 持久化；后续相同用户可读取原文件，不落到 Key 归属成员路径。
  const chatId = w.label('upload-before-chat'),
    bytes = Buffer.from(w.label('file'));
  const post = await f.call('/core/chat/file/presignChatFilePostUrl', {
    customUid: uid,
    chatId,
    filename: 'FG-TEST.txt',
    size: bytes.length,
    contentType: 'text/plain'
  });
  context.secrets.add(post.url);
  assert.ok(post.key.includes(encodeURIComponent(uid)) || post.key.includes(uid));
  assert.ok((await fetch(post.url, { method: 'PUT', headers: post.headers, body: bytes })).ok);
  const preview = await f.call('/core/chat/file/presignChatFileGetUrl', {
    customUid: uid,
    chatId,
    key: post.key
  });
  context.secrets.add(preview);
  const previewResponse = await fetch(preview);
  assert.equal(previewResponse.status, 200);
  assert.equal(digest(Buffer.from(await previewResponse.arrayBuffer())), digest(bytes));
  permissionDenied(
    await f.request('/core/chat/file/presignChatFileGetUrl', {
      customUid: other.uid,
      chatId,
      key: post.key
    })
  );
  await w.completion(w.Ka, w.W, { uid, chatId });
  const url = await f.call('/core/chat/file/presignChatFileGetUrl', {
    customUid: uid,
    chatId,
    key: post.key
  });
  context.secrets.add(url);
  const response = await fetch(url);
  assert.equal(response.status, 200);
  assert.equal(digest(Buffer.from(await response.arrayBuffer())), digest(bytes));
  permissionDenied(
    await f.request('/core/chat/file/presignChatFileGetUrl', {
      customUid: other.uid,
      chatId,
      key: post.key
    })
  );
  w.c.record('使用者范围与首次上传', {
    uid,
    all,
    upload: { key: post.key, sha256: digest(bytes) },
    variants: [
      '个人密钥',
      '应用Key',
      '省略',
      '精确匹配',
      '同值成员ID',
      '分页',
      '状态过滤',
      '1024边界',
      '特殊字符',
      '非法参数',
      'v1/v2续聊'
    ]
  });
  return '精确用户列表/分页/状态与个人密钥约束正确，省略兼容；v1/v2 错 UID 续聊无写入，同 UID 成功；首次上传采用 UID 且真实下载摘要一致';
}

/** 真实运行中拒绝其他 UID 控制；音频和沙盒复用同一会话鉴权，不绕过产品配置。 */
async function runtimeScope(w, context) {
  const proxy = context.itemId === 'D16' ? await proxyFixture(w, context) : undefined;
  const r = await runningFixture(w, context, proxy);
  const uid = proxy?.tmbId ?? w.c.run + '-user',
    wrong = w.label('wrong-user');
  const f = await chatFixture(w, proxy);
  const target = {
    chatId: r.chatId,
    ...(proxy ? { appId: r.appId, authProxy: proxy.authProxy } : { customUid: uid })
  };
  const badIdentity = proxy ? { authProxy: { tmbId: w.c.actor('A').tmbId } } : { customUid: wrong };
  const redis = await redisTools(context, w.c);
  const lease = redis.leaseKey({ sourceId: r.appId, chatId: r.chatId });
  const before = await redis.client.get(lease);
  assert.ok(before);
  for (const [route, method] of [
    ['/core/chat/resume', 'GET'],
    ['/v2/chat/stop', 'POST']
  ]) {
    permissionDenied(await f.request(route, { ...target, ...badIdentity }, method, r.key));
    assert.equal(await redis.client.get(lease), before);
  }
  const response = await w.c.request({
    role: 'A',
    kind: 'key',
    keyValue: r.key.value,
    method: 'GET',
    route:
      '/api/core/chat/resume?' +
      new URLSearchParams(
        Object.entries(target).map(([key, value]) => [
          key,
          typeof value === 'object' ? JSON.stringify(value) : value
        ])
      ),
    raw: true,
    extraHeaders: { Accept: 'text/event-stream' }
  });
  assert.equal(response.status, 200);
  const resumed = openEventStream(response);
  r.streams.push(resumed);
  assert.equal((await f.call('/v2/chat/stop', target, 'POST', r.key)).success, true);
  r.barrier.release();
  await poll(async () => assert.equal(await redis.client.get(lease), null), 60000);
  const end = await resumed.finished;
  assert.equal(end.error, undefined);
  assert.equal(end.done, true);

  const a = { ...(await audioFixture(w, context)), chatId: f.chatId };
  if (proxy) {
    const defaults = await w.db.collection('ai_default_models').findOne({ scope: 'system' });
    const modelId = defaults?.defaultModelIds?.llm;
    assert.ok(modelId, 'dev 需要已配置的默认 LLM');
    const version = await w.db
      .collection('app_versions')
      .findOne({ appId: w.oid(w.W), isPublish: true }, { sort: { time: -1 } });
    success(
      await w.c.request({
        role: 'owner',
        kind: 'state',
        route: '/api/core/app/version/publish?appId=' + w.W,
        body: {
          nodes: version.nodes,
          edges: version.edges,
          chatConfig: {
            ...version.chatConfig,
            questionGuide: { open: true, modelId: String(modelId) }
          },
          isPublish: true,
          versionName: 'FG-TEST question-guide'
        }
      })
    );
    const route = '/core/ai/agent/v2/createQuestionGuide';
    permissionDenied(await f.request(route, { chatId: f.chatId, ...badIdentity }));
    const before = await w.db
      .collection('usages')
      .countDocuments({ teamId: w.teamId, tmbId: w.oid(proxy.tmbId) });
    const suggestions = await f.call(route, { chatId: f.chatId });
    assert.ok(
      Array.isArray(suggestions) && suggestions.every((value) => typeof value === 'string')
    );
    await poll(async () =>
      assert.ok(
        (await w.db
          .collection('usages')
          .countDocuments({ teamId: w.teamId, tmbId: w.oid(proxy.tmbId) })) > before
      )
    );
    w.c.record('代理问题引导真实调用', {
      member: proxy.tmbId,
      modelId: String(modelId),
      suggestions
    });
  }
  const audioIdentity = proxy ? { credential: proxy.key.value, target: proxy.target } : {};
  const goodIdentity = proxy ? {} : { customUid: f.chat.uid };
  const first = await audioRequest(w, a, {
    ...audioIdentity,
    patch: { ...goodIdentity, chatId: f.chatId }
  });
  assert.equal(first.error, false, JSON.stringify(first.json));
  assert.ok(first.bytes.length > 100);
  permissionDenied(
    await audioRequest(w, a, { ...audioIdentity, patch: { ...badIdentity, chatId: f.chatId } })
  );
  const stt = await audioRequest(w, a, {
    ...audioIdentity,
    route: '/v1/audio/transcriptions',
    bytes: first.bytes,
    patch: goodIdentity
  });
  assert.equal(stt.error, false, JSON.stringify(stt.json));
  assert.ok(stt.json?.data?.trim());
  permissionDenied(
    await audioRequest(w, a, {
      ...audioIdentity,
      route: '/v1/audio/transcriptions',
      bytes: first.bytes,
      patch: badIdentity
    })
  );
  for (const [name, payload, method] of [
    ['checkExist', {}, 'POST'],
    ['download', { path: '.' }, 'POST'],
    ['fs/list', { path: '.' }, 'POST'],
    ['getFilePreviewLink', { filePath: 'index.html' }, 'POST'],
    ['upload', { path: 'FG-TEST.txt' }, 'GET']
  ]) {
    // upload 的业务路由固定 POST，二进制流独立构造；错误 UID 在连接沙盒前拒绝。
    const input = { ...proxy?.target, chatId: f.chatId, ...badIdentity, ...payload };
    const result =
      name === 'upload'
        ? await w.c.request({
            role: 'A',
            kind: 'key',
            keyValue: proxy?.key.value ?? w.Ka.value,
            route:
              '/api/core/ai/sandbox/upload?' +
              new URLSearchParams(
                Object.entries(input).map(([key, value]) => [
                  key,
                  typeof value === 'object' ? JSON.stringify(value) : value
                ])
              ),
            body: 'denied',
            method: 'POST'
          })
        : await f.request('/core/ai/sandbox/' + name, input, method);
    permissionDenied(result);
  }
  const disabled = await f.call('/core/ai/sandbox/checkExist', {
    chatId: f.chatId,
    ...goodIdentity
  });
  assert.equal(disabled.exists, false);
  assert.ok(disabled.unavailableReason);
  // 关闭态通过后，再在本轮应用开启真实 Sandbox，校验完整文件链路及实际 namespace。
  const plan = await w.db
    .collection('team_subscriptions')
    .findOne({ teamId: w.teamId, type: 'standard' });
  if (plan) {
    await w.db
      .collection('team_subscriptions')
      .updateOne({ _id: plan._id }, { $set: { enableSandbox: true } });
    context.itemFinalizers.push(() =>
      w.db
        .collection('team_subscriptions')
        .updateOne(
          { _id: plan._id },
          Object.hasOwn(plan, 'enableSandbox')
            ? { $set: { enableSandbox: plan.enableSandbox } }
            : { $unset: { enableSandbox: 1 } }
        )
    );
  }
  const sandboxVersion = await w.db
    .collection('app_versions')
    .findOne({ appId: w.oid(w.W), isPublish: true }, { sort: { time: -1 } });
  await w.db.collection('app_versions').updateOne(
    { _id: sandboxVersion._id },
    {
      $set: {
        nodes: [
          ...sandboxVersion.nodes,
          {
            nodeId: 'FG-TEST-sandbox-capability',
            flowNodeType: 'agent',
            inputs: [
              {
                key: 'useAgentSandbox',
                value: true,
                renderTypeList: ['switch'],
                valueType: 'boolean'
              }
            ],
            outputs: []
          }
        ]
      }
    }
  );
  context.itemFinalizers.push(() =>
    w.db
      .collection('app_versions')
      .updateOne({ _id: sandboxVersion._id }, { $set: { nodes: sandboxVersion.nodes } })
  );
  context.resources.set('sandbox:' + w.W, true);
  const sandboxTarget = {
    ...proxy?.target,
    ...goodIdentity,
    chatId: f.chatId,
    path: w.label('sandbox-user') + '.txt'
  };
  const bytes = Buffer.from(w.label('sandbox-identity'));
  const upload = await fetch(
    w.c.fixture.baseUrl +
      '/api/core/ai/sandbox/upload?' +
      new URLSearchParams(
        Object.entries(sandboxTarget).map(([key, value]) => [
          key,
          typeof value === 'object' ? JSON.stringify(value) : value
        ])
      ),
    {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + (proxy?.key.value ?? w.Ka.value),
        'content-type': 'application/octet-stream'
      },
      body: bytes,
      signal: AbortSignal.timeout(120000)
    }
  );
  const uploaded = await upload.json();
  assert.equal(upload.status, 200);
  assert.equal(uploaded.code, 200);
  assert.equal(uploaded.data.bytesWritten, bytes.length);
  const download = await w.c.request({
    role: 'A',
    kind: 'key',
    keyValue: proxy?.key.value ?? w.Ka.value,
    route: '/api/core/ai/sandbox/download',
    body: sandboxTarget,
    raw: true
  });
  assert.equal(download.status, 200);
  assert.equal(digest(Buffer.from(await download.arrayBuffer())), digest(bytes));
  const instances = await w.db
    .collection('agent_sandbox_instances_v3')
    .find({ sourceType: 'app', sourceId: w.W })
    .toArray();
  assert.deepEqual(
    instances.map((row) => row.userId),
    [proxy?.tmbId ?? f.chat.uid]
  );
  w.c.record('真实 Sandbox 使用者及文件链路', {
    userId: instances[0].userId,
    sourceId: w.W,
    bytes: bytes.length,
    sha256: digest(bytes)
  });
  w.c.record('运行和配套接口身份', {
    appId: r.appId,
    chatId: r.chatId,
    end,
    ttsBytes: first.bytes.length,
    sha256: first.hash,
    stt: stt.json?.data,
    sandbox: disabled
  });
  return '真实运行中错误 UID 无法恢复/停止，正确 UID 完成并释放租约；真实 TTS/STT 成功且错误 UID 拒绝，5 个沙盒入口均在下游前校验用户';
}

export async function runCustomUidCoverage(w, context) {
  return { D12: userScope, D14: runtimeScope, D16: runtimeScope }[context.itemId](w, context);
}
