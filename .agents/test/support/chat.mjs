import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { createScenario, poll, required } from './scenario.mjs';
import { getGate } from './gate.mjs';
import { openEventStream } from './stream.mjs';
import { redisTools } from './private.mjs';

/** 真实生成/恢复的共享夹具；断开仅影响连接，清理前等待后台 lease 释放。 */
export async function chatHarness(context) {
  const c = createScenario(context),
    redis = await redisTools(context, c),
    gate = await getGate(context, c);
  const active = [],
    connections = [];
  let sequence = 0;
  context.itemFinalizers.push(async () => {
    gate.releaseAll();
    await Promise.all(connections.map((stream) => stream.cancel()));
    for (const task of active)
      await poll(
        async () => assert.equal(await redis.client.get(redis.leaseKey(task)), null),
        120000
      );
  });
  async function start(options = {}) {
    const appId = options.appId ?? required(c.fixture.apps.resume, 'apps.resume');
    const chatId = options.chatId ?? `${c.run}-${context.itemId}-${++sequence}`;
    const question = `${c.run}-${context.itemId}-question-${++sequence}`,
      dataId = randomBytes(12).toString('hex');
    const barrier = gate.register(question),
      before = await c.snapshot(appId, [chatId]);
    const task = {
      appId,
      sourceId: appId,
      sourceType: 'app',
      chatId,
      question,
      dataId,
      barrier,
      before
    };
    active.push(task);
    const response = await c.completion({
      appId,
      chatId,
      question,
      raw: true,
      stream: true,
      kind: 'state',
      role: options.role ?? 'A',
      version: options.version ?? 'v2',
      extra: { ...options.extra, responseChatItemId: dataId },
      extraHeaders: Object.hasOwn(options, 'header')
        ? options.header === undefined
          ? {}
          : { 'x-fastgpt-stream-resume': options.header }
        : { 'x-fastgpt-stream-resume': '1' }
    });
    const stream = openEventStream(response);
    connections.push(stream);
    gate.track(stream.finished);
    task.stream = stream;
    await barrier.entered();
    return task;
  }
  async function resume(task, { sse = true } = {}) {
    const route =
      '/api/core/chat/resume?' + new URLSearchParams({ appId: task.appId, chatId: task.chatId });
    const response = await c.request({
      role: 'A',
      kind: 'state',
      method: 'GET',
      route,
      raw: sse,
      extraHeaders: sse ? { Accept: 'text/event-stream' } : {}
    });
    if (!sse) return response;
    const stream = openEventStream(response);
    connections.push(stream);
    gate.track(stream.finished);
    return stream;
  }
  function expected(task, tail = true) {
    const count =
      task.appId === c.fixture.apps.resume
        ? required(c.fixture.stream.prefixPieces, 'stream.prefixPieces')
        : 1;
    return (
      Array.from(
        { length: count },
        (_, index) => '\n' + task.question + '|P' + String(index).padStart(2, '0')
      ).join('') + (tail ? '\n' + task.question + '|TAIL' : '')
    );
  }
  async function finish(task, { error = false } = {}) {
    task.barrier.release(
      error ? { status: 500, value: { error: 'FGTEST controlled node error' } } : {}
    );
    const end = await task.stream.finished;
    c.record('原流', { end, events: task.stream.events });
    if (!end.cancelled) {
      assert.equal(end.error, undefined);
      assert.equal(end.done, true);
      if (!error) assert.equal(task.stream.text(), expected(task));
    }
    await poll(async () => assert.equal(await redis.client.get(redis.leaseKey(task)), null), 45000);
    return poll(async () => {
      const value = await c.snapshot(task.appId, [task.chatId]),
        added = value.items.filter((row) => row.dataId === task.dataId);
      assert.equal(value.items.length, task.before.items.length + 2, '只新增本轮 Human/AI 对');
      assert.deepEqual(added.map((row) => row.obj).sort(), ['AI', 'Human']);
      for (const row of task.before.items)
        assert.deepEqual(
          value.items.find((item) => String(item._id) === String(row._id)),
          row,
          '原轮次保留'
        );
      const text = added
        .find((row) => row.obj === 'AI')
        .value.filter((item) => typeof item.text?.content === 'string')
        .map((item) => item.text.content)
        .join('');
      if (!error) assert.equal(text, expected(task));
      assert.ok(
        !Object.hasOwn(value.chats[0], 'chatGenerateStatus') ||
          task.before.chats.some((row) => Object.hasOwn(row, 'chatGenerateStatus'))
      );
      return value;
    }, 30000);
  }
  return { c, redis, gate, start, resume, expected, finish, connections };
}

/** Node 用例也启动真实 Chromium，同一报告内同时保存 API 和 UI 证据。 */
export async function browserSession(context, { scenario: c, url, role = 'A' }) {
  if (!context.resources.has('browser')) {
    const { chromium } = createRequire(new URL('../../../package.json', import.meta.url))(
      '@playwright/test'
    );
    const browser = await chromium.launch({
      headless: process.env.FASTGPT_TEST_HEADED !== '1',
      slowMo: Number(process.env.FASTGPT_TEST_SLOW_MO ?? 0)
    });
    context.resources.set('browser', browser);
    context.finalizers.unshift(async () => browser.close());
  }
  const session = await context.resources.get('browser').newContext({
    storageState: c.secret(c.actor(role).stateEnv),
    viewport: { width: 1600, height: 1000 },
    locale: 'zh-CN'
  });
  context.itemFinalizers.unshift(async () => session.close());
  const page = await session.newPage();
  await page.addLocatorHandler(
    page.getByRole('dialog', { name: '系统消息', exact: true }),
    async (dialog) => dialog.getByRole('button', { name: '已读', exact: true }).click()
  );
  if (url) {
    const target = new URL(url, c.fixture.baseUrl);
    // 当前聊天路由用 pane 决定页面，chatId 由真实历史点击写入 tab store。
    // 仅拼 chatId query 不会选中会话；通过唯一标题定位，不能直接写 Zustand。
    if (target.pathname === '/chat') {
      target.searchParams.set('pane', 'ra');
      const chatId = target.searchParams.get('chatId'),
        appId = target.searchParams.get('appId');
      let title;
      if (chatId && appId) {
        const key = `history-title:${appId}:${chatId}`;
        if (!context.resources.has(key)) {
          context.resources.set(
            key,
            (async () => {
              const value = 'FG-TEST-' + randomBytes(8).toString('hex');
              const response = await c.request({
                role,
                kind: 'state',
                method: 'PUT',
                route: '/api/core/chat/history/updateHistory',
                body: { appId, chatId, customTitle: value }
              });
              assert.equal(response.json?.code, 200);
              return value;
            })()
          );
        }
        // 同时打开同一历史的多个浏览器共享改名完成信号，避免两个标题互相覆盖。
        title = await context.resources.get(key);
      }
      await page.goto(target.href, { timeout: 120000 });
      if (chatId && appId)
        await page.locator('.chatHistoryItem').filter({ hasText: title }).click({ timeout: 60000 });
    } else await page.goto(target.href, { timeout: 120000 });
  }
  return {
    page,
    session,
    async capture(label) {
      const name = `${context.itemId}-${label}-${randomBytes(3).toString('hex')}.png`;
      await page.screenshot({ path: path.join(context.directory, name), fullPage: true });
      context.attachments.push({ path: name, label });
    }
  };
}
