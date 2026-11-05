import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { runNodeCase } from '../../support/runtime.mjs';
import { createScenario, required, success, poll } from '../../support/scenario.mjs';
import { getGate, getLeaseReader } from '../../support/gate.mjs';

/** 仅验证已明确编号的 API 主链路及完整竞争场景；其他入口/故障项保持独立。 */
async function execute(context) {
  const c = createScenario(context);
  await c.keyInfo('A');
  const appId = required(c.fixture.apps?.gate, 'apps.gate');
  const instances =
    context.itemId === 'C2'
      ? required(c.fixture.lease?.instances, 'lease.instances（两个独立服务实例）')
      : [];
  if (context.itemId === 'C2')
    assert.ok(instances.length >= 2 && new Set(instances).size >= 2, 'C2 必须配置两个不同实例地址');
  const read = await getLeaseReader(context, c);
  const gate = await getGate(context, c);
  let sequence = 0;

  function start({ chatId, baseUrl, label, version = 'v2' }) {
    const question = `${c.run}-${context.itemId}-${label}-${++sequence}`;
    const barrier = gate.register(question);
    const dataId = randomBytes(12).toString('hex');
    const result = gate.track(
      c.completion({
        appId,
        chatId,
        question,
        baseUrl,
        version,
        stream: true,
        extra: { responseChatItemId: dataId },
        extraHeaders: { 'x-fastgpt-stream-resume': '1' }
      })
    );
    return { barrier, result, question, dataId };
  }
  /** 正常放行后核对协议、释放和唯一 dataId 消息对；previous 必须完整保留。 */
  async function done(task, { chatId, previous = [] }) {
    task.barrier.release();
    const outcome = await task.result;
    if (outcome.error) throw outcome.error;
    success(outcome.value);
    assert.equal(
      outcome.value.text,
      c.fixture.echoTemplate
        .replaceAll('{{question}}', task.question)
        .replaceAll('{{userId}}', c.actor('A').tmbId)
    );
    await poll(async () => {
      assert.equal((await read(appId, chatId)).owner, null);
    });
    return poll(async () => {
      const data = await c.snapshot(appId, [chatId]);
      assert.equal(data.chats.length, 1);
      assert.equal(data.items.length, previous.length + 2);
      for (const item of previous)
        assert.deepEqual(
          data.items.find((next) => String(next._id) === String(item._id)),
          item,
          '续聊保留上一轮原记录'
        );
      const added = data.items.filter(
        (row) => !previous.some((item) => String(item._id) === String(row._id))
      );
      assert.deepEqual(added.map((row) => row.obj).sort(), ['AI', 'Human']);
      assert.ok(
        added.every((row) => row.dataId === task.dataId),
        '精确新增本轮 dataId 的 Human/AI 对'
      );
      assert.equal(Object.hasOwn(data.chats[0], 'chatGenerateStatus'), false);
      return data;
    });
  }

  if (context.itemId === 'C1-API') {
    for (const version of ['v1', 'v2']) {
      const chatId = `${c.run}-${version}`;
      assert.equal((await read(appId, chatId)).owner, null);
      const task = start({ chatId, baseUrl: c.fixture.baseUrl, label: 'lease', version });
      await task.barrier.entered();
      const begin = Date.now(),
        samples = [];
      for (let second = 0; second <= 65; second++) {
        await new Promise((resolve) =>
          setTimeout(resolve, Math.max(0, begin + second * 1000 - Date.now()))
        );
        const value = await read(appId, chatId);
        assert.ok(value.owner && value.pttl > 0 && value.pttl <= 60000);
        if (samples.length) assert.equal(value.owner, samples[0].owner);
        samples.push(value);
      }
      assert.ok(
        samples.some((sample, i) => i > 0 && sample.pttl > samples[i - 1].pttl + 2000),
        '65 秒采样中应实际看到续租回升'
      );
      const first = await done(task, { chatId });
      const nextChat = start({ chatId, baseUrl: c.fixture.baseUrl, label: 'next-round', version });
      await nextChat.barrier.entered();
      await done(nextChat, { chatId, previous: first.items });
    }
    return 'v1/v2 各完成 65 秒无输出续租、原 owner/PTTL 采样、收尾释放与下一轮精确新增消息';
  }

  /** 同实例串行竞争与跨实例同时竞争均只允许一个执行进入 gate，拒绝方不得落库。 */
  async function conflict(crossInstance) {
    const chatId = `${c.run}-conflict-${crossInstance}`;
    let owner, contender;
    if (!crossInstance) {
      owner = start({ chatId, baseUrl: instances[0], label: 'owner' });
      await owner.barrier.entered();
      contender = start({ chatId, baseUrl: instances[0], label: 'contender' });
    } else {
      const first = start({ chatId, baseUrl: instances[0], label: 'race-A' });
      const second = start({ chatId, baseUrl: instances[1], label: 'race-B' });
      await poll(() => assert.ok(first.barrier.count() + second.barrier.count() > 0));
      assert.equal(first.barrier.count() + second.barrier.count(), 1);
      [owner, contender] = first.barrier.count() ? [first, second] : [second, first];
    }
    const before = await c.snapshot(appId, [chatId]);
    const token = await read(appId, chatId);
    assert.ok(token.owner && token.pttl > 0);
    let rejected;
    contender.result.then((value) => {
      rejected = value;
    });
    const deadline = Date.now() + 30000;
    // 双执行是业务失败，立即退出；finalizer 会放行两个连接，不等待业务超时。
    while (!rejected) {
      assert.equal(contender.barrier.count(), 0, '竞争失败的请求不能进入工作流');
      assert.ok(Date.now() < deadline, '竞争请求未在 30 秒内明确拒绝');
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (rejected.error) throw rejected.error;
    const error =
      rejected.value.events.find((event) => event.event === 'error')?.data ?? rejected.value.json;
    assert.equal(rejected.value.error, true);
    assert.equal(error.code, 504001);
    assert.equal(contender.barrier.count(), 0);
    assert.equal((await read(appId, chatId)).owner, token.owner);
    assert.deepEqual(
      (await c.snapshot(appId, [chatId])).items,
      before.items,
      '竞争失败不新增/覆盖消息'
    );
    assert.ok(!before.items.some((item) => item.dataId === contender.dataId));
    await done(owner, { chatId });
  }
  await conflict(false);
  await conflict(true);
  return '同实例第二连接及双实例同时竞争均只有一个执行进入 gate；拒绝请求无消息写入，owner 不变';
}

await runNodeCase('FG-CHAT-CONVERSATION-001', { 'C1-API': execute, C2: execute });
