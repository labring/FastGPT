import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { runNodeCase } from '../../../support/runtime.mjs';
import { success } from '../../../support/scenario.mjs';
import { workflowScenario } from './workflow-api.mjs';

const handlers = {
  async C1(context) {
    const c = await workflowScenario(context);
    const appId = await c.create('protocols', await c.load('input-precedence'));
    for (const version of ['v1', 'v2'])
      for (const stream of [false, true])
        for (const falsy of [false, true]) {
          const chatId = `${c.run}-${version}-${stream}-${falsy}`;
          const result = await c.complete(appId, {
            chatId,
            version,
            stream,
            extra: { variables: falsy ? { n: 0, flag: false, text: '' } : {} }
          });
          success(result);
          assert.equal(
            result.text,
            falsy
              ? '\na=A0|b=B0|stamp=S0|n=0|flag=false|text='
              : '\na=A0|b=B0|stamp=S0|n=9|flag=true|text=seed'
          );
          const stored = await c.persisted(appId, chatId);
          assert.equal(stored.chats.length, 1);
          assert.equal(stored.items.filter((item) => item.obj === 'AI').length, 1);
          assert.equal(stored.chats[0].variables.n, falsy ? 0 : 9);
          assert.equal(stored.chats[0].variables.flag, !falsy);
          assert.equal(stored.chats[0].variables.text, falsy ? '' : 'seed');
        }
    const emptyId = await c.create('empty-input', await c.load('empty-input'));
    const empty = await c.complete(emptyId, { chatId: c.run + '-empty', question: '' });
    success(empty);
    assert.equal(empty.text, '\nEMPTY-OK');
    return 'v1/v2 × stream false/true × 默认/假值共 8 变体及空文本入口均真实完成；已逐项核对持久化。';
  },
  async C2(context) {
    const c = await workflowScenario(context);
    for (const mode of ['caught', 'uncaught', 'success']) {
      const graph = await c.load('error-routing');
      const source = graph.nodes.find((node) => node.nodeId === 'Fail');
      source.catchError = mode !== 'uncaught';
      if (mode === 'success')
        source.inputs.find((input) => input.key === 'system_httpReqUrl').value =
          context.fixture.workflowRuntime.gateUrl + '/count';
      const appId = await c.create('error-' + mode, graph);
      const chatId = c.run + '-' + mode;
      const result = await c.complete(appId, { chatId, stream: true });
      const actual = result.events
        .filter((event) => event.event === 'flowNodeResponse')
        .map((event) => event.data.nodeId);
      c.record('错误路由实际节点集合', { mode, actual });
      assert.equal(actual.includes('Caught'), mode === 'caught');
      assert.equal(actual.includes('Normal'), mode === 'success');
      if (mode !== 'uncaught') success(result);
      const stored = await c.persisted(appId, chatId);
      assert.equal(stored.chats.length, 1);
      assert.equal(stored.chats[0].errorCount, mode === 'uncaught' ? 1 : 0);
      if (mode === 'uncaught')
        assert.ok(
          stored.rows.some((row) => row.data.nodeId === 'Fail' && row.data.errorText),
          '未捕获错误必须保留失败详情'
        );
      assert.ok(!JSON.stringify(result.events).includes('node:internal'), '内部堆栈不得泄漏');
    }
    return '正常、已捕获 503、未捕获 503 的后继集合与持久化失败信号已逐项对照。';
  },
  async C3(context) {
    const c = await workflowScenario(context);
    for (const name of ['loop-container', 'parallel-container'])
      for (const empty of [false, true]) {
        const graph = await c.load(name);
        const values = empty ? [] : [0, false, ''];
        const input = graph.nodes
          .find((node) => node.nodeId === 'Container')
          .inputs.find(
            (input) =>
              Array.isArray(input.value) && input.value.length === 3 && input.value[0] === 0
          );
        assert.ok(input, '模板需包含显式容器输入数组');
        input.value = values;
        const appId = await c.create(name + '-' + empty, graph);
        const chatId = c.run + '-' + name + '-' + empty;
        const result = await c.complete(appId, { chatId, stream: true });
        success(result);
        const responses = result.events
          .filter((event) => event.event === 'flowNodeResponse')
          .map((event) => event.data);
        const starts = responses.filter((response) => response.nodeId === 'BodyStart');
        const ends = responses.filter((response) => response.nodeId === 'BodyEnd');
        assert.equal(starts.length, values.length);
        assert.equal(ends.length, values.length);
        const ordered = (items) => [...items].sort((a, b) => a.parentId.localeCompare(b.parentId));
        assert.deepEqual(
          ordered(starts).map((item) => item.loopInputValue),
          values
        );
        assert.deepEqual(
          ordered(ends).map((item) => item.loopOutputValue),
          values
        );
        const container = responses.find((response) => response.nodeId === 'Container');
        if (name === 'parallel-container') {
          assert.deepEqual(container.parallelResult, values);
          assert.deepEqual(
            container.parallelRunDetail.map((item) => ({
              index: item.index,
              data: item.data,
              success: item.success
            })),
            values.map((data, index) => ({ index, data, success: true }))
          );
        } else assert.equal(container.loopRunIterations, values.length);
        assert.equal(
          (await c.persisted(appId, chatId)).chats[0].variables.a,
          empty ? 'A0' : 'body-complete'
        );
        c.record('容器参数与实际输入输出', { name, values, starts, ends, container });
      }
    const breakId = await c.create('loop-break', await c.load('loop-break'));
    const breaking = await c.complete(breakId, { chatId: c.run + '-break', stream: true });
    success(breaking);
    const breakResponses = breaking.events
      .filter((event) => event.event === 'flowNodeResponse')
      .map((event) => event.data);
    assert.equal(breakResponses.filter((response) => response.nodeId === 'BodyStart').length, 1);
    assert.equal(breakResponses.filter((response) => response.nodeId === 'Break').length, 1);
    assert.equal(
      breakResponses.find((response) => response.nodeId === 'Container').loopRunIterations,
      1
    );
    return '循环/并行空数组、假值数组及首次 break 共 5 个真实变体通过；已核对任务索引、body 次数、每项输入输出与父变量。';
  },
  async C4(context) {
    const c = await workflowScenario(context);
    const graph = await c.load('root-variables');
    const appId = await c.create('debug-stages', graph);
    const req = createRequire(
      fileURLToPath(new URL('../../../../../projects/app/package.json', import.meta.url))
    );
    const tsx = req('tsx/cjs/api');
    const runtime = tsx.require(
      fileURLToPath(
        new URL('../../../../../packages/global/core/workflow/runtime/utils.ts', import.meta.url)
      ),
      fileURLToPath(import.meta.url)
    );
    let nodes = runtime.storeNodes2RuntimeNodes(
      graph.nodes,
      runtime.getWorkflowEntryNodeIds(graph.nodes)
    );
    let edges = runtime.storeEdges2RuntimeEdges(graph.edges);
    let variables = {},
      usageId,
      skipNodeQueue;
    const stages = [];
    for (let index = 0; index < 6; index++) {
      const result = await c.request({
        route: '/api/core/workflow/debug',
        body: {
          appId,
          nodes,
          edges,
          variables,
          usageId,
          skipNodeQueue,
          chatConfig: graph.chatConfig,
          chatId: c.run + '-debug',
          query: [{ text: { content: c.run } }]
        }
      });
      const data = success(result);
      const ran = Object.values(data.nodeResponses)
        .filter((item) => item.type === 'run')
        .map((item) => item.nodeId);
      stages.push(ran);
      variables = data.newVariables;
      nodes = data.memoryNodes.map((node) => ({
        ...node,
        isEntry: data.entryNodeIds.includes(node.nodeId)
      }));
      edges = data.memoryEdges;
      usageId = data.usageId;
      skipNodeQueue = data.skipNodeQueue;
      if (data.entryNodeIds.length === 0) break;
    }
    c.record('Debug 实际阶段', { stages, variables });
    assert.deepEqual(stages, [['Start'], ['Update'], ['ReadVariables']]);
    assert.equal(variables.n, 0);
    assert.equal(variables.flag, false);
    assert.equal(variables.text, '');
    const stored = await c.persisted(appId, c.run + '-debug');
    assert.equal(stored.rows.length, 0);
    const containerGraph = await c.load('parallel-container');
    const containerId = await c.create('debug-child-stages', containerGraph);
    let state = {
      nodes: runtime.storeNodes2RuntimeNodes(
        containerGraph.nodes,
        runtime.getWorkflowEntryNodeIds(containerGraph.nodes)
      ),
      edges: runtime.storeEdges2RuntimeEdges(containerGraph.edges),
      variables: {}
    };
    const containerStages = [];
    for (let index = 0; index < 6; index++) {
      const data = success(
        await c.request({
          route: '/api/core/workflow/debug',
          body: {
            appId: containerId,
            ...state,
            chatConfig: containerGraph.chatConfig,
            chatId: c.run + '-debug-container',
            query: [{ text: { content: c.run } }]
          }
        })
      );
      const ran = Object.values(data.nodeResponses)
        .filter((item) => item.type === 'run')
        .map((item) => item.nodeId);
      containerStages.push({ ran, responses: data.nodeResponses });
      if (ran.includes('Container')) {
        assert.ok(!ran.includes('ReadVariables'), '父级后继不得在同一 Debug 阶段执行');
        assert.ok(
          data.nodeResponses.Container.response.childResponseCount > 0,
          '子图必须真实完成并产生详情'
        );
      }
      state = {
        nodes: data.memoryNodes.map((node) => ({
          ...node,
          isEntry: data.entryNodeIds.includes(node.nodeId)
        })),
        edges: data.memoryEdges,
        variables: data.newVariables,
        usageId: data.usageId,
        skipNodeQueue: data.skipNodeQueue
      };
      if (!data.entryNodeIds.length) break;
    }
    c.record('容器 Debug 阶段', containerStages);
    assert.deepEqual(
      containerStages.map((stage) =>
        stage.ran.filter((id) => ['Start', 'Container', 'ReadVariables'].includes(id))
      ),
      [['Start'], ['Container'], ['ReadVariables']]
    );
    assert.equal((await c.persisted(containerId, c.run + '-debug-container')).rows.length, 0);
    const published = await c.complete(appId, { chatId: c.run + '-after-debug', stream: true });
    success(published);
    assert.ok(
      (await c.persisted(appId, c.run + '-after-debug')).rows.length > 0,
      'Debug 不得关闭后续发布运行的 writer'
    );
    return '根图及子容器逐阶段 Debug、真实 memory 续跑、Debug 不落详情与后续发布运行正常落库均已核对。';
  },
  async C5(context) {
    const c = await workflowScenario(context);
    const graph = await c.load('stream-lifecycle');
    const appId = await c.create('concurrent-isolation', graph);
    const slow = c.run + '-slow',
      fast = c.run + '-fast';
    let slowResult;
    const pending = c
      .complete(appId, {
        chatId: slow,
        question: slow,
        stream: true,
        extra: { variables: { a: 'SLOW' } }
      })
      .then((value) => {
        slowResult = value;
        return value;
      });
    context.itemFinalizers.push(async () => {
      await c.release(slow);
      await pending.catch(() => undefined);
    });
    await c.poll(async () =>
      assert.ok(
        (await c.gateObservations()).some(
          (entry) => entry.path === '/wait' && entry.body.runId === slow
        )
      )
    );
    const fastPromise = c.complete(appId, {
      chatId: fast,
      question: fast,
      stream: true,
      extra: { variables: { a: 'FAST' } }
    });
    await c.poll(async () =>
      assert.ok(
        (await c.gateObservations()).some(
          (entry) => entry.path === '/wait' && entry.body.runId === fast
        )
      )
    );
    await c.release(fast);
    const doneFast = await fastPromise;
    success(doneFast);
    assert.equal(slowResult, undefined, '另一个会话必须仍在 gate');
    await c.release(slow);
    const doneSlow = await pending;
    success(doneSlow);
    assert.equal(doneFast.text, '\nPREFIX:' + fast + '\nTAIL:' + fast);
    assert.equal(doneSlow.text, '\nPREFIX:' + slow + '\nTAIL:' + slow);
    assert.equal((await c.persisted(appId, fast)).chats[0].variables.a, 'FAST');
    assert.equal((await c.persisted(appId, slow)).chats[0].variables.a, 'SLOW');
    const failing = await c.load('error-routing');
    failing.nodes.find((node) => node.nodeId === 'Fail').catchError = false;
    const recoveryId = await c.create('failure-recovery', failing);
    await c.complete(recoveryId, { chatId: c.run + '-failed', stream: true });
    assert.equal((await c.persisted(recoveryId, c.run + '-failed')).chats[0].errorCount, 1);
    const recoveryGraph = await c.load('input-precedence');
    success(
      await c.request({
        route: '/api/core/app/version/publish?appId=' + recoveryId,
        body: { ...recoveryGraph, isPublish: true, versionName: 'FG-TEST recovered' }
      })
    );
    const recovered = await c.complete(recoveryId, { chatId: c.run + '-recovered', stream: true });
    success(recovered);
    assert.equal(recovered.text, '\na=A0|b=B0|stamp=S0|n=9|flag=true|text=seed');
    assert.equal((await c.persisted(recoveryId, c.run + '-recovered')).chats[0].errorCount, 0);
    return '两个独立 chatId 交错完成且变量/输出不串用；同应用失败后新发布版本的新会话正常完成，无旧错误污染。';
  },
  async C6(context) {
    const c = await workflowScenario(context);
    const { workflowService } = await import('./workflow-service.mjs');
    const { fixtureNode, fixtureEdge } = await import('./workflow-fixtures.mjs');
    const s = await workflowService(context, c);
    const graph = await c.load('root-variables');
    const appId = await c.create('runtime-budget', graph);
    for (const [budget, depth, expected] of [
      [0, 0, []],
      [1, 0, ['Start']],
      [3, 19, ['Start', 'Update', 'ReadVariables']],
      [3, 20, []]
    ]) {
      const run = await s.run(appId, graph, c.run + '-control-' + budget + '-' + depth, {
        maxRunTimes: budget,
        workflowDispatchDeep: depth
      });
      assert.deepEqual(
        run.flat.map((row) => row.nodeId),
        expected
      );
      assert.equal(run.runtimeControl.workflowDispatchDeep, depth, '退出后恢复原深度');
      assert.equal(run.runtimeControl.maxRunTimes, budget - expected.length);
    }
    const child = {
      nodes: [
        fixtureNode({ kind: 'start', id: 'ChildStart' }),
        fixtureNode({ kind: 'answer', id: 'ChildAnswer', values: { text: 'SNAPSHOT-OK' } })
      ],
      edges: [fixtureEdge({ source: 'ChildStart', target: 'ChildAnswer' })],
      chatConfig: {}
    };
    const childId = await c.create('budget-child', child);
    const parent = await c.load('child-parent', { __CHILD_APP_ID__: childId });
    // 该场景需要观察子节点的真实事件；模板默认禁流仅适用于其他父子输出场景。
    parent.nodes
      .find((node) => node.nodeId === 'Child')
      .inputs.find((input) => input.key === 'system_forbid_stream').value = false;
    parent.nodes = parent.nodes.filter((node) => node.nodeId !== 'ParentReply');
    parent.nodes.push(fixtureNode({ kind: 'answer', id: 'FastSibling', values: { text: 'FAST' } }));
    parent.edges = [
      fixtureEdge({ source: 'Start', target: 'Child' }),
      fixtureEdge({ source: 'Start', target: 'FastSibling' })
    ];
    const parentId = await c.create('budget-snapshot', parent);
    const run = await s.run(parentId, parent, c.run + '-snapshot', { maxRunTimes: 3 });
    const events = run.events.filter((event) => event.event === 'flowNodeResponse');
    const fast = events.findIndex((event) => event.data.nodeId === 'FastSibling');
    const childStart = events.findIndex((event) => event.data.nodeId === 'ChildStart');
    assert.ok(fast >= 0 && childStart > fast, '必须实际观察兄弟扣预算后子流程才启动');
    assert.equal(events[childStart].parentBudget, 1);
    assert.ok(
      events.some((event) => event.data.nodeId === 'ChildAnswer'),
      '子层必须保留节点启动时 2 次预算而非后来父层的 1'
    );
    assert.equal(run.runtimeControl.workflowDispatchDeep, 0);
    return '零/一阶段预算及 20/21 层边界实际执行集合正确；真实兄弟先完成后子应用仍执行两阶段，使用节点启动快照且退出恢复父深度。';
  }
};

await runNodeCase('FG-APP-WORKFLOW-056', handlers);
