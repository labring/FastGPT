import assert from 'node:assert/strict';
import { runNodeCase } from '../../../support/runtime.mjs';
import { success } from '../../../support/scenario.mjs';
import { workflowScenario } from './workflow-api.mjs';
import { openEventStream } from '../../../support/stream.mjs';

/** 各分支变体独立发布并以真实外部调用集合校验，避免仅凭最终文本判断路由。 */
async function runBranchVariants(c, variants) {
  for (const variant of variants) {
    const graph = await c.load('basic-branch');
    if (variant.condition) {
      const branch = graph.nodes
        .find((node) => node.nodeId === 'Choose')
        .inputs.find((input) => input.key === 'ifElseList').value[0];
      branch.condition = variant.condition;
      branch.list.push({
        variable: ['VARIABLE_NODE_ID', 'flag'],
        condition: 'equalTo',
        value: 'true',
        valueType: 'input'
      });
    }
    const appId = await c.create(`branch-${variant.name}`, graph);
    const question = `${c.run}-${variant.name}`;
    const response = await c.complete(appId, {
      chatId: question,
      question,
      stream: true,
      extra: { variables: { n: variant.n, flag: variant.flag } }
    });
    success(response);
    const stored = await c.persisted(appId, question);
    const rows = stored.rows.map((row) => row.data);
    const calls = (await c.gateObservations())
      .filter((item) => item.path === '/count' && item.body.runId === question)
      .map((item) => item.body.node)
      .sort();
    assert.deepEqual(calls, ['Merge', variant.expectedNode].sort());
    assert.equal(rows.find((row) => row.nodeId === 'Choose')?.ifElseResult, variant.label);
    assert.equal(rows.filter((row) => row.nodeId === 'Merge').length, 1);
    assert.equal(
      rows.some((row) => row.nodeId === 'Nested'),
      variant.expectedNode.startsWith('Low')
    );
    assert.ok(!rows.some((row) => row.nodeId === 'Unreachable'));
    c.record('实际分支与调用集合', { variant, calls, rows });
  }
}

await runNodeCase('FG-APP-WORKFLOW-070', {
  async C1(context) {
    const c = await workflowScenario(context);
    const appId = await c.create('serial-dataflow', await c.load('basic-dataflow'));
    for (const suffix of ['one', 'two']) {
      const question = `${c.run}-${suffix}`;
      const chatId = `${c.run}-serial-${suffix}`;
      const response = await c.complete(appId, { chatId, question, stream: true });
      success(response);
      const stored = await c.persisted(appId, chatId);
      const rows = stored.rows.map((row) => row.data);
      for (const nodeId of ['Start', 'Compose', 'Remember', 'Reply']) {
        assert.equal(rows.filter((row) => row.nodeId === nodeId).length, 1, `${nodeId} 应执行一次`);
      }
      assert.equal(rows.find((row) => row.nodeId === 'Compose').textOutput, `V1:${question}`);
      assert.equal(stored.chats[0].variables.a, `V1:${question}`);
      const expected = `a=V1:${question}|node=V1:${question}`;
      assert.equal(rows.find((row) => row.nodeId === 'Reply').textOutput, expected);
      assert.equal(response.text.trim(), expected);
    }
    return '两个独立会话的四个节点各执行一次，引用、变量更新、下游回复和最终持久化均与各自问题一致。';
  },
  async C2(context) {
    const c = await workflowScenario(context);
    const appId = await c.create('parallel-fan-in', await c.load('basic-fan-in'));
    for (const first of ['Fast', 'Slow']) {
      const second = first === 'Fast' ? 'Slow' : 'Fast';
      const question = `${c.run}-${first}`;
      const chatId = `${c.run}-fan-in-${first}`;
      const response = await c.completion({
        appId,
        chatId,
        question,
        role: 'owner',
        kind: 'state',
        version: 'v2',
        stream: true,
        raw: true
      });
      assert.equal(response.status, 200);
      const stream = openEventStream(response);
      const { events } = stream;
      context.itemFinalizers.push(async () => {
        try {
          await Promise.all([c.release(`${question}-Fast`), c.release(`${question}-Slow`)]);
        } finally {
          await stream.cancel();
        }
      });
      await c.poll(async () => {
        const observations = await c.gateObservations();
        for (const name of ['Fast', 'Slow']) {
          assert.ok(
            observations.some((item) => item.body.runId === `${question}-${name}`),
            `${name} 分支尚未到达 gate`
          );
        }
      });
      await c.release(`${question}-${first}`);
      await c.poll(async () => {
        assert.ok(events.some((event) => event.data?.nodeId === `${first}Value`));
      });
      const interim = (await c.gateObservations()).filter((item) => item.body.runId === question);
      assert.ok(!interim.some((item) => item.body.node === 'Merge'));
      assert.ok(!events.some((event) => event.data?.nodeId === 'Reply'));
      await c.release(`${question}-${second}`);
      const completed = await stream.finished;
      assert.equal(completed.error, undefined, 'SSE 读取不能静默失败');
      assert.equal(completed.cancelled, false, '正常汇合不能提前取消');
      assert.equal(completed.done, true);
      assert.ok(events.some((event) => event.data === '[DONE]'));
      assert.ok(!events.some((event) => event.event === 'error'));
      const stored = await c.persisted(appId, chatId);
      const rows = stored.rows.map((row) => row.data);
      assert.equal(rows.filter((row) => row.nodeId === 'Merge').length, 1);
      assert.equal(rows.find((row) => row.nodeId === 'Reply')?.textOutput, 'FAST|SLOW');
      const final = (await c.gateObservations()).filter((item) => item.body.runId === question);
      assert.equal(final.filter((item) => item.body.node === 'Merge').length, 1);
      assert.ok(!final.some((item) => item.body.node === 'Unreachable'));
      c.record('分叉汇合逐步放行', { first, second, interim, final, events });
    }
    return '快慢两种放行顺序均实际到达屏障；单侧完成时未汇合，两侧完成后只执行一次 Merge，未连接节点不运行。';
  },
  async C3(context) {
    const c = await workflowScenario(context);
    await runBranchVariants(c, [
      { name: 'first-match', n: 5, flag: true, expectedNode: 'LowTrue', label: 'IF' },
      { name: 'else-if', n: 15, flag: true, expectedNode: 'Mid', label: 'ELSE IF 1' },
      { name: 'else', n: 25, flag: true, expectedNode: 'High', label: 'ELSE' },
      { name: 'and', n: 5, flag: false, condition: 'AND', expectedNode: 'Mid', label: 'ELSE IF 1' },
      { name: 'or', n: 15, flag: true, condition: 'OR', expectedNode: 'LowTrue', label: 'IF' }
    ]);
    return '首个匹配、ELSE IF、ELSE 及 AND/OR 共五种变体均核对真实分支和外部调用集合。';
  },
  async C4(context) {
    const c = await workflowScenario(context);
    await runBranchVariants(c, [
      { name: 'nested-false', n: 5, flag: false, expectedNode: 'LowFalse', label: 'IF' },
      { name: 'nested-skipped', n: 15, flag: true, expectedNode: 'Mid', label: 'ELSE IF 1' }
    ]);
    return '嵌套 false 与整体跳过两种变体均只执行目标分支，Merge 各一次且未连接节点未执行。';
  },
  async C5(context) {
    const c = await workflowScenario(context);
    for (const initial of [0, 2]) {
      const graph = await c.load('basic-cycle');
      graph.chatConfig.variables.find((variable) => variable.key === 'n').defaultValue = initial;
      const appId = await c.create(`bounded-cycle-${initial}`, graph);
      const chatId = `${c.run}-cycle-${initial}`;
      const response = await c.complete(appId, { chatId, question: chatId, stream: true });
      success(response);
      const stored = await c.persisted(appId, chatId);
      const rows = stored.rows.map((row) => row.data);
      const expectedCount = initial === 0 ? 3 : 1;
      for (const nodeId of ['Increment', 'Count', 'Continue']) {
        const ids = new Set(rows.filter((row) => row.nodeId === nodeId).map((row) => row.id));
        assert.equal(ids.size, expectedCount, `${nodeId} 的迭代实例数量不正确`);
      }
      assert.equal(rows.filter((row) => row.nodeId === 'Reply').length, 1);
      const calls = (await c.gateObservations()).filter(
        (item) => item.path === '/count' && item.body.runId === chatId
      );
      assert.deepEqual(
        calls.map((item) => item.body.n),
        initial === 0 ? [1, 2, 3] : [3]
      );
      assert.equal(stored.chats[0].variables.n, 3);
      assert.equal(response.text.trim(), 'DONE:3');
      c.record('有出口回环真实迭代', { initial, calls, rows });
    }
    return '初始值 0 和 2 的有出口回环均完成，外部计数、节点实例、最终变量与回复一致。';
  },
  async C6(context) {
    const c = await workflowScenario(context);
    const graph = await c.load('basic-dataflow');
    const appId = await c.create('draft-publish', graph);
    const appQuery = { _id: new c.ObjectId(appId), teamId: new c.ObjectId(c.fixture.teamId) };
    const appBefore = await c.db.collection('apps').findOne(appQuery);
    const v1Id = appBefore?.publishedVersionId;
    assert.ok(v1Id, '必须取得正式发布的 V1 版本 ID');

    // 先建立聊天清理登记，再使用同一 app 的独立 chatId 测试请求体中的未发布图。
    const firstChatId = `${c.run}-v1-before`;
    const first = await c.complete(appId, {
      chatId: firstChatId,
      question: firstChatId,
      stream: true
    });
    success(first);
    assert.equal(first.text.trim(), `a=V1:${firstChatId}|node=V1:${firstChatId}`);
    const compose = graph.nodes.find((node) => node.nodeId === 'Compose');
    compose.inputs.find((input) => input.key === 'system_textareaInput').value =
      'V2:{{$Start.userChatInput$}}';
    const debugChatId = `${c.run}-debug-v2`;
    c.trackChat(appId, debugChatId);
    const debug = await c.request({
      kind: 'state',
      route: '/api/core/chat/chatTest',
      body: {
        ...graph,
        appId,
        appName: 'FG-TEST draft V2',
        chatId: debugChatId,
        responseChatItemId: `${c.run}-response`,
        messages: [{ role: 'user', content: debugChatId }]
      }
    });
    success(debug);
    assert.equal(debug.text.trim(), `a=V2:${debugChatId}|node=V2:${debugChatId}`);
    const appAfterDebug = await c.db.collection('apps').findOne(appQuery);
    assert.equal(String(appAfterDebug.publishedVersionId), String(v1Id));

    const oldChatId = `${c.run}-v1-after-debug`;
    const old = await c.complete(appId, { chatId: oldChatId, question: oldChatId, stream: true });
    success(old);
    assert.equal(old.text.trim(), `a=V1:${oldChatId}|node=V1:${oldChatId}`);
    success(
      await c.request({
        route: `/api/core/app/version/publish?appId=${appId}`,
        body: { ...graph, isPublish: true, versionName: 'FG-TEST V2' }
      })
    );
    const appAfterPublish = await c.db.collection('apps').findOne(appQuery);
    const v2Id = appAfterPublish?.publishedVersionId;
    assert.ok(v2Id && String(v2Id) !== String(v1Id));
    const newChatId = `${c.run}-v2-after-publish`;
    const current = await c.complete(appId, {
      chatId: newChatId,
      question: newChatId,
      stream: true
    });
    success(current);
    assert.equal(current.text.trim(), `a=V2:${newChatId}|node=V2:${newChatId}`);
    const versions = await c.db
      .collection('app_versions')
      .find({
        appId: new c.ObjectId(appId),
        _id: { $in: [v1Id, v2Id] }
      })
      .toArray();
    assert.equal(versions.length, 2);
    for (const [id, prefix] of [
      [v1Id, 'V1:'],
      [v2Id, 'V2:']
    ]) {
      const version = versions.find((item) => String(item._id) === String(id));
      const input = version.nodes
        .find((node) => node.nodeId === 'Compose')
        .inputs.find((item) => item.key === 'system_textareaInput');
      assert.ok(input.value.startsWith(prefix));
    }
    c.record('实际发布版本与独立会话', {
      v1Id,
      v2Id,
      versions,
      firstChatId,
      debugChatId,
      oldChatId,
      newChatId
    });
    return '未发布请求图仅影响 chatTest；正式入口保持 V1，发布新版本后切换至 V2，版本 ID 与实际图均已核对。';
  }
});
