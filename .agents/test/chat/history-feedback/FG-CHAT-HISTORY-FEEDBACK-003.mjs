import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { runNodeCase, Blocked } from '../../support/runtime.mjs';
import { appKeyWorld, roles } from '../../support/app-key.mjs';
import { success, poll } from '../../support/scenario.mjs';
import { getGate } from '../../support/gate.mjs';
import { openEventStream } from '../../support/stream.mjs';
import { redisTools } from '../../support/private.mjs';

/** 覆盖应用 Key 的实际读写、统计、流和文件链路；每项自行建立独立 D0，允许单独复测。 */
async function execute(context) {
  const w = await appKeyWorld(context),
    { c, W, X, Ka, Kb } = w;
  await w.acl('A', W, roles.none);
  const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
  const query = (route, fields) => route + '?' + new URLSearchParams(fields);
  const call = async (route, body, method = 'POST', key = Ka) =>
    success(await w.keyRequest(key, '/api' + route, body, method));
  const get = (route, fields, key = Ka) => call(query(route, fields), undefined, 'GET', key);
  const dates = () => ({
    dateStart: new Date(w.startedAt.getTime() - 60000).toISOString(),
    dateEnd: new Date(Date.now() + 60000).toISOString()
  });

  /** 四种来源真实产生消息；源身份来自实际调用入口，基线不通过改 Chat.source 伪造。 */
  async function seed(appId = W, a = Ka, b = Kb) {
    const one = await w.completion(a, appId, { uid: c.run + '-u1' });
    const two = await w.completion(b, appId, { uid: c.run + '-u2' });
    const online = w.label('online'),
      shared = w.label('share');
    success(
      await c.request({
        role: 'B',
        kind: 'state',
        route: '/api/v2/chat/completions',
        body: {
          appId,
          chatId: online,
          stream: false,
          messages: [{ role: 'user', content: online }]
        }
      })
    );
    const shareId = success(
      await c.request({
        role: 'owner',
        kind: 'state',
        route: '/api/support/outLink/create',
        body: { appId, type: 'share', name: w.label('channel'), allowAnonymous: true, app: {} }
      })
    );
    success(
      await c.request({
        role: 'owner',
        kind: 'anonymous',
        route: '/api/v2/chat/completions',
        body: {
          chatId: shared,
          outLinkAuthData: { shareId, outLinkUid: c.run + '-guest' },
          stream: false,
          messages: [{ role: 'user', content: shared }]
        }
      })
    );
    const ids = [one.chatId, two.chatId, online, shared];
    const baseline = await poll(async () => {
      const snap = await w.snapshot(appId, ids);
      assert.equal(snap.chats.length, 4);
      assert.equal(snap.items.length, 8);
      assert.equal(snap.logs.length, 4);
      assert.deepEqual(snap.chats.map((row) => row.publishSource.type).sort(), [
        'api',
        'api',
        'online',
        'share'
      ]);
      return snap;
    });
    return { ids, one, two, online, shared, baseline };
  }
  /** CSV 只从实际导出解析，保留逗号、换行和双引号，不用 split 行数代替集合比较。 */
  function csv(text) {
    const rows = [],
      row = [];
    let field = '',
      quoted = false;
    text = text.replace(/^\uFEFF/, '');
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '"') {
        if (quoted && text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = !quoted;
      } else if (!quoted && (ch === ',' || ch === '\n')) {
        row.push(field.replace(/\r$/, ''));
        field = '';
        if (ch === '\n') rows.push(row.splice(0));
      } else field += ch;
    }
    assert.equal(quoted, false, 'CSV 引号未闭合');
    if (field || row.length) {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
    }
    return rows;
  }
  async function exportIds(body, key = Ka) {
    // 产品按鉴权成员限每分钟一次；只读观察窗口结束，不清计数或重放已被限流的导出。
    const redis = await redisTools(context, c);
    const keyspace = redis.load('packages/dal/redis/runtime/keyspace.ts');
    const rateKey = keyspace.toPhysicalRedisKey(
      keyspace.createRedisLogicalKey({
        namespace: 'rate-limit',
        segments: ['member', 'export-chat-logs', 'member', String(key.tmbId)]
      })
    );
    await poll(async () => assert.equal(await redis.client.exists(rateKey), 0), 70000);
    const result = await w.keyRequest(key, '/api/core/app/logs/exportLogs', {
      ...dates(),
      title: 'ID,Details',
      sourcesMap: {},
      logKeys: ['sessionId'],
      ...body
    });
    assert.equal(result.http, 200);
    assert.match(result.contentType, /text\/csv/);
    const rows = csv(result.raw);
    // 导出固定追加 chatDetails，并保留变量列的尾部空列。
    assert.deepEqual(rows[0], ['ID', 'Details', '']);
    assert.ok(rows.slice(1).every((row) => row.length === 3));
    const file = `${context.itemId}-export-${w.label('csv')}.csv`;
    await writeFile(path.join(context.directory, file), result.raw);
    context.attachments.push({ path: file, label: '实际 CSV 导出' });
    return rows
      .slice(1)
      .map((row) => row[0])
      .sort();
  }
  /** 实际 S3 协议上传固定字节，记录摘要；签名 URL 不进入证据，应用清理后验证对象消失。 */
  async function file(key, appId, chatId) {
    const bytes = Buffer.from(w.label('file') + '\n');
    const post = await call(
      '/core/chat/file/presignChatFilePostUrl',
      { chatId, filename: 'FG-TEST.txt', contentType: 'text/plain', size: bytes.length },
      'POST',
      key
    );
    assert.equal(post.uploadMode, 'single');
    context.secrets.add(post.url);
    const uploaded = await fetch(post.url, {
      method: 'PUT',
      headers: post.headers,
      body: bytes,
      signal: AbortSignal.timeout(30000)
    });
    assert.ok(uploaded.ok, 'S3 实际上传失败：' + uploaded.status);
    const url = await call(
      '/core/chat/file/presignChatFileGetUrl',
      { chatId, key: post.key },
      'POST',
      key
    );
    context.secrets.add(url);
    const download = await fetch(url, { signal: AbortSignal.timeout(30000) });
    assert.equal(download.status, 200);
    assert.equal(sha(Buffer.from(await download.arrayBuffer())), sha(bytes));
    const checks = context.resources.get('storage-check:' + appId) ?? [];
    checks.push(url);
    context.resources.set('storage-check:' + appId, checks);
    c.record('真实文件字节核对', {
      appId,
      chatId,
      key: post.key,
      size: bytes.length,
      sha256: sha(bytes)
    });
    return { key: post.key, chatId, bytes };
  }

  if (context.itemId === 'D4') {
    const template = await w.db
      .collection('app_versions')
      .findOne(
        { appId: w.oid(c.fixture.apps.historySwitch), isPublish: true },
        { sort: { time: -1 } }
      );
    if (!template) throw new Blocked('D4 需要已发布的 HTTP gate 工作流 apps.historySwitch');
    const appId = await w.app('runtime', { graph: template });
    await w.acl('A', appId, roles.manage);
    const key = await w.createKey('A', appId);
    await w.acl('A', appId, roles.none);
    const gate = await getGate(context, c),
      redis = await redisTools(context, c),
      question = w.label('gate'),
      chatId = w.label('running');
    const barrier = gate.register(question);
    const streams = [];
    context.itemFinalizers.push(async () => {
      barrier.release();
      await Promise.all(streams.map((s) => s.cancel()));
      await poll(
        async () =>
          assert.equal(await redis.client.get(redis.leaseKey({ sourceId: appId, chatId })), null),
        60000
      );
    });
    const live = await w.completion(key, appId, { raw: true, stream: true, question, chatId });
    const stream = openEventStream(live.response);
    streams.push(stream);
    gate.track(stream.finished);
    await barrier.entered();
    assert.equal((await get('/core/chat/init', { chatId }, key)).chatGenerateStatus, 0);
    const response = await c.request({
      role: 'A',
      kind: 'key',
      keyValue: key.value,
      method: 'GET',
      route: query('/api/core/chat/resume', { chatId }),
      raw: true,
      extraHeaders: { Accept: 'text/event-stream' }
    });
    assert.equal(response.status, 200);
    const resumed = openEventStream(response);
    streams.push(resumed);
    gate.track(resumed.finished);
    assert.equal((await call('/v2/chat/stop', { chatId }, 'POST', key)).success, true);
    barrier.release();
    await stream.cancel();
    await poll(
      async () =>
        assert.equal((await get('/core/chat/init', { chatId }, key)).chatGenerateStatus, 1),
      60000
    );
    const end = await resumed.finished;
    assert.equal(end.error, undefined);
    assert.equal(end.done, true);
    c.record('真实恢复流及停止终态', { events: resumed.events, end });
    success(await w.keyRequest(key, query('/api/core/chat/resume', { chatId }), undefined, 'GET'));
    const snap = await w.snapshot(appId, [chatId]);
    assert.ok(snap.items.some((item) => item.obj === 'AI'));
    return '真实 gate 阻塞时可恢复和停止；观察后台 lease 释放、idle 终态及 AI 消息落库';
  }
  if (context.itemId === 'D5') {
    // 私有团队的真实套餐授予沙盒能力；只调整本次测试库，收尾恢复原字段。
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
      c.record('私有套餐夹具', { id: String(plan._id), enableSandbox: true });
    }
    const first = await w.completion(Ka, W),
      f = await file(Ka, W, first.chatId);
    for (const route of [
      '/core/chat/file/presignChatFilePostUrl',
      '/core/chat/file/presignChatFileGetUrl'
    ])
      await w.denied(
        await w.keyRequest(w.personal(), '/api' + route, {
          appId: W,
          chatId: first.chatId,
          key: f.key,
          filename: 'probe.txt'
        })
      );
    const version = await w.db
      .collection('app_versions')
      .findOne({ appId: w.oid(W), isPublish: true }, { sort: { time: -1 } });
    const entitlement = {
      nodeId: 'FG-TEST-sandbox-capability',
      flowNodeType: 'agent',
      inputs: [
        { key: 'useAgentSandbox', value: true, renderTypeList: ['switch'], valueType: 'boolean' }
      ],
      outputs: []
    };
    await w.db
      .collection('app_versions')
      .updateOne({ _id: version._id }, { $set: { nodes: [...version.nodes, entitlement] } });
    context.itemFinalizers.push(async () =>
      w.db
        .collection('app_versions')
        .updateOne({ _id: version._id }, { $set: { nodes: version.nodes } })
    );
    context.resources.set('sandbox:' + W, true);
    const filePath = w.label('sandbox') + '.txt';
    async function upload(credential, personal = false) {
      const result = await fetch(
        c.fixture.baseUrl +
          query('/api/core/ai/sandbox/upload', {
            ...(personal ? { appId: W } : {}),
            chatId: first.chatId,
            path: filePath
          }),
        {
          method: 'POST',
          headers: {
            authorization: 'Bearer ' + credential,
            'content-type': 'application/octet-stream'
          },
          body: f.bytes,
          signal: AbortSignal.timeout(120000)
        }
      );
      const body = await result.json();
      c.record('沙盒实际上传', { http: result.status, body });
      return { http: result.status, json: body, error: result.status >= 400 || body.code !== 200 };
    }
    assert.equal(success({ ...(await upload(Ka.value)), events: [] }).bytesWritten, f.bytes.length);
    const downloaded = await c.request({
      role: 'A',
      kind: 'key',
      keyValue: Ka.value,
      route: '/api/core/ai/sandbox/download',
      body: { chatId: first.chatId, path: filePath },
      raw: true
    });
    assert.equal(downloaded.status, 200);
    const sandboxBytes = Buffer.from(await downloaded.arrayBuffer());
    assert.equal(sha(sandboxBytes), sha(f.bytes));
    c.record('Sandbox 实际下载摘要', {
      appId: W,
      chatId: first.chatId,
      size: sandboxBytes.length,
      sha256: sha(sandboxBytes)
    });
    await w.denied(await upload(w.personal().value, true));
    await w.db
      .collection('app_versions')
      .updateOne({ _id: version._id }, { $set: { nodes: version.nodes } });
    const disabled = await w.keyRequest(Ka, '/api/core/ai/sandbox/download', {
      chatId: first.chatId,
      path: filePath
    });
    assert.equal(disabled.error, true);
    assert.match(JSON.stringify(disabled.json), /sandbox|沙盒/i);
    return 'S3 与真实 App 沙盒上传/下载字节摘要一致；个人权限与关闭产品态均拒绝，远端沙盒由删除流程清理';
  }

  const d = await seed();
  if (context.itemId === 'D1') {
    const histories = await call('/core/chat/history/getHistories', { pageNum: 1, pageSize: 100 });
    const apiIds = [d.one.chatId, d.two.chatId].sort();
    assert.deepEqual(histories.list.map((row) => row.chatId).sort(), apiIds);
    assert.equal(histories.total, 2);
    for (const source of ['api', 'online']) {
      await w.denied(
        await w.keyRequest(Ka, '/api/core/chat/history/getHistories', { source }),
        true
      );
      const explicit = await call('/core/chat/history/getHistories', { appId: X, source });
      assert.deepEqual(explicit.list.map((row) => row.chatId).sort(), apiIds);
    }
    for (const chatId of d.ids) {
      assert.equal((await get('/core/chat/init', { chatId })).appId, W);
      const fetched = [];
      for (const offset of [0, 1]) {
        const page = await call('/core/chat/record/getPaginationRecords', {
          chatId,
          offset,
          pageSize: 1
        });
        assert.equal(page.total, 2);
        fetched.push(...page.list);
      }
      const stored = d.baseline.items.filter((row) => row.chatId === chatId);
      assert.deepEqual(
        fetched.map((row) => row.obj + ':' + row.dataId).sort(),
        stored.map((row) => row.obj + ':' + row.dataId).sort()
      );
      const ai = fetched.find((row) => row.obj === 'AI');
      assert.ok(JSON.stringify(ai.value).includes(c.run));
      const details = await get('/core/chat/record/getResData', { chatId, dataId: ai.dataId });
      assert.ok(details.some((row) => row.textOutput?.includes(c.run)));
    }
    return '列表固定绑定应用的 API 来源，隐式来源筛选拒绝、显式冲突不能覆盖；按 ID 仍可读取在线/分享会话，分页和消息详情与真实记录一致';
  }
  if (context.itemId === 'D2') {
    const listed = await call('/core/app/logs/list', { ...dates(), pageSize: 100 });
    assert.deepEqual(listed.list.map((row) => row.chatId).sort(), [...d.ids].sort());
    const users = await call('/core/app/logs/getUsers', { ...dates(), pageSize: 100 });
    const groups = new Map();
    for (const row of d.baseline.logs) {
      const id = row.userId + ':' + (row.publishSource?.type ?? row.source);
      const group = groups.get(id) ?? { userId: row.userId, count: 0 };
      group.count++;
      groups.set(id, group);
    }
    assert.deepEqual(
      users.list.map((row) => (row.outLinkUid || row.tmbId) + ':' + row.count).sort(),
      [...groups.values()].map((row) => row.userId + ':' + row.count).sort()
    );
    assert.deepEqual(await exportIds({}), [...d.ids].sort());
    const total = await get('/proApi/core/app/logs/getTotalData', {});
    const chart = await call('/proApi/core/app/logs/getChartData', {
      ...dates(),
      userTimespan: 'day',
      chatTimespan: 'day',
      appTimespan: 'day'
    });
    const sum = (field) => d.baseline.logs.reduce((n, row) => n + (row[field] ?? 0), 0);
    assert.equal(total.totalChats, 4);
    assert.equal(total.totalUsers, new Set(d.baseline.logs.map((row) => row.userId)).size);
    assert.equal(total.totalPoints, sum('totalPoints'));
    assert.equal(
      chart.chatData.reduce((n, bucket) => n + bucket.summary.chatItemCount, 0),
      sum('chatItemCount')
    );
    assert.equal(
      chart.chatData.reduce((n, bucket) => n + bucket.summary.errorCount, 0),
      sum('errorCount')
    );
    for (const route of [
      '/core/app/logs/list',
      '/core/app/logs/getUsers',
      '/core/app/logs/exportLogs'
    ])
      await w.denied(
        await w.keyRequest(w.personal(), '/api' + route, {
          appId: W,
          ...dates(),
          title: 'ID',
          logKeys: ['sessionId'],
          sourcesMap: {}
        })
      );
    return '免 appId 的日志/使用者/CSV/Pro 统计匹配真实桶；个人密钥仍受日志权限限制';
  }
  if (context.itemId === 'D3') {
    const chatId = d.two.chatId,
      initial = d.baseline.chats.find((row) => row.chatId === chatId),
      ai = d.baseline.items.find((row) => row.chatId === chatId && row.obj === 'AI');
    const target = { chatId, dataId: ai.dataId },
      title = w.label('renamed');
    await call('/core/chat/history/updateHistory', { chatId, customTitle: title }, 'PUT');
    assert.equal((await w.db.collection('chats').findOne({ _id: initial._id })).customTitle, title);
    await w.db
      .collection('chats')
      .updateOne({ _id: initial._id }, { $set: { hasBeenRead: false } });
    await call('/core/chat/history/markRead', { chatId });
    assert.equal((await w.db.collection('chats').findOne({ _id: initial._id })).hasBeenRead, true);
    await call('/core/chat/feedback/updateUserFeedback', {
      ...target,
      userGoodFeedback: 'FG-TEST-good'
    });
    assert.equal(
      (await w.db.collection('chatitems').findOne({ _id: ai._id })).userGoodFeedback,
      'FG-TEST-good'
    );
    const datasetObjectId = new (w.oid(W).constructor)();
    const datasetId = String(datasetObjectId);
    const datasetQuery = { teamId: w.teamId, _id: datasetObjectId };
    await w.db.collection('datasets').insertOne({
      ...datasetQuery,
      tmbId: w.oid(c.actor('B').tmbId),
      name: 'FG-TEST-' + w.label('dataset-reference'),
      type: 'dataset',
      createTime: new Date()
    });
    context.itemFinalizers.push(() => w.db.collection('datasets').deleteOne(datasetQuery));
    const datasetBefore = await w.db.collection('datasets').findOne(datasetQuery);
    await call('/core/chat/feedback/adminUpdate', {
      ...target,
      datasetId,
      feedbackDataId: 'FG-TEST-ref',
      q: 'question',
      a: 'answer'
    });
    assert.equal(
      (await w.db.collection('chatitems').findOne({ _id: ai._id })).adminFeedback.dataId,
      'FG-TEST-ref'
    );
    assert.deepEqual(await w.db.collection('datasets').findOne(datasetQuery), datasetBefore);
    await w.db
      .collection('chatitems')
      .updateOne({ _id: ai._id }, { $set: { customFeedbacks: ['FG-TEST-review'] } });
    await call('/core/chat/feedback/closeCustom', { ...target, index: 0 });
    assert.deepEqual(
      (await w.db.collection('chatitems').findOne({ _id: ai._id })).customFeedbacks,
      []
    );
    const after = await w.snapshot(W, [chatId]);
    assert.equal(String(after.chats[0].tmbId), String(initial.tmbId));
    assert.deepEqual(after.chats[0].publishSource, initial.publishSource);
    assert.ok(!after.items.find((row) => row.obj === 'Human').adminFeedback);
    await get('/core/chat/init', { chatId });
    const logs = await call('/core/app/logs/list', {
      ...dates(),
      pageSize: 100,
      chatSearch: chatId
    });
    assert.equal(logs.list[0].customFeedbacksCount, 0);
    return '跨作者标题/已读/用户及管理反馈逐步落库；关闭自定义反馈完成事务和统计，身份/来源及知识库保持原值';
  }
  if (context.itemId === 'D6') {
    const foreign = await w.foreignApp(),
      cx = await w.completion(w.Kx, X),
      cy = await w.completion(foreign.key, foreign.appId);
    const ownFile = await file(Ka, W, d.one.chatId),
      xFile = await file(w.Kx, X, cx.chatId),
      yFile = await file(foreign.key, foreign.appId, cy.chatId);
    const before = [await w.snapshot(X, [cx.chatId]), await w.snapshot(foreign.appId, [cy.chatId])];
    for (const [appId, item] of [
      [X, cx],
      [foreign.appId, cy]
    ]) {
      assert.equal((await get('/core/chat/init', { appId, chatId: item.chatId })).appId, W);
      await call(
        '/core/chat/history/updateHistory',
        { appId, chatId: item.chatId, customTitle: 'forbidden' },
        'PUT'
      );
      await call(
        query('/core/chat/history/delHistory', { appId, chatId: item.chatId }),
        undefined,
        'DELETE'
      );
      assert.deepEqual(await exportIds({ appId }), [...d.ids].sort());
      const records = await call('/core/chat/record/getPaginationRecords', {
        appId: W,
        chatId: item.chatId,
        pageSize: 100
      });
      assert.deepEqual(records.list, []);
      const dataId = item.items.find((row) => row.obj === 'AI').dataId;
      assert.deepEqual(
        await get('/core/chat/record/getResData', { appId: W, chatId: d.two.chatId, dataId }),
        []
      );
      await call(
        '/core/chat/record/delete',
        { appId: W, chatId: d.two.chatId, contentId: dataId },
        'DELETE'
      );
    }
    for (const f of [ownFile, xFile, yFile])
      await w.denied(
        await w.keyRequest(Ka, '/api/core/chat/file/presignChatFileGetUrl', {
          chatId: d.two.chatId,
          key: f.key
        })
      );
    await call('/core/chat/history/batchDelete', { chatIds: [d.one.chatId, cx.chatId, cy.chatId] });
    assert.equal((await w.snapshot(W, [d.one.chatId])).chats.length, 0);
    assert.deepEqual(await w.snapshot(X, [cx.chatId]), before[0]);
    assert.deepEqual(await w.snapshot(foreign.appId, [cy.chatId]), before[1]);
    return '显式其他应用仍解析到 W；外域 chatId/dataId/文件无泄漏和修改，混合删除只作用于 W';
  }
  if (context.itemId === 'D7') {
    const controlX = await w.completion(w.Kx, X),
      foreign = await w.foreignApp(),
      controlY = await w.completion(foreign.key, foreign.appId);
    const foreignBefore = [
      await w.snapshot(X, [controlX.chatId]),
      await w.snapshot(foreign.appId, [controlY.chatId])
    ];
    for (const variant of ['message', 'single', 'batch', 'clear']) {
      const appId = await w.app('delete-' + variant);
      for (const role of ['A', 'B']) await w.acl(role, appId, roles.manage);
      const a = await w.createKey('A', appId),
        b = await w.createKey('B', appId);
      const base = await seed(appId, a, b);
      if (variant === 'message') {
        await w.completion(b, appId, { chatId: base.two.chatId, uid: base.two.uid, round: 2 });
        const before = await w.snapshot(appId, [base.two.chatId]),
          oldId = before.items[0].dataId;
        await call(
          '/core/chat/record/delete',
          { chatId: base.two.chatId, contentId: oldId },
          'DELETE',
          a
        );
        const after = await w.snapshot(appId, [base.two.chatId]);
        assert.equal(after.items.filter((row) => row.deleteTime).length, 2);
        assert.equal(after.items.filter((row) => !row.deleteTime).length, 2);
        assert.ok(
          after.items.filter((row) => !row.deleteTime).every((row) => row.dataId !== oldId)
        );
      } else if (variant === 'single') {
        await call(
          query('/core/chat/history/delHistory', { chatId: base.online }),
          undefined,
          'DELETE',
          a
        );
        const snap = await w.snapshot(appId, base.ids);
        assert.deepEqual(
          snap.chats.filter((row) => row.deleteTime).map((row) => row.chatId),
          [base.online]
        );
      } else if (variant === 'batch') {
        await call('/core/chat/history/batchDelete', { chatIds: base.ids.slice(1) }, 'POST', a);
        const snap = await w.snapshot(appId, base.ids);
        assert.deepEqual(
          snap.chats.map((row) => row.chatId),
          [base.one.chatId]
        );
        assert.equal(snap.items.length, 2);
      } else {
        await call('/core/chat/history/clearHistories', undefined, 'DELETE', a);
        const snap = await w.snapshot(appId, base.ids);
        assert.deepEqual(
          snap.chats
            .filter((row) => row.deleteTime)
            .map((row) => row.chatId)
            .sort(),
          [base.one.chatId, base.two.chatId].sort()
        );
        assert.deepEqual(
          snap.chats
            .filter((row) => !row.deleteTime)
            .map((row) => row.chatId)
            .sort(),
          [base.online, base.shared].sort()
        );
      }
      const owner = success(
        await c.request({
          role: 'owner',
          kind: 'state',
          route: '/api/core/app/logs/list',
          body: { appId, ...dates(), pageSize: 100 }
        })
      );
      const expected = (await w.snapshot(appId, base.ids)).chats
        .filter((row) => !row.deleteTime && row.publishSource?.type === 'api')
        .map((row) => row.chatId)
        .sort();
      const visible = await call('/core/chat/history/getHistories', { pageSize: 100 }, 'POST', a);
      assert.deepEqual(visible.list.map((row) => row.chatId).sort(), expected);
      // 日志页保留软删除会话；批量物理删除的会话才从日志集合消失。
      assert.deepEqual(
        owner.list.map((row) => row.chatId).sort(),
        (await w.snapshot(appId, base.ids)).chats.map((row) => row.chatId).sort()
      );
    }
    assert.deepEqual(await w.snapshot(X, [controlX.chatId]), foreignBefore[0]);
    assert.deepEqual(await w.snapshot(foreign.appId, [controlY.chatId]), foreignBefore[1]);
    return '四个独立副本核对消息/会话软删除、跨来源批量删除和仅 API 清空；owner 复核精确集合';
  }
}
await runNodeCase(
  'FG-CHAT-HISTORY-FEEDBACK-003',
  Object.fromEntries(['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'].map((id) => [id, execute]))
);
