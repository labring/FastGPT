import assert from 'node:assert/strict';
import { success, permissionDenied, poll } from '../../support/scenario.mjs';
import {
  chatFixture,
  quoteFixture,
  runningFixture,
  audioFixture,
  audioRequest,
  digest
} from './app-key-chat-fixture.mjs';

/** 参数拒绝必须来自 Zod 或已知权限错误；任意 500、空成功均不能替代拒绝。 */
function rejected(result, missingTarget = false) {
  if (result.http === 400 && result.json?.zodError) return;
  if (result.json?.statusText === 'unAuthDatasetFile') {
    assert.equal(result.error, true);
    return;
  }
  if (missingTarget && result.json?.statusText === 'appUnExist') {
    assert.equal(result.error, true);
    return;
  }
  permissionDenied(result);
}

/** 语音旧入口会把参数错误包装成 500，必须核对实际 Zod 字段，不能接受任意服务异常。 */
function validationRejected(result, field) {
  assert.equal(result.error, true);
  /** union 的 Zod 错误按分支嵌套；递归核对目标字段，不把其他字段错误当作本项通过。 */
  const includesField = (issues) =>
    issues?.some(
      (issue) =>
        issue.path?.includes(field) || issue.errors?.some((branch) => includesField(branch))
    );
  assert.ok(includesField(result.json?.zodError), '必须命中预期入参字段：' + field);
}

/** 先测独有的筛选、游标与运行中状态，避免只验证免 appId 的空响应。 */
async function recordParameters(w, context) {
  const f = await chatFixture(w);
  for (let round = 2; round <= 3; round++)
    await w.completion(w.Ka, w.W, { chatId: f.chatId, uid: f.chat.uid, round });
  const rows = await w.db
    .collection('chatitems')
    .find({ appId: w.oid(w.W), chatId: f.chatId })
    .sort({ _id: 1 })
    .toArray();
  const ai = rows.filter((r) => r.obj === 'AI');
  await f.call('/core/chat/feedback/updateUserFeedback', {
    chatId: f.chatId,
    dataId: ai[0].dataId,
    userGoodFeedback: 'good'
  });
  await f.call('/core/chat/feedback/updateUserFeedback', {
    chatId: f.chatId,
    dataId: ai[1].dataId,
    userBadFeedback: 'bad'
  });
  for (const [feedbackType, expected] of [
    ['good', [ai[0]]],
    ['bad', [ai[1]]],
    ['has_feedback', ai.slice(0, 2)]
  ]) {
    const result = await f.call('/core/chat/feedback/getFeedbackRecordIds', {
      chatId: f.chatId,
      feedbackType
    });
    assert.equal(result.total, expected.length);
    assert.deepEqual(
      result.dataIds,
      expected.map((r) => r.dataId)
    );
  }
  for (const isRead of [true, false]) {
    assert.equal(
      (
        await f.call('/core/chat/feedback/updateFeedbackReadStatus', {
          chatId: f.chatId,
          dataId: ai[0].dataId,
          isRead
        })
      ).success,
      true
    );
    const unread = await f.call('/core/chat/feedback/getFeedbackRecordIds', {
      chatId: f.chatId,
      feedbackType: 'good',
      unreadOnly: true
    });
    assert.deepEqual(unread.dataIds, isRead ? [] : [ai[0].dataId]);
    const chat = await w.db.collection('chats').findOne({ _id: f.chat.chats[0]._id });
    assert.equal(Boolean(chat.hasUnreadGoodFeedback), !isRead);
  }
  const ids = (result) => result.list.map((r) => r.obj + ':' + r.id);
  for (const [extra, expected] of [
    [{ pageSize: 2 }, rows.slice(-2)],
    [{ pageSize: 2, prevId: rows[4].dataId }, rows.slice(2, 4)],
    [{ pageSize: 2, nextId: rows[1].dataId }, rows.slice(1, 3)],
    [{ pageSize: 2, initialId: rows[2].dataId }, rows.slice(1, 4)]
  ]) {
    const result = await f.call('/core/chat/record/getRecords_v2', { chatId: f.chatId, ...extra });
    assert.equal(result.total, 6);
    assert.deepEqual(
      ids(result),
      expected.map((r) => r.obj + ':' + r.dataId)
    );
  }
  await f.call(
    '/core/chat/record/delete',
    { chatId: f.chatId, contentIds: [ai[0].dataId] },
    'DELETE'
  );
  for (const includeDeleted of [false, true]) {
    const result = await f.call('/core/chat/record/getRecords_v2', {
      chatId: f.chatId,
      pageSize: 100,
      includeDeleted,
      loadCustomFeedbacks: true
    });
    assert.equal(result.total, includeDeleted ? 6 : 4);
    assert.equal(result.list.filter((r) => r.deleteTime).length, includeDeleted ? 2 : 0);
  }
  const guides = ['A+B', 'ABC', 'A+B 使用方式', '其他问题'];
  await w.db
    .collection('chat_input_guides')
    .insertMany(guides.map((text) => ({ appId: w.oid(w.W), text })));
  assert.deepEqual(await f.call('/core/chat/inputGuide/query', { searchKey: 'A+B' }), [
    'A+B 使用方式'
  ]);
  assert.equal((await f.call('/core/chat/inputGuide/query', { searchKey: '' })).length, 4);
  for (const [route, body] of [
    ['/core/chat/history/getHistoryStatus', { chatIds: [] }],
    ['/core/chat/history/getHistoryStatus', { chatIds: Array(201).fill(f.chatId) }],
    ['/core/chat/record/getRecords_v2', { chatId: f.chatId, pageSize: 0 }],
    ['/core/chat/feedback/getFeedbackRecordIds', { chatId: f.chatId, feedbackType: 'unknown' }],
    [
      '/core/chat/feedback/updateFeedbackReadStatus',
      { chatId: f.chatId, dataId: ai[0].dataId, isRead: 'true' }
    ]
  ])
    rejected(await f.request(route, body));
  const run = await runningFixture(w, context);
  const status = () =>
    f.call(
      '/core/chat/history/getHistoryStatus',
      { appId: w.X, chatIds: [run.chatId, f.chatId, w.label('missing')] },
      'POST',
      run.key
    );
  assert.deepEqual(
    (await status()).list.map((r) => [r.chatId, r.chatGenerateStatus]),
    [[run.chatId, 0]]
  );
  await f.call('/v2/chat/stop', { chatId: run.chatId }, 'POST', run.key);
  run.barrier.release();
  await Promise.all(run.streams.map((s) => s.cancel()));
  await poll(async () => assert.equal((await status()).list[0].chatGenerateStatus, 1), 60000);
  w.c.record('独有参数完成', {
    messages: 6,
    feedbackTypes: 3,
    readTransitions: [true, false],
    statusTransitions: [0, 1],
    literalSearch: 'A+B'
  });
  return '真实状态由生成中转空闲；消息前后游标、删除可见性、反馈筛选/已读计数和输入引导字面搜索及边界均核对';
}

/** 引用通过真实会话关联和文档读取验证，包含前后分页、时间快照及越权反例。 */
async function quoteParameters(w, context) {
  const f = await chatFixture(w),
    q = await quoteFixture(w, context, f);
  const quote = await f.call('/core/chat/record/getQuote', q.quote);
  assert.deepEqual(
    quote.map((r) => r._id),
    q.quote.datasetDataIdList
  );
  assert.equal(quote[0].q, q.data[2].q);
  const full = await f.call('/core/chat/record/getCollectionQuote', q.full);
  assert.deepEqual(
    full.list.map((r) => r.id),
    q.data.slice(1, 4).map((r) => String(r._id))
  );
  assert.equal(full.hasMorePrev, true);
  assert.equal(full.hasMoreNext, true);
  for (const [cursor, anchor, expected] of [
    ['prevId', 1, q.data.slice(0, 1)],
    ['nextId', 3, q.data.slice(4)]
  ]) {
    const result = await f.call('/core/chat/record/getCollectionQuote', {
      ...q.full,
      initialId: undefined,
      [cursor]: String(q.data[anchor]._id),
      anchor,
      pageSize: 1
    });
    assert.deepEqual(
      result.list.map((r) => r.id),
      expected.map((r) => String(r._id))
    );
  }
  const historical = q.data[2];
  await w.db.collection('dataset_datas').updateOne(
    { _id: historical._id },
    {
      $set: {
        q: 'updated-after-chat',
        updateTime: new Date(),
        history: [{ q: historical.q, a: historical.a, updateTime: historical.updateTime }]
      }
    }
  );
  const prior = await f.call('/core/chat/record/getQuote', q.quote);
  assert.equal(prior[0].q, historical.q);
  assert.equal(prior[0].updated, true);
  for (const route of ['/core/chat/record/getQuote', '/core/chat/record/getCollectionQuote']) {
    const body = route.endsWith('/getQuote') ? q.quote : q.full;
    rejected(await f.request(route, { ...body, chatItemDataId: 'missing-item' }));
    const other = await w.completion(w.Ka, w.W);
    rejected(await f.request(route, { ...body, chatId: other.chatId }));
  }
  rejected(await f.request('/core/chat/record/getCollectionQuote', { ...q.full, pageSize: 31 }));
  return '引用 ID/内容、文档前后分页和会话时间快照一致；未引用文档/其他会话/错误消息及分页上限均拒绝';
}

/** 用固定清单覆盖每个标准 chat 路由；参数矩阵复用一次，写操作各自创建真实新会话。 */
async function routeMatrix(w, context) {
  const f = await chatFixture(w),
    q = await quoteFixture(w, context, f),
    foreign = await w.foreignApp();
  const controls = [await w.completion(w.Kx, w.X), await w.completion(foreign.key, foreign.appId)];
  const controlBefore = await Promise.all(
    controls.map((c, i) => w.snapshot(i ? foreign.appId : w.X, [c.chatId]))
  );
  await w.db
    .collection('chat_input_guides')
    .insertOne({ appId: w.oid(w.W), text: w.label('guide') });
  const fileBytes = Buffer.from(w.label('file-content'));
  const post = await f.call('/core/chat/file/presignChatFilePostUrl', {
    chatId: f.chatId,
    filename: 'FG-TEST.txt',
    contentType: 'text/plain',
    size: fileBytes.length
  });
  context.secrets.add(post.url);
  assert.ok((await fetch(post.url, { method: 'PUT', headers: post.headers, body: fileBytes })).ok);
  const prepareFeedback = () =>
    w.db.collection('chatitems').updateOne(
      { _id: f.ai._id },
      {
        $set: {
          customFeedbacks: ['FG-TEST-feedback'],
          isFeedbackRead: false,
          userGoodFeedback: 'FG-TEST-good'
        }
      }
    );
  const descriptor = (route, method, payload, check, extra = {}) => ({
    route,
    method,
    payload,
    check,
    ...extra
  });
  const rowsCheck = (result) => {
    assert.ok(result.list.length);
    assert.ok(JSON.stringify(result.list).includes(context.run));
  };
  const routes = [
    descriptor(
      '/core/chat/init',
      'GET',
      () => ({ chatId: f.chatId }),
      (r) => assert.equal(r.appId, w.W)
    ),
    descriptor(
      '/core/chat/resume',
      'GET',
      () => ({ chatId: f.chatId }),
      (r) => assert.ok(r.records.list.length),
      { legacy: true }
    ),
    descriptor(
      '/core/chat/history/getHistories',
      'POST',
      () => ({ pageSize: 100 }),
      (r) => assert.ok(r.list.some((x) => x.chatId === f.chatId))
    ),
    descriptor(
      '/core/chat/history/getHistoryStatus',
      'POST',
      () => ({ chatIds: [f.chatId] }),
      (r) =>
        assert.deepEqual(
          r.list.map((x) => x.chatId),
          [f.chatId]
        )
    ),
    descriptor(
      '/core/chat/history/markRead',
      'POST',
      () => ({ chatId: f.chatId }),
      async () =>
        assert.equal(
          (await w.db.collection('chats').findOne({ _id: f.chat.chats[0]._id })).hasBeenRead,
          true
        ),
      {
        prepare: () =>
          w.db
            .collection('chats')
            .updateOne({ _id: f.chat.chats[0]._id }, { $set: { hasBeenRead: false } })
      }
    ),
    descriptor(
      '/core/chat/history/updateHistory',
      'PUT',
      () => ({ chatId: f.chatId, customTitle: w.label('title') }),
      async (_, p) =>
        assert.equal(
          (await w.db.collection('chats').findOne({ _id: f.chat.chats[0]._id })).customTitle,
          p.customTitle
        )
    ),
    descriptor(
      '/core/chat/record/getPaginationRecords',
      'POST',
      () => ({ chatId: f.chatId, pageSize: 100 }),
      rowsCheck
    ),
    descriptor(
      '/core/chat/record/getRecords_v2',
      'POST',
      () => ({ chatId: f.chatId, pageSize: 100 }),
      rowsCheck
    ),
    descriptor(
      '/core/chat/record/getResData',
      'GET',
      () => ({ chatId: f.chatId, dataId: f.ai.dataId }),
      (r) => assert.ok(JSON.stringify(r).includes(context.run))
    ),
    descriptor(
      '/core/chat/record/getQuote',
      'POST',
      () => q.quote,
      (r) =>
        assert.deepEqual(
          r.map((x) => x._id),
          q.quote.datasetDataIdList
        )
    ),
    descriptor(
      '/core/chat/record/getCollectionQuote',
      'POST',
      () => q.full,
      (r) =>
        assert.deepEqual(
          r.list.map((x) => x.id),
          q.data.slice(1, 4).map((x) => String(x._id))
        )
    ),
    descriptor(
      '/core/chat/feedback/getFeedbackRecordIds',
      'POST',
      () => ({ chatId: f.chatId, feedbackType: 'good' }),
      (r) => assert.ok(r.dataIds.includes(f.ai.dataId)),
      { prepare: prepareFeedback }
    ),
    descriptor(
      '/core/chat/feedback/updateFeedbackReadStatus',
      'POST',
      () => ({ chatId: f.chatId, dataId: f.ai.dataId, isRead: true }),
      async () =>
        assert.equal(
          (await w.db.collection('chatitems').findOne({ _id: f.ai._id })).isFeedbackRead,
          true
        ),
      {
        prepare: () =>
          w.db
            .collection('chatitems')
            .updateOne({ _id: f.ai._id }, { $set: { isFeedbackRead: false } })
      }
    ),
    descriptor(
      '/core/chat/feedback/updateUserFeedback',
      'POST',
      () => ({ chatId: f.chatId, dataId: f.ai.dataId, userBadFeedback: 'FG-TEST-bad' }),
      async () =>
        assert.equal(
          (await w.db.collection('chatitems').findOne({ _id: f.ai._id })).userBadFeedback,
          'FG-TEST-bad'
        ),
      {
        prepare: () =>
          w.db
            .collection('chatitems')
            .updateOne({ _id: f.ai._id }, { $unset: { userBadFeedback: '' } })
      }
    ),
    descriptor(
      '/core/chat/feedback/adminUpdate',
      'POST',
      () => ({
        chatId: f.chatId,
        dataId: f.ai.dataId,
        datasetId: q.datasetId,
        feedbackDataId: 'FG-TEST-ref',
        q: 'question',
        a: 'answer'
      }),
      async () =>
        assert.equal(
          (await w.db.collection('chatitems').findOne({ _id: f.ai._id })).adminFeedback.dataId,
          'FG-TEST-ref'
        ),
      {
        prepare: () =>
          w.db
            .collection('chatitems')
            .updateOne({ _id: f.ai._id }, { $unset: { adminFeedback: '' } })
      }
    ),
    descriptor(
      '/core/chat/feedback/closeCustom',
      'POST',
      () => ({ chatId: f.chatId, dataId: f.ai.dataId, index: 0 }),
      async () =>
        assert.deepEqual(
          (await w.db.collection('chatitems').findOne({ _id: f.ai._id })).customFeedbacks,
          []
        ),
      { prepare: prepareFeedback }
    ),
    descriptor(
      '/core/chat/inputGuide/query',
      'POST',
      () => ({ searchKey: '' }),
      (r) => assert.equal(r.length, 1)
    ),
    descriptor(
      '/core/chat/file/presignChatFilePostUrl',
      'POST',
      () => ({ chatId: f.chatId, filename: 'FG-TEST.txt', contentType: 'text/plain', size: 1 }),
      (r) => {
        context.secrets.add(r.url);
        assert.ok(r.key);
      }
    ),
    descriptor(
      '/core/chat/file/presignChatFileGetUrl',
      'POST',
      () => ({ chatId: f.chatId, key: post.key }),
      async (r) => {
        context.secrets.add(r);
        const response = await fetch(r);
        assert.equal(response.status, 200);
        assert.equal(digest(Buffer.from(await response.arrayBuffer())), digest(fileBytes));
      }
    ),
    descriptor(
      '/v2/chat/stop',
      'POST',
      () => ({ chatId: f.chatId }),
      (r) => assert.equal(r.success, true)
    )
  ];
  const fresh = async () => w.completion(w.Ka, w.W);
  routes.push(
    descriptor(
      '/core/chat/record/delete',
      'DELETE',
      async () => {
        const c = await fresh();
        return { chatId: c.chatId, contentIds: [c.items[0].dataId] };
      },
      async (_, p) =>
        assert.equal(
          await w.db
            .collection('chatitems')
            .countDocuments({ appId: w.oid(w.W), chatId: p.chatId, deleteTime: { $ne: null } }),
          2
        )
    ),
    descriptor(
      '/core/chat/history/delHistory',
      'DELETE',
      async () => ({ chatId: (await fresh()).chatId }),
      async (_, p) =>
        assert.ok(
          (await w.db.collection('chats').findOne({ appId: w.oid(w.W), chatId: p.chatId }))
            .deleteTime
        )
    ),
    descriptor(
      '/core/chat/history/clearHistories',
      'DELETE',
      async () => ({ chatId: (await fresh()).chatId }),
      async (_, p) =>
        assert.ok(
          (await w.db.collection('chats').findOne({ appId: w.oid(w.W), chatId: p.chatId }))
            .deleteTime
        )
    ),
    descriptor(
      '/core/chat/history/batchDelete',
      'POST',
      async () => ({ chatIds: [(await fresh()).chatId] }),
      async (_, p) =>
        assert.equal(
          await w.db
            .collection('chats')
            .countDocuments({ appId: w.oid(w.W), chatId: { $in: p.chatIds } }),
          0
        )
    )
  );
  assert.equal(routes.length, 24);
  const targets = [
    ['省略', {}],
    ['同应用', { appId: w.W }],
    ['其他应用', { appId: w.X }],
    ['跨团队', { appId: foreign.appId }],
    ['冲突Key后缀', {}, w.X],
    ['显式app来源', { sourceType: 'app' }]
  ];
  let calls = 0;
  // 先完成全部反例，避免后面的清空/删除改变读取接口的准备状态。
  for (const route of routes) {
    await route.prepare?.();
    const payload = await route.payload();
    const invalid = [
      { appId: 'invalid-id' },
      { skillId: w.X },
      { appId: w.W, sourceType: 'workflowBuilder' },
      { appId: w.W, sourceType: 'chatAgentHelper' }
    ];
    for (const target of invalid) {
      rejected(await f.request(route.route, { ...payload, ...target }, route.method));
      calls++;
      w.c.record('格式或来源拒绝', { route: route.route, target });
    }
    for (const auth of [
      { kind: 'key', keyValue: w.personal().value, target: {}, missing: true },
      { kind: 'state', target: {}, missing: true },
      { kind: 'key', keyValue: w.personal().value, target: { appId: w.W } },
      { kind: 'state', target: { appId: w.W } },
      { kind: 'key', keyValue: 'fastgpt-invalid-credential', target: { appId: w.W } }
    ]) {
      const query =
        ['GET', 'DELETE'].includes(route.method) && !route.route.endsWith('/record/delete');
      const input = { ...payload, ...auth.target };
      const response = await w.c.request({
        role: 'A',
        kind: auth.kind,
        keyValue: auth.keyValue,
        method: route.method,
        route: '/api' + route.route + (query ? '?' + new URLSearchParams(input) : ''),
        body: query ? undefined : input
      });
      rejected(response, auth.missing);
      calls++;
      w.c.record('凭证反例通过', {
        route: route.route,
        kind: auth.kind,
        invalidKey: auth.keyValue === 'fastgpt-invalid-credential',
        target: auth.target
      });
    }
  }
  for (const route of routes) {
    const variants = [
      ...targets,
      ...(route.legacy ? [['旧sourceId', { sourceType: 'app', sourceId: w.X }]] : [])
    ];
    for (const [name, target, suffix] of variants) {
      await route.prepare?.();
      const payload = await route.payload();
      const result = await f.call(
        route.route,
        { ...payload, ...target },
        route.method,
        suffix ? { value: w.Ka.value + '-' + suffix } : w.Ka
      );
      await route.check(result, payload);
      calls++;
      w.c.record('接口矩阵通过', { route: route.route, method: route.method, variant: name });
    }
  }
  // 六个兼容路径只验证真实 HTTP 转发，不重复业务参数全矩阵。
  for (const [old, canonical, method, payload, check] of [
    [
      '/getHistories',
      '/history/getHistories',
      'POST',
      { pageSize: 100 },
      (r) => assert.ok(Array.isArray(r.list))
    ],
    [
      '/getPaginationRecords',
      '/record/getPaginationRecords',
      'POST',
      { chatId: f.chatId, pageSize: 100 },
      rowsCheck
    ],
    [
      '/getResData',
      '/record/getResData',
      'GET',
      { chatId: f.chatId, dataId: f.ai.dataId },
      (r) => assert.ok(JSON.stringify(r).includes(context.run))
    ],
    [
      '/updateHistory',
      '/history/updateHistory',
      'PUT',
      { chatId: f.chatId, customTitle: 'FG-TEST-alias' },
      async () =>
        assert.equal(
          (await w.db.collection('chats').findOne({ _id: f.chat.chats[0]._id })).customTitle,
          'FG-TEST-alias'
        )
    ],
    [
      '/delHistory',
      '/history/delHistory',
      'DELETE',
      { chatId: (await fresh()).chatId },
      async (_, p) =>
        assert.ok(
          (await w.db.collection('chats').findOne({ appId: w.oid(w.W), chatId: p.chatId }))
            .deleteTime
        )
    ],
    [
      '/clearHistories',
      '/history/clearHistories',
      'DELETE',
      {},
      async () =>
        assert.equal(
          await w.db.collection('chats').countDocuments({ appId: w.oid(w.W), deleteTime: null }),
          0
        )
    ]
  ]) {
    const result = await f.call('/core/chat' + old, payload, method);
    await check(result, payload);
    w.c.record('旧路由冒烟', { route: '/core/chat' + old, canonical: '/core/chat' + canonical });
  }
  for (let i = 0; i < controls.length; i++)
    assert.deepEqual(
      await w.snapshot(i ? foreign.appId : w.X, [controls[i].chatId]),
      controlBefore[i]
    );
  w.c.record('接口覆盖清单', {
    routes: routes.map((r) => r.method + ' ' + r.route),
    aliases: 6,
    requests: calls
  });
  return '24 个标准管理接口逐一验证 6 组成功参数、9 组拒绝及实际响应/落库；6 个旧别名 HTTP 冒烟；X/Y 零差集';
}

/** 音频使用 dev 真实模型，TTS 回包再作为真实 multipart STT 输入；参数与凭证不依赖模拟服务。 */
async function audioParameters(w, context) {
  const f = await chatFixture(w),
    a = { ...(await audioFixture(w, context)), chatId: f.chatId };
  const first = await audioRequest(w, a);
  assert.equal(first.error, false, JSON.stringify(first.json));
  assert.equal(first.json, undefined, '必须收到真实音频');
  assert.ok(first.bytes.length > 100);
  await poll(
    async () => assert.ok(await w.db.collection('buffer_tts').findOne(a.cacheQuery)),
    30000
  );
  const foreign = await w.foreignApp();
  for (const route of ['/core/chat/record/getSpeech', '/v1/audio/transcriptions']) {
    const targets = [
      {},
      { appId: w.W },
      { appId: w.X },
      { appId: foreign.appId },
      { sourceType: 'app' },
      ...(route.includes('transcriptions') ? [{ sourceType: 'app', sourceId: w.X }] : [])
    ];
    const variants = targets.map((target) => ({ target, name: JSON.stringify(target) }));
    variants.push({ target: {}, name: '冲突Key后缀', credential: w.Ka.value + '-' + w.X });
    for (const { target, name, credential } of variants) {
      if (route.includes('transcriptions')) await new Promise((r) => setTimeout(r, 1100));
      const result = await audioRequest(w, a, { route, target, credential, bytes: first.bytes });
      assert.equal(result.error, false, JSON.stringify(result.json));
      if (route.includes('transcriptions')) {
        const text = success(result);
        assert.equal(typeof text, 'string');
        assert.ok(text.trim().length > 0);
      } else assert.equal(result.hash, first.hash);
      w.c.record('音频矩阵通过', { route, variant: name });
    }
    for (const target of [
      { appId: 'invalid-id' },
      { skillId: w.X },
      { appId: w.W, sourceType: 'workflowBuilder' },
      { appId: w.W, sourceType: 'chatAgentHelper' }
    ]) {
      const response = await audioRequest(w, a, { route, target, bytes: first.bytes });
      if (target.appId === 'invalid-id') validationRejected(response, 'appId');
      else rejected(response);
    }
    for (const auth of [
      { kind: 'key', credential: w.personal().value, target: {}, missing: true },
      { kind: 'state', target: {}, missing: true },
      { kind: 'key', credential: w.personal().value, target: { appId: w.W } },
      { kind: 'state', target: { appId: w.W } },
      { kind: 'key', credential: 'fastgpt-invalid-credential', target: { appId: w.W } }
    ])
      rejected(await audioRequest(w, a, { route, ...auth, bytes: first.bytes }), auth.missing);
  }
  const legacy = await audioRequest(w, a, {
    patch: { ttsConfig: { ...a.ttsConfig, modelId: undefined, model: a.model.model } }
  });
  assert.equal(legacy.hash, first.hash);
  const badVoice = await audioRequest(w, a, {
    patch: { ttsConfig: { ...a.ttsConfig, voice: 'FG-TEST-invalid-voice' } }
  });
  assert.equal(badVoice.error, true);
  assert.match(JSON.stringify(badVoice.json), /voice not found/);
  validationRejected(
    await audioRequest(w, a, { patch: { ttsConfig: { ...a.ttsConfig, speed: 'invalid' } } }),
    'ttsConfig'
  );
  const noDuration = await audioRequest(w, a, {
    route: '/v1/audio/transcriptions',
    bytes: first.bytes,
    patch: { duration: undefined }
  });
  assert.equal(noDuration.error, true);
  assert.match(JSON.stringify(noDuration.json), /duration not found/);
  w.c.record('真实语音链路', {
    ttsBytes: first.bytes.length,
    sha256: first.hash,
    modelId: a.ttsConfig.modelId
  });
  return '真实 TTS 音频与缓存摘要一致，multipart STT 返回非空转写；两接口覆盖省略/同应用/冲突/跨团队/来源与凭证反例，兼容 model 和 duration/voice 边界';
}

/** 扩展现有用例的四组验收目标，所有真实操作由同一工作区的 HTTP/DB helper 执行。 */
export async function runChatApiCoverage(w, context) {
  return { D8: recordParameters, D9: quoteParameters, D10: routeMatrix, D11: audioParameters }[
    context.itemId
  ](w, context);
}
