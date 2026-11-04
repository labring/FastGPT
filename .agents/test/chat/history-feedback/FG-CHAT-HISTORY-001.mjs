import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { runNodeCase, Blocked } from '../../support/runtime.mjs';
import { chatHarness, browserSession } from '../../support/chat.mjs';
import { historySnapshot, loadHistory, historyNetwork } from '../../support/history.mjs';
import { privateDatabase, control } from '../../support/private.mjs';
import { success, permissionDenied, poll, required } from '../../support/scenario.mjs';
import { openEventStream } from '../../support/stream.mjs';

/** 列表使用真实页面/请求/Redis 观测；网络反例仅定向影响本轮请求。 */
async function execute(context) {
  const h = await chatHarness(context),
    { c, redis } = h;
  const f = required(c.fixture.history, 'history'),
    appId = f.appId;
  await privateDatabase(context, c);
  await redis.assertPrivate();
  const ids = f.chatIds;
  assert.equal(new Set(ids).size, 201, '必须有 201 个真实不同会话');
  const status = (chatIds, extra = {}) =>
    c.request({
      role: 'A',
      kind: 'state',
      route: '/api/core/chat/history/getHistoryStatus',
      body: { appId, chatIds, ...extra }
    });
  const normal = (list) =>
    list.map((row) => ({ ...row })).sort((a, b) => a.chatId.localeCompare(b.chatId));
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const open = async () => {
    const browser = await browserSession(context, { scenario: c });
    browser.calls = historyNetwork(browser.page, c);
    await browser.page.goto(new URL(f.url, c.fixture.baseUrl).href, { timeout: 120000 });
    return browser;
  };
  if (context.itemId === 'C1') {
    success(
      await c.request({
        role: 'A',
        kind: 'state',
        method: 'PUT',
        route: '/api/core/chat/history/updateHistory',
        body: { appId, chatId: ids[0], customTitle: 'FG-TEST metadata ' + c.run, top: true }
      })
    );
    const task = await h.start({ appId, chatId: ids[0] }),
      browser = await open();
    const initial = await loadHistory(browser.page, 20);
    const metadata = (list) =>
      normal(
        list.map(({ chatId, title, customTitle, top }) => ({ chatId, title, customTitle, top }))
      );
    const oldMetadata = metadata(initial);
    await poll(async () => {
      const row = (await historySnapshot(browser.page)).find((row) => row.chatId === task.chatId);
      assert.equal(row.chatGenerateStatus, 0);
      assert.equal(row.hasBeenRead, false);
    });
    assert.equal(
      success(await status([ids[0], ids[1]])).list.find((row) => row.chatId === ids[0])
        .chatGenerateStatus,
      0
    );
    await h.finish(task);
    await poll(
      async () =>
        assert.ok(
          (await historySnapshot(browser.page)).every((row) => row.chatGenerateStatus === 1)
        ),
      15000
    );
    const updatedMetadata = metadata(await historySnapshot(browser.page));
    assert.deepEqual(updatedMetadata, oldMetadata, '状态刷新保留标题、自定义标题与置顶');
    c.record('App 页面元数据保留', { before: oldMetadata, after: updatedMetadata });
    const before = browser.calls.length;
    await pause(6500);
    assert.equal(browser.calls.length, before, '全部空闲后停止轮询');
    await browser.capture('App忙闲切换');
    // 跨来源沿用真实页面捕获的请求模板；没有准备入口则整行阻塞，保留 App 的实测证据。
    const entries = required(f.entries, 'history.entries：Skill/Helper/Builder 的实际资源和请求');
    for (const sourceType of ['skillEdit', 'chatAgentHelper', 'workflowBuilder']) {
      const entry = required(
        entries.find((row) => row.sourceType === sourceType),
        'history.entries.' + sourceType
      );
      const chatId = `${c.run}-${sourceType}`,
        question = `${c.run}-${sourceType}-question`,
        responseId = randomBytes(12).toString('hex');
      const variables = { $CHAT_ID: chatId, $QUESTION: question, $RESPONSE_ID: responseId };
      const expand = (value) =>
        typeof value === 'string'
          ? Object.entries(variables).reduce(
              (value, [key, replacement]) => value.replaceAll(key, replacement),
              value
            )
          : Array.isArray(value)
            ? value.map(expand)
            : value && typeof value === 'object'
              ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, expand(item)]))
              : value;
      const barrier = h.gate.register(question);
      const source = { sourceType, sourceId: entry.sourceId, chatId };
      context.itemFinalizers.push(async () => {
        barrier.release();
        await poll(
          async () => assert.equal(await redis.client.get(redis.leaseKey(source)), null),
          120000
        );
      });
      context.cleanups.push(async () =>
        success(
          await c.request({
            role: 'owner',
            route: '/api/core/chat/history/batchDelete',
            body: { ...entry.target, chatIds: [chatId] }
          })
        )
      );
      const stream = openEventStream(
        await c.request({
          role: entry.role ?? 'A',
          kind: 'state',
          route: entry.generation.route,
          body: expand(entry.generation.body),
          raw: true
        })
      );
      h.connections.push(stream);
      await barrier.entered();
      assert.ok((await redis.observe(source)).lease);
      const view = await browserSession(context, {
        scenario: c,
        url: expand(entry.url),
        role: entry.role ?? 'A'
      });
      await poll(
        async () =>
          assert.equal(
            (await historySnapshot(view.page)).find((row) => row.chatId === chatId)
              ?.chatGenerateStatus,
            0
          ),
        60000
      );
      barrier.release();
      await stream.finished;
      await poll(
        async () => assert.equal(await redis.client.get(redis.leaseKey(source)), null),
        45000
      );
      await poll(
        async () =>
          assert.equal(
            (await historySnapshot(view.page)).find((row) => row.chatId === chatId)
              ?.chatGenerateStatus,
            1
          ),
        15000
      );
      await view.capture(sourceType + '忙闲切换');
    }
    return 'App/Skill/Helper/Builder 真实入口的状态、UI 已读/元数据和忙闲轮询生命周期均验证';
  }
  if (context.itemId === 'C2') {
    const other = await h.start({ appId, role: 'B' });
    await h.finish(other);
    const deleted = await h.start({ appId });
    await h.finish(deleted);
    success(
      await c.request({
        role: 'A',
        kind: 'state',
        method: 'DELETE',
        route:
          '/api/core/chat/history/delHistory?' +
          new URLSearchParams({ appId, chatId: deleted.chatId })
      })
    );
    const start = await control(c, { action: 'observe' }),
      requested = [ids[0], other.chatId, deleted.chatId, c.run + '-missing'];
    const result = success(await status(requested));
    assert.deepEqual(
      result.list.map((row) => row.chatId),
      [ids[0]]
    );
    const observed = await control(c, { action: 'observe', after: start.observations.length });
    assert.equal(observed.observations.length, 1);
    assert.deepEqual(observed.observations[0].keys, [
      redis.leaseKey({ sourceId: appId, chatId: ids[0] })
    ]);
    permissionDenied(
      await c.request({
        role: 'N',
        kind: 'state',
        route: '/api/core/chat/history/getHistoryStatus',
        body: { appId, chatIds: [ids[0]] }
      })
    );
    permissionDenied(await status([ids[0]], { appId: f.otherAppId }));
    const share = required(f.shareId, 'history.shareId'),
      uid = c.run + '-visitor1';
    const task = await h.start({
      appId,
      extra: { outLinkAuthData: { shareId: share, outLinkUid: uid } }
    });
    await h.finish(task);
    const before = await control(c, { action: 'observe' });
    const visible = success(
      await status([task.chatId], { outLinkAuthData: { shareId: share, outLinkUid: uid } })
    );
    assert.deepEqual(
      visible.list.map((row) => row.chatId),
      [task.chatId]
    );
    assert.deepEqual(
      success(
        await status([task.chatId], {
          outLinkAuthData: { shareId: share, outLinkUid: c.run + '-visitor2' }
        })
      ).list,
      []
    );
    const commands = await control(c, { action: 'observe', after: before.observations.length });
    assert.equal(commands.observations.length, 1);
    return '精确权限/软删除/不存在集合与一次 MGET 核对；无权资源拒绝，外链 UID 切换不泄漏且空集合不访问 Redis';
  }
  if (context.itemId === 'C3') {
    const task = await h.start({ appId, chatId: ids[0] }),
      browser = await browserSession(context, { scenario: c });
    browser.calls = historyNetwork(browser.page, c);
    let duplicate = false,
      firstHistory;
    await browser.page.route('**/api/core/chat/history/getHistories', async (route) => {
      const response = await route.fetch(),
        body = await response.json();
      if (body.data?.list.length && !firstHistory) firstHistory = body.data.list[0];
      // 只在末页加入早前 ID，不改变下一页 offset 而漏读真实历史。
      if (!duplicate && body.data?.list.length > 0 && body.data.list.length < 20) {
        duplicate = true;
        body.data.list.push(firstHistory);
        body.data.total += 1;
      }
      await route.fulfill({ response, json: body });
    });
    await browser.page.goto(new URL(f.url, c.fixture.baseUrl).href, { timeout: 120000 });
    await loadHistory(browser.page, 201);
    assert.equal(duplicate, true);
    await poll(
      () =>
        assert.ok(
          browser.calls.some((row) => row.body.chatIds.length === 200) &&
            browser.calls.some((row) => row.body.chatIds.length === 1)
        ),
      15000
    );
    for (const call of browser.calls) {
      assert.equal(new Set(call.body.chatIds).size, call.body.chatIds.length);
      assert.ok(call.body.chatIds.length <= 200);
    }
    const full = browser.calls.findIndex((row) => row.body.chatIds.length === 200),
      first = browser.calls[full],
      second = browser.calls.slice(full + 1).find((row) => row.body.chatIds.length === 1);
    assert.ok(first.ended && second.at >= first.endAt, '两个批次顺序执行');
    assert.equal(success(await status(ids.slice(0, 200))).list.length, 200);
    for (const values of [ids, [], ['']]) {
      const response = await status(values);
      assert.equal(response.http, 400);
      assert.equal(response.json.code, 400);
    }
    const empty = await browserSession(context, { scenario: c });
    const calls = historyNetwork(empty.page, c);
    await empty.page.goto(
      new URL(
        '/chat?pane=ra&appId=' + required(c.fixture.apps.empty, 'apps.empty'),
        c.fixture.baseUrl
      ).href,
      { timeout: 120000 }
    );
    await poll(async () =>
      assert.equal(new URL(empty.page.url()).searchParams.get('appId'), c.fixture.apps.empty)
    );
    await pause(6500);
    assert.deepEqual(await historySnapshot(empty.page), []);
    assert.equal(calls.length, 0);
    await browser.capture('201项去重分批');
    await h.finish(task);
    return '真实滚动加载 201 个不同历史并加入重复输入，客户端去重且 200+1 顺序请求；API 200/201/空数组/空 ID 与空页面不请求均核对';
  }
  if (context.itemId === 'C4') {
    for (const busy of [false, true])
      for (const fault of ['503', 'network', 'redis']) {
        const task = busy ? await h.start({ appId, chatId: ids[0] }) : undefined;
        const browser = await browserSession(context, { scenario: c });
        let failed = false,
          old;
        await browser.page.route('**/api/core/chat/history/getHistoryStatus', async (route) => {
          if (failed) {
            await route.continue();
            return;
          }
          old = await historySnapshot(browser.page);
          failed = true;
          if (fault === '503')
            await route.fulfill({ status: 503, body: 'FGTEST controlled HTTP failure' });
          if (fault === 'network') await route.abort('failed');
          if (fault === 'redis') {
            await control(c, {
              action: 'rule',
              rule: { command: 'MGET', keyIncludes: appId, remaining: 1 }
            });
            try {
              const response = await route.fetch();
              assert.ok(response.status() >= 400, '严格 API 不能把 Redis 失败当 idle 成功');
              await route.fulfill({ response });
            } finally {
              await control(c, { action: 'clear' });
            }
          }
        });
        const calls = historyNetwork(browser.page, c);
        await browser.page.goto(new URL(f.url, c.fixture.baseUrl).href, { timeout: 120000 });
        await poll(() => assert.equal(failed, true), 60000);
        await pause(500);
        assert.deepEqual(normal(await historySnapshot(browser.page)), normal(old));
        // 改变真实 lease 后等待页面重试；初始全 idle 也必须开始重试。
        const resumed = task ?? (await h.start({ appId, chatId: ids[0] }));
        await poll(
          async () =>
            assert.equal(
              (await historySnapshot(browser.page)).find((row) => row.chatId === ids[0])
                ?.chatGenerateStatus,
              0
            ),
          15000
        );
        await poll(() => assert.ok(calls.length >= 2), 15000);
        await h.finish(resumed);
        await poll(
          async () =>
            assert.ok(
              (await historySnapshot(browser.page)).every((row) => row.chatGenerateStatus === 1)
            ),
          15000
        );
        await browser.capture('轮询恢复-' + fault + '-' + busy);
        await browser.session.close();
      }
    return 'busy/idle × HTTP503/网络错误/真实 Redis MGET 失败均保留整轮快照，恢复后自动重试并更新实际 lease 状态';
  }
  if (context.itemId === 'C5') {
    const task = await h.start({ appId, chatId: ids[0] }),
      browser = await open();
    await loadHistory(browser.page, 201);
    let phase = 0,
      baseline;
    await browser.page.route('**/api/core/chat/history/getHistoryStatus', async (route) => {
      const body = route.request().postDataJSON();
      if (phase === 0 && body.chatIds.length === 200) {
        baseline = await historySnapshot(browser.page);
        phase = 1;
        const response = await route.fetch(),
          data = await response.json();
        for (const row of data.data.list) {
          row.chatGenerateStatus = row.chatGenerateStatus === 0 ? 1 : 0;
          row.hasBeenRead = !row.hasBeenRead;
          row.updateTime = '2000-01-01T00:00:00.000Z';
        }
        await route.fulfill({ response, json: data });
        return;
      }
      if (phase === 1) {
        phase = 2;
        await route.fulfill({ status: 503, body: 'FGTEST second batch failed' });
        return;
      }
      await route.continue();
    });
    await poll(() => assert.equal(phase, 2), 15000);
    await pause(300);
    assert.deepEqual(normal(await historySnapshot(browser.page)), normal(baseline));
    await browser.capture('第二批失败保持整轮');
    await h.finish(task);
    await poll(
      async () =>
        assert.ok(
          (await historySnapshot(browser.page)).every((row) => row.chatGenerateStatus === 1)
        ),
      15000
    );
    assert.ok(
      (await historySnapshot(browser.page)).every(
        (row) => row.updateTime !== '2000-01-01T00:00:00.000Z'
      )
    );
    return '第一批状态/已读/时间改变但第二批失败时整轮不提交；下一轮两批成功才统一刷新';
  }
  if (context.itemId === 'C6') {
    const task = await h.start({ appId, chatId: ids[0] }),
      browser = await open();
    await loadHistory(browser.page, 20);
    let held = false,
      release;
    const wait = new Promise((resolve) => {
      release = resolve;
    });
    await browser.page.route('**/api/core/chat/history/getHistoryStatus', async (route) => {
      if (!held) {
        held = true;
        await wait;
      }
      await route.continue();
    });
    await poll(() => assert.equal(held, true), 10000);
    const count = browser.calls.length;
    await pause(11000);
    assert.equal(browser.calls.length, count, '在途轮次不得叠加');
    release();
    await browser.page.unrouteAll({ behavior: 'wait' });
    const cdp = await browser.session.newCDPSession(browser.page),
      window = await cdp.send('Browser.getWindowForTarget');
    await cdp.send('Browser.setWindowBounds', {
      windowId: window.windowId,
      bounds: { windowState: 'minimized' }
    });
    try {
      const visibility = await browser.page.evaluate(() => document.visibilityState);
      c.record('真实页面可见性', { visibility, operation: 'Browser.setWindowBounds minimized' });
      if (visibility !== 'hidden')
        throw new Blocked('当前 Chromium 未将最小化视为隐藏页；未用覆盖 visibilityState 冒充');
      await pause(1000);
      const before = browser.calls.length;
      await pause(11000);
      assert.equal(browser.calls.length, before, '隐藏页不得开始新轮询');
    } finally {
      await cdp.send('Browser.setWindowBounds', {
        windowId: window.windowId,
        bounds: { windowState: 'normal' }
      });
    }
    const before = browser.calls.length;
    await poll(() => assert.ok(browser.calls.length > before), 10000);
    await h.finish(task);
    await browser.capture('在途与隐藏页恢复');
    return '超过十秒在途不叠加；真实隐藏页暂停两个轮询周期，恢复可见触发一次刷新且无重复计时器';
  }
  if (context.itemId === 'C7') {
    for (const fail of [false, true]) {
      const task = await h.start({ appId, chatId: ids[0] }),
        browser = await open();
      await loadHistory(browser.page, 20);
      let captured = false,
        release;
      const wait = new Promise((resolve) => {
        release = resolve;
      });
      await browser.page.route('**/api/core/chat/history/getHistoryStatus', async (route) => {
        if (captured) {
          await route.continue();
          return;
        }
        captured = true;
        const response = await route.fetch();
        await wait;
        if (fail)
          await route.fulfill({ status: 503, body: 'FGTEST late old error' }).catch(() => {});
        else await route.fulfill({ response }).catch(() => {});
      });
      await poll(() => assert.equal(captured, true), 10000);
      // 全部应用页本身保留 Context，必须再真实选择另一资源才能触发旧 effect 的清理。
      const nextApp = required(c.fixture.apps.database, 'apps.database');
      const nextTask = await h.start({ appId: nextApp });
      const detail = success(
        await c.request({
          role: 'A',
          kind: 'state',
          method: 'GET',
          route: '/api/core/app/detail?appId=' + nextApp
        })
      );
      await browser.page.getByText('全部应用', { exact: true }).first().click();
      await browser.page.getByText(detail.name, { exact: true }).click();
      await poll(async () =>
        assert.equal(new URL(browser.page.url()).searchParams.get('appId'), nextApp)
      );
      await poll(async () => {
        const rows = await historySnapshot(browser.page);
        assert.ok(rows.length && rows.every((row) => row.appId === nextApp));
        assert.equal(rows.find((row) => row.chatId === nextTask.chatId)?.chatGenerateStatus, 0);
      }, 15000);
      release();
      await pause(6500);
      const oldCount = () => browser.calls.filter((row) => row.body.appId === appId).length;
      const after = oldCount();
      await pause(5500);
      assert.equal(oldCount(), after, '切换资源后不再发起旧轮询');
      assert.ok((await historySnapshot(browser.page)).every((row) => row.appId === nextApp));
      await h.finish(nextTask);
      await poll(
        async () =>
          assert.ok(
            (await historySnapshot(browser.page)).every((row) => row.chatGenerateStatus === 1)
          ),
        15000
      );
      await browser.capture(fail ? '迟到错误' : '迟到成功');
      await h.finish(task);
      await browser.session.close();
    }
    return '真实切换资源后旧成功/旧错误均不污染新列表或重启旧轮询，新资源忙闲仍正常刷新；原任务正常收尾';
  }
}
await runNodeCase(
  'FG-CHAT-HISTORY-001',
  Object.fromEntries(Array.from({ length: 7 }, (_, index) => ['C' + (index + 1), execute]))
);
