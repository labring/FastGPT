import assert from 'node:assert/strict';
import { runNodeCase } from '../../support/runtime.mjs';
import { chatHarness, browserSession } from '../../support/chat.mjs';
import { poll, success } from '../../support/scenario.mjs';

/** UI 断言使用可见正文，逐段检查顺序和唯一性；不把接口内容当作页面已展示。 */
async function visibleAnswer(h, { browser, task, tail = true }) {
  await poll(async () => {
    const text = await browser.page.locator('body').innerText();
    let previous = -1;
    for (const part of h.expected(task, tail).split('\n').filter(Boolean)) {
      const at = text.indexOf(part);
      assert.ok(at > previous, '页面缺少或乱序段落 ' + part);
      assert.equal(text.indexOf(part, at + part.length), -1, '页面出现重复段落');
      previous = at;
    }
    h.c.record('可见回复', { text });
  }, 60000);
  await browser.capture(tail ? '最终回复' : '首段回放');
}

/** 覆盖真实 opt-in、断开/多连接回放、持久化回退、内存保护和错误收尾。 */
async function execute(context) {
  const h = await chatHarness(context),
    { c, redis } = h;
  if (context.itemId === 'C1') {
    for (const [version, header, enabled] of [
      ['v2', '1', true],
      ['v2', undefined, false],
      ['v2', '0', false],
      ['v2', ' TRUE ', true],
      ['v1', '1', false]
    ]) {
      const task = await h.start({ version, header }),
        state = await redis.observe(task);
      assert.ok(state.lease && state.pttl > 0);
      assert.equal(Boolean(state.active), enabled);
      assert.equal(state.stream.length > 0, enabled);
      await h.finish(task);
    }
    return 'v2 opt-in 1/省略/0/大小写空格与 v1 禁用矩阵，实际 lease/mirror 和完整输出均核对';
  }
  if (context.itemId === 'C2') {
    const task = await h.start(),
      first = await browserSession(context, {
        scenario: c,
        url: `/chat?appId=${task.appId}&chatId=${task.chatId}`
      });
    await visibleAnswer(h, { browser: first, task, tail: false });
    await task.stream.cancel();
    await first.session.close();
    const whileDisconnected = await redis.observe(task);
    assert.ok(whileDisconnected.lease && whileDisconnected.active);
    const observer = await h.resume(task);
    await observer.wait((event) => event.event === 'resumePhase' && event.data === 'live');
    assert.deepEqual(
      observer.events.filter((event) => event.event === 'resumePhase').map((event) => event.data),
      ['catchup', 'live']
    );
    const second = await browserSession(context, {
      scenario: c,
      url: `/chat?appId=${task.appId}&chatId=${task.chatId}`
    });
    await visibleAnswer(h, { browser: second, task, tail: false });
    await h.finish(task);
    const end = await observer.finished;
    assert.equal(end.error, undefined);
    assert.equal(end.done, true);
    assert.equal(observer.text(), h.expected(task));
    await visibleAnswer(h, { browser: second, task });
    const after = await redis.observe(task);
    assert.equal(after.lease, null);
    assert.ok(after.streamTtl > 0 && after.streamTtl <= c.fixture.stream.postCompleteTtl);
    c.record('断开后真实恢复流', { end, events: observer.events });
    return '浏览器和原流断开后后台继续；重进与独立恢复连接均 catchup/live，UI 全部段落完整无重复，完成 TTL 与 Mongo 一致';
  }
  if (context.itemId === 'C3') {
    const task = await h.start();
    assert.ok((await redis.observe(task)).stream.length >= 51, '须有超过单页的真实缓存事件');
    const observers = await Promise.all([h.resume(task), h.resume(task)]);
    for (const stream of observers)
      await stream.wait((event) => event.event === 'resumePhase' && event.data === 'live');
    const browsers = await Promise.all([
      browserSession(context, {
        scenario: c,
        url: `/chat?appId=${task.appId}&chatId=${task.chatId}`
      }),
      browserSession(context, {
        scenario: c,
        url: `/chat?appId=${task.appId}&chatId=${task.chatId}`
      })
    ]);
    for (const browser of browsers) await visibleAnswer(h, { browser: browser, task, tail: false });
    await browsers[0].page.reload();
    await visibleAnswer(h, { browser: browsers[0], task, tail: false });
    await h.finish(task);
    for (const stream of observers) {
      const end = await stream.finished;
      assert.equal(end.error, undefined);
      assert.equal(end.done, true);
      assert.equal(stream.text(), h.expected(task));
      c.record('独立游标回放', { events: stream.events, end });
    }
    for (const browser of browsers) await visibleAnswer(h, { browser: browser, task });
    assert.equal((await c.snapshot(task.appId, [task.chatId])).items.length, 2);
    return '至少 51 个真实事件被两个独立恢复连接完整回放；两浏览器含刷新后的全部段落唯一且同序，无额外轮次';
  }
  if (context.itemId === 'C4') {
    const task = await h.start(),
      busy = await h.resume(task, { sse: false });
    assert.equal(busy.http, 406);
    assert.equal(busy.json.code, 406);
    await h.finish(task);
    assert.ok((await redis.observe(task)).streamTtl > 0);
    const first = await h.resume(task);
    await first.finished;
    assert.ok(first.events.some((event) => event.event === 'resumeCompleted'));
    assert.ok(first.events.some((event) => event.event === 'done' && event.data === '[DONE]'));
    const records = first.events.find((event) => event.event === 'resumeCompleted').data.records;
    const keys = redis.mirrorKeys(task);
    await poll(
      async () => assert.equal(await redis.client.exists(keys.keyOfStream), 0),
      (c.fixture.stream.postCompleteTtl + 10) * 1000
    );
    const expired = await h.resume(task);
    await expired.finished;
    assert.deepEqual(
      expired.events.find((event) => event.event === 'resumeCompleted').data.records,
      records
    );
    const idle = success(await h.resume(task, { sse: false }));
    assert.deepEqual(idle.records, records);
    assert.equal((await c.snapshot(task.appId, [task.chatId])).items.length, 2);
    c.record('终态恢复对照', { beforeExpiry: first.events, afterExpiry: expired.events, idle });
    return '生成中 JSON GET 406；空闲时在真实缓存存活/过期两种情况下 SSE 与 JSON 均返回同一持久化记录和正确 DONE';
  }
  if (context.itemId === 'C5') {
    await redis.assertPrivate();
    const unmirrored = await h.start({ header: undefined }),
      waiting = await h.resume(unmirrored);
    await waiting.wait((event) => event.event === 'resumePhase' && event.data === 'live');
    assert.ok((await redis.observe(unmirrored)).lease);
    await h.finish(unmirrored);
    await waiting.finished;
    assert.ok(waiting.events.some((event) => event.event === 'resumeCompleted'));
    c.record('未启用镜像的等待补全', waiting.events);
    const old = await redis.client.config('GET', 'maxmemory');
    try {
      const info = await redis.client.info('memory'),
        used = Number(info.match(/^used_memory:(\d+)/m)[1]);
      const maximum = Math.ceil(used * 1.5);
      await redis.client.config('SET', 'maxmemory', maximum);
      c.record('私有 Redis 实际内存阈值', { used, maxmemory: maximum, threshold: 0.5 });
      const pressure = await h.start(),
        state = await redis.observe(pressure);
      assert.ok(state.lease);
      assert.equal(state.active, null);
      assert.ok(state.unavailable);
      const stream = await h.resume(pressure);
      await stream.wait((event) => event.event === 'resumeUnavailable');
      await stream.wait((event) => event.event === 'comment' && event.data === 'ping');
      await h.finish(pressure);
      await stream.finished;
      assert.ok(stream.events.some((event) => event.event === 'resumeCompleted'));
      assert.ok(stream.events.some((event) => event.data === '[DONE]'));
      c.record('实际内存保护恢复', { state, events: stream.events });
    } finally {
      await redis.client.config('SET', 'maxmemory', old[1]);
    }
    return '真实无镜像与实际私有 Redis 内存阈值两种等待均保持 lease，保护时有 unavailable/ping，完成后补持久化 records';
  }
  if (context.itemId === 'C6') {
    const task = await h.start(),
      resumed = await h.resume(task);
    await resumed.wait((event) => event.event === 'resumePhase' && event.data === 'live');
    const browser = await browserSession(context, {
      scenario: c,
      url: `/chat?appId=${task.appId}&chatId=${task.chatId}`
    });
    await visibleAnswer(h, { browser: browser, task, tail: false });
    const saved = await h.finish(task, { error: true });
    await resumed.finished;
    const ai = saved.items.find((row) => row.obj === 'AI' && row.dataId === task.dataId);
    const nodeError = task.stream.events.find(
      (event) => event.event === 'flowNodeResponse' && event.data?.errorText
    )?.data.errorText;
    assert.ok(nodeError?.includes('FGTEST controlled node error'), '原流须有真实节点运行错误');
    const resumedRecords = resumed.events.find((event) => event.event === 'resumeCompleted')?.data
      .records;
    assert.ok(
      JSON.stringify(resumedRecords).includes('FGTEST controlled node error'),
      '恢复完成记录保留真实错误'
    );
    await browser.page.reload();
    await visibleAnswer(h, { browser, task, tail: false });
    await poll(
      async () =>
        assert.ok(
          (await browser.page.locator('body').innerText()).includes('FGTEST controlled node error')
        ),
      30000
    );
    const status = success(
      await c.request({
        role: 'A',
        kind: 'state',
        route: '/api/core/chat/history/getHistoryStatus',
        body: { appId: task.appId, chatIds: [task.chatId] }
      })
    );
    assert.equal(status.list[0].chatGenerateStatus, 1);
    await browser.capture('错误收尾');
    c.record('错误三通道', { original: task.stream.events, resume: resumed.events, ai, status });
    const next = await h.start({ chatId: task.chatId });
    await h.finish(next);
    return 'gate 实际错误在原流/恢复流/刷新 UI 留证，有效前缀保留，状态回空闲且同会话下一轮成功';
  }
}
await runNodeCase(
  'FG-CHAT-CONVERSATION-003',
  Object.fromEntries(Array.from({ length: 6 }, (_, index) => ['C' + (index + 1), execute]))
);
