import assert from 'node:assert/strict';
import { runNodeCase, Blocked } from '../../support/runtime.mjs';
import {
  createScenario,
  required,
  success,
  poll,
  permissionDenied
} from '../../support/scenario.mjs';

/** 一个入口覆盖 UID/代理矩阵；权限反例先验证目标应用存在且正向身份可访问。 */
async function execute(context) {
  const c = createScenario(context);
  const appId = required(c.fixture.apps?.identity, 'apps.identity');
  const a = required(c.actor('A').tmbId, 'actors.A.tmbId');
  await c.keyInfo('A');
  if (['C5', 'C6', 'C7', 'C8'].includes(context.itemId)) await c.keyInfo('proxy');
  if (['C4', 'C5', 'C6', 'C7', 'C8'].includes(context.itemId)) {
    const b = await c.memberInfo(required(c.actor('B').tmbId, 'B.tmbId'));
    if (!b || b.status !== 'active' || String(b.teamId) !== c.fixture.teamId)
      throw new Blocked('B 必须是当前测试团队的有效成员');
  }
  const uid = c.run + '-u1';
  let sequence = 0;

  /** 用固定输出与逐轮持久化共同验证身份；续聊返回原始消息快照供差集比较。 */
  async function allowed(options = {}) {
    const chatId = options.chatId ?? `${c.run}-${context.itemId}-${++sequence}`;
    const question = `${chatId}-round-${options.round ?? 1}`;
    const tmbId = options.tmbId ?? a;
    const value = Object.hasOwn(options, 'uid') ? options.uid : uid;
    const userId = value || tmbId;
    const template = required(c.fixture.echoTemplate, 'echoTemplate');
    assert.ok(
      template.includes('{{question}}') && template.includes('{{userId}}'),
      '回显预期必须独立包含问题和 userId'
    );
    const target = options.appId ?? appId;
    await c.snapshot(target, [chatId]);
    const response = await c.completion({ appId, ...options, uid: value, chatId, question });
    success(response);
    assert.equal(
      response.text,
      template.replaceAll('{{question}}', question).replaceAll('{{userId}}', userId)
    );
    let observed;
    await poll(async () => {
      observed = await c.snapshot(target, [chatId]);
      assert.equal(observed.chats.length, 1);
      assert.equal(String(observed.chats[0].tmbId), tmbId);
      if (value) assert.equal(observed.chats[0].outLinkUid, value);
      else assert.ok(!observed.chats[0].outLinkUid);
      assert.equal(
        observed.items.filter((item) => item.obj === 'Human').length,
        options.round ?? 1
      );
      assert.equal(observed.items.filter((item) => item.obj === 'AI').length, options.round ?? 1);
      assert.equal(observed.logs.length, 1);
      assert.equal(observed.logs[0].userId, userId);
      assert.equal(observed.logs[0].chatItemCount, options.round ?? 1);
    });
    return { chatId, observed };
  }

  /** 拒绝须匹配预期错误类型，并确认该全新 chatId 没有产生消息或统计。 */
  async function denied(options, validation = false) {
    const target = options.appId ?? appId;
    const chatId = `${c.run}-${context.itemId}-reject-${++sequence}`;
    const before = await c.snapshot(target, [chatId]);
    c.trackChat(target, chatId);
    assert.equal(before.chats.length + before.items.length + before.logs.length, 0);
    const response = await c.request({
      role: options.role ?? 'A',
      kind: 'key',
      keyValue: options.keyValue,
      route: '/api/v1/chat/completions',
      body: {
        appId: target,
        chatId,
        messages: [{ role: 'user', content: chatId }],
        stream: false,
        ...options.body
      }
    });
    assert.equal(response.error, true, '必须实际鉴权/校验拒绝，不能将空成功响应当拒绝');
    if (validation) {
      assert.equal(response.http, 400);
      assert.equal(response.json.code, 400);
    } else permissionDenied(response);
    assert.deepEqual(
      await c.snapshot(target, [chatId]),
      before,
      '拒绝请求不写 chats/chatitems/统计'
    );
  }

  switch (context.itemId) {
    case 'C1':
      for (const version of ['v1', 'v2'])
        for (const stream of [false, true]) await allowed({ uid, version, stream });
      return 'v1/v2 × JSON/SSE 四种入口的原值回显、鉴权成员、持久化和异步统计均符合预期';
    case 'C2':
      for (const value of [uid, c.run + '-u2']) {
        const first = await allowed({ uid: value });
        const second = await allowed({ uid: value, chatId: first.chatId, round: 2 });
        for (const item of first.observed.items)
          assert.deepEqual(
            second.observed.items.find((next) => String(next._id) === String(item._id)),
            item,
            '续聊不能覆盖上一轮消息'
          );
      }
      return '两个 UID 各自独立续聊，原消息保留，鉴权成员与使用者没有回退或串用';
    case 'C3':
      for (const value of [undefined, null, '']) await allowed({ uid: value });
      return '省略、null、空串三种输入均回退鉴权成员，兼容缺失/null/空串存储形态';
    case 'C4': {
      const b = required(c.actor('B').tmbId, 'actors.B.tmbId');
      assert.notEqual(a, b, '成员 A/B 必须不同');
      for (const value of ['  中文-' + uid + '  ', 'x'.repeat(1024), b])
        await allowed({ uid: value });
      return '中文空格、1024 字符和另一成员 ID 均原值透传，未改变鉴权身份';
    }
    case 'C5': {
      const b = required(c.actor('B').tmbId, 'actors.B.tmbId');
      for (const value of ['x'.repeat(1025), 7, { id: uid }])
        await denied({ body: { customUid: value } }, true);
      for (const value of [uid, ''])
        await denied({ role: 'proxy', body: { customUid: value, authProxy: { tmbId: b } } }, true);
      return '长度、类型及非空/空 UID 与代理互斥均 HTTP 400/code=400 拒绝，无新增业务数据';
    }
    case 'C6': {
      const b = required(c.actor('B').tmbId, 'actors.B.tmbId');
      const x = required(c.fixture.apps?.deniedForA, 'apps.deniedForA');
      await allowed({ appId: x, role: 'proxy', uid: undefined, authProxy: { tmbId: b }, tmbId: b });
      await denied({ appId: x, body: { customUid: b } });
      await denied({ keyValue: 'fastgpt-invalid-' + c.run, body: { customUid: uid } });
      return 'B 正向访问成立，A 的 customUid 不授予 B 权限；无效 Key 不执行工作流';
    }
    case 'C7': {
      const b = c.actor('B');
      for (const authProxy of [
        { tmbId: required(b.tmbId, 'B.tmbId') },
        { username: required(b.username, 'B.username') },
        { tmbId: b.tmbId, username: required(c.actor('A').username, 'A.username') }
      ])
        await allowed({ role: 'proxy', uid: undefined, authProxy, tmbId: b.tmbId });
      return '按 ID/用户名代理 B，二者同时提供时仅使用 ID，回显与存储均归 B';
    }
    case 'C8': {
      const foreign = await c.memberInfo(required(c.fixture.members?.foreign, 'members.foreign'));
      const departed = await c.memberInfo(
        required(c.fixture.members?.departed, 'members.departed')
      );
      if (
        !foreign ||
        String(foreign.teamId) === c.fixture.teamId ||
        !departed ||
        String(departed.teamId) !== c.fixture.teamId ||
        departed.status !== 'leave'
      )
        throw new Blocked('C8 需要分别核验跨团队成员和同团队已离职成员');
      const b = required(c.actor('B').tmbId, 'B.tmbId');
      const y = required(c.fixture.apps?.deniedForB, 'apps.deniedForB');
      await allowed({
        appId: y,
        role: 'proxy',
        uid: undefined,
        tmbId: required(c.actor('proxy').tmbId, 'proxy.tmbId')
      });
      for (const tmbId of [
        required(c.fixture.members?.foreign, 'members.foreign'),
        required(c.fixture.members?.departed, 'members.departed'),
        '000000000000000000000000'
      ])
        await denied({ role: 'proxy', body: { authProxy: { tmbId } } });
      await denied({ role: 'proxy', appId: y, body: { authProxy: { tmbId: b } } });
      await denied({ body: { authProxy: { tmbId: b } } });
      return '不存在/离职/跨团队、代理成员无应用权限和未开启代理 Key 均拒绝，没有新消息或统计';
    }
  }
}

await runNodeCase(
  'FG-INTEGRATION-OPENAPI-001',
  Object.fromEntries(Array.from({ length: 8 }, (_, i) => ['C' + (i + 1), execute]))
);
