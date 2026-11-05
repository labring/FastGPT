import assert from 'node:assert/strict';
import { success, permissionDenied, poll } from '../../support/scenario.mjs';
import {
  chatFixture,
  proxyFixture,
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
async function routeMatrix(w, context, { userScope = false, proxyScope = false } = {}) {
  const proxy = proxyScope ? await proxyFixture(w, context) : undefined;
  const f = await chatFixture(w, proxy),
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
  const fresh = async () => w.completion(proxy?.key ?? w.Ka, w.W, proxy?.completion);
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
  if (proxyScope) {
    const other = await w.completion(w.Ka, w.W);
    const onlineId = w.label('B-online');
    success(
      await w.c.request({
        role: 'B',
        kind: 'state',
        route: '/api/v2/chat/completions',
        body: {
          appId: w.W,
          chatId: onlineId,
          stream: false,
          messages: [{ role: 'user', content: onlineId }]
        }
      })
    );
    await poll(async () => assert.equal((await w.snapshot(w.W, [onlineId])).items.length, 2));
    const controls = await w.snapshot(w.W, [other.chatId, onlineId]);
    // 引用跳转使用独立 dataset 路由，不能绕过同一个代理会话鉴权。
    const rawLink = 'https://example.test/' + w.label('source');
    await w.db
      .collection('dataset_collections')
      .updateOne({ _id: w.oid(q.collectionId) }, { $set: { type: 'link', rawLink } });
    for (const [route, input] of [
      [
        '/core/dataset/data/getQuoteData',
        { id: String(q.data[2]._id), chatId: f.chatId, chatItemDataId: f.ai.dataId }
      ],
      [
        '/core/dataset/collection/read',
        { collectionId: q.collectionId, chatId: f.chatId, chatItemDataId: f.ai.dataId }
      ],
      [
        '/core/dataset/collection/export',
        { collectionId: q.collectionId, chatId: f.chatId, chatItemDataId: f.ai.dataId }
      ]
    ]) {
      rejected(await f.request(route, { ...input, authProxy: { tmbId: w.c.actor('A').tmbId } }));
      const response = await f.request(route, input);
      if (route.endsWith('/export')) {
        assert.equal(response.http, 200);
        assert.equal(response.error, false);
        assert.match(response.contentType, /text\/csv/);
        assert.ok(response.raw.includes(context.run));
      } else {
        const result = success(response);
        if (route.endsWith('/read')) assert.equal(result.value, rawLink);
        else assert.equal(result.q, q.data[2].q);
      }
    }
    for (const route of routes) {
      if (route.route.endsWith('/batchDelete')) {
        const payload = await route.payload();
        const ids = [...payload.chatIds, other.chatId, onlineId];
        const before = await w.snapshot(w.W, ids);
        // 管理接口忽略使用者字段，仅检查 Key 实际归属 A 的日志权限。
        const input = { ...payload, customUid: 'ignored-user', authProxy: proxy.authProxy };
        rejected(await f.request(route.route, input, route.method));
        assert.deepEqual(await w.snapshot(w.W, ids), before);
        try {
          await w.acl('A', w.W, 8);
          const result = await f.call(
            route.route,
            { ...input, authProxy: { tmbId: w.c.actor('N').tmbId } },
            route.method
          );
          await route.check(result, payload);
          assert.equal(
            await w.db
              .collection('chatitems')
              .countDocuments({ appId: w.oid(w.W), chatId: { $in: payload.chatIds } }),
            0
          );
          assert.equal(
            await w.db
              .collection('chat_item_responses')
              .countDocuments({ appId: w.oid(w.W), chatId: { $in: payload.chatIds } }),
            0
          );
        } finally {
          await w.acl('A', w.W, 0);
        }
        assert.deepEqual(await w.snapshot(w.W, [other.chatId, onlineId]), controls);
        w.c.record('批量物理删除只检查实际凭证日志权限', {
          actualMember: w.c.actor('A').tmbId,
          ignoredProxyMember: w.c.actor('N').tmbId,
          deletedChatIds: payload.chatIds
        });
        continue;
      }
      for (const authProxy of [{ tmbId: proxy.tmbId }, { username: w.c.actor('B').username }]) {
        await route.prepare?.();
        const payload = await route.payload();
        const ids = [
          f.chatId,
          other.chatId,
          onlineId,
          payload.chatId,
          ...(payload.chatIds ?? [])
        ].filter(Boolean);
        const before = await w.snapshot(w.W, ids);
        for (const key of [w.personal(), w.Ka]) {
          rejected(await f.request(route.route, { ...payload, authProxy }, route.method, key));
        }
        await w.acl('B', w.W, 4);
        try {
          if (payload.chatId && !route.route.endsWith('/clearHistories')) {
            rejected(
              await f.request(
                route.route,
                { ...payload, chatId: other.chatId, authProxy },
                route.method
              )
            );
          }
        } finally {
          await w.acl('B', w.W, 1);
        }
        assert.deepEqual(await w.snapshot(w.W, ids), before);
        const result = await f.call(route.route, { ...payload, authProxy }, route.method);
        await route.check(result, payload);
        if (route.route.endsWith('/getHistories')) {
          assert.ok(result.list.some((row) => row.chatId === f.chatId));
          assert.ok(!result.list.some((row) => row.chatId === other.chatId));
        }
        assert.deepEqual(await w.snapshot(w.W, [other.chatId, onlineId]), controls);
        w.c.record('代理接口矩阵通过', {
          route: route.route,
          method: route.method,
          identity: 'tmbId' in authProxy ? 'member-id' : 'username'
        });
      }
    }
    const managed = await f.call('/core/chat/record/getPaginationRecords', {
      chatId: other.chatId,
      pageSize: 100
    });
    assert.equal(managed.total, 2, '代理成员有日志权限时保留其跨成员读取能力');
    // 共性边界集中验证一次；Query 必须是 JSON 字符串，不能降级为默认身份。
    for (const authProxy of [
      '{',
      'null',
      JSON.stringify({ tmbId: 'invalid', username: w.c.actor('B').username })
    ]) {
      rejected(await f.request('/core/chat/init', { chatId: f.chatId, authProxy }, 'GET'));
    }
    for (const authProxy of [
      JSON.stringify(proxy.authProxy),
      { tmbId: w.c.actor('N').tmbId },
      { tmbId: w.c.actor(foreign.role).tmbId }
    ]) {
      rejected(await f.request('/core/chat/history/getHistories', { authProxy }));
    }
    rejected(await f.request('/core/chat/history/getHistories', { customUid: 'conflict' }));
    const byId = await f.call(
      '/core/chat/init',
      { chatId: onlineId, authProxy: { tmbId: proxy.tmbId, username: 'does-not-exist' } },
      'GET'
    );
    assert.equal(byId.appId, w.W);
    const memberId = w.oid(proxy.tmbId);
    const member = await w.db.collection('team_members').findOne({ _id: memberId });
    try {
      await w.db
        .collection('team_members')
        .updateOne({ _id: memberId }, { $set: { status: 'leave' } });
      rejected(await f.request('/core/chat/init', { chatId: onlineId }, 'GET'));
    } finally {
      await w.db
        .collection('team_members')
        .updateOne({ _id: memberId }, { $set: { status: member.status } });
    }
    return '23 个会话入口按代理成员 ID/username 执行；Query JSON、互斥、无权限/跨团队/离职校验通过；批量物理删除忽略使用者身份且只检查实际凭证日志权限，清空保留其他成员和在线来源';
  }
  if (userScope) {
    const customUid = f.chat.uid;
    const other = await w.completion(w.Ka, w.W, { uid: w.label('other-user') });
    const online = await w.completion(w.Ka, w.W, { uid: customUid });
    // 本行只构造来源对照，消息仍由真实接口产生；来源展示已由 D1/D7 验证。
    await w.db
      .collection('chats')
      .updateOne(
        { appId: w.oid(w.W), chatId: online.chatId },
        { $set: { publishSource: { type: 'online' } } }
      );
    for (const route of routes) {
      if (route.route.endsWith('/batchDelete')) continue;
      await route.prepare?.();
      const payload = await route.payload();
      const ids = [
        f.chatId,
        other.chatId,
        online.chatId,
        payload.chatId,
        ...(payload.chatIds ?? [])
      ].filter(Boolean);
      const before = await w.snapshot(w.W, ids);
      const wrong = await f.request(
        route.route,
        { ...payload, customUid: w.label('absent-user') },
        route.method
      );
      if (route.route.endsWith('/getHistories') || route.route.endsWith('/getHistoryStatus')) {
        assert.deepEqual(success(wrong).list, []);
        if (route.route.endsWith('/getHistories')) assert.equal(success(wrong).total, 0);
      } else if (route.route.endsWith('/clearHistories')) success(wrong);
      else if (route.route.endsWith('/inputGuide/query')) {
        // 输入引导属于应用配置，不携带会话 ID；使用者不能改变这份公共配置。
        assert.deepEqual(
          success(wrong),
          success(await f.request(route.route, { ...payload, customUid }, route.method))
        );
      } else rejected(wrong);
      assert.deepEqual(await w.snapshot(w.W, ids), before);
      if (route.route.endsWith('/closeCustom')) {
        // 个人密钥同样支持 customUid，不能在会话鉴权后又退回只接受 Cookie 的旧入口。
        await w.acl('A', w.W, 4);
        try {
          const result = await f.call(
            route.route,
            { ...payload, appId: w.W, customUid },
            route.method,
            w.personal()
          );
          await route.check(result, payload);
        } finally {
          await w.acl('A', w.W, 0);
        }
        await route.prepare?.();
      }
      const input = { ...payload, customUid };
      const result = await f.call(route.route, input, route.method);
      await route.check(result, input);
      const remaining = await w.snapshot(w.W, [other.chatId, online.chatId]);
      assert.equal(remaining.chats.length, 2);
      assert.ok(remaining.chats.every((row) => !row.deleteTime));
      if (route.route.endsWith('/getHistories')) {
        assert.equal(result.total, 1);
        assert.deepEqual(
          result.list.map((r) => r.chatId),
          [f.chatId]
        );
      }
      w.c.record('使用者接口矩阵通过', {
        route: route.route,
        method: route.method,
        variants: ['精确匹配', '不匹配拒绝或过滤'],
        scope: 'conversation-user'
      });
    }
    for (let i = 0; i < controls.length; i++)
      assert.deepEqual(
        await w.snapshot(i ? foreign.appId : w.X, [controls[i].chatId]),
        controlBefore[i]
      );
    return '23 个会话接口验证 customUid 成功、拒绝/空集合及数据库差集；批量物理删除按资源日志权限单独验证，清空仅限该用户的 API 来源';
  }
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
  return {
    D8: recordParameters,
    D9: quoteParameters,
    D10: routeMatrix,
    D11: audioParameters,
    D13: (w, context) => routeMatrix(w, context, { userScope: true }),
    D15: (w, context) => routeMatrix(w, context, { proxyScope: true })
  }[context.itemId](w, context);
}
