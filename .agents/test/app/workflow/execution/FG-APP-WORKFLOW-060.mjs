import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { runNodeCase } from '../../../support/runtime.mjs';
import { success, poll } from '../../../support/scenario.mjs';
import { workflowModel } from './workflow-model.mjs';
import { workflowScenario } from './workflow-api.mjs';
import { fixtureNode, fixtureEdge } from './workflow-fixtures.mjs';
import { verifyParallelRetry } from './workflow-parallel-retry.mjs';

await runNodeCase('FG-APP-WORKFLOW-060', {
  async C1(context) {
    const c = await workflowScenario(context);
    context.secrets.add('FG-TEST-before');
    context.secrets.add('FG-TEST-after');
    const graph = await c.load('special-variables', {
      __PRIVATE_FILE_KEY__: 'pending-test-upload',
      __FILE_URL__: 'https://pending.invalid/file'
    });
    graph.chatConfig.variables.find((item) => item.key === 'files').defaultValue = [];
    const updates = graph.nodes
      .find((node) => node.nodeId === 'Update')
      .inputs.find((input) => input.key === 'updateList').value;
    Object.assign(
      updates.find((item) => item.variable[1] === 'files'),
      { renderType: 'reference', value: ['VARIABLE_NODE_ID', 'files'] }
    );
    const check = fixtureNode({
      kind: 'condition',
      id: 'Verify',
      values: {
        ifElseList: [
          {
            branchId: 'valid',
            condition: 'AND',
            list: [
              {
                variable: ['VARIABLE_NODE_ID', 'n'],
                condition: 'equalTo',
                value: '0',
                valueType: 'input'
              },
              {
                variable: ['VARIABLE_NODE_ID', 'flag'],
                condition: 'equalTo',
                value: 'false',
                valueType: 'input'
              },
              {
                variable: ['VARIABLE_NODE_ID', 'text'],
                condition: 'equalTo',
                value: '',
                valueType: 'input'
              },
              {
                variable: ['VARIABLE_NODE_ID', 'password'],
                condition: 'equalTo',
                value: 'FG-TEST-after',
                valueType: 'input'
              }
            ]
          }
        ]
      }
    });
    graph.nodes.push(
      check,
      fixtureNode({ kind: 'answer', id: 'Invalid', values: { text: 'SPECIAL-VALUES-INVALID' } })
    );
    graph.edges = graph.edges.filter((edge) => edge.source !== 'Update');
    graph.edges.push(
      fixtureEdge({ source: 'Update', target: 'Verify' }),
      fixtureEdge({ source: 'Verify', target: 'ReadVariables', handle: 'valid' }),
      fixtureEdge({ source: 'Verify', target: 'Invalid', handle: 'ELSE' })
    );
    const appId = await c.create('typed-variables', graph);
    const req = createRequire(new URL('../../../../../projects/app/package.json', import.meta.url));
    const runtime = req('tsx/cjs/api').require(
      fileURLToPath(
        new URL('../../../../../packages/global/core/workflow/runtime/utils.ts', import.meta.url)
      ),
      fileURLToPath(import.meta.url)
    );
    for (const mode of ['debug', 'published']) {
      const chatId = c.run + '-' + mode;
      const file = await c.upload({ appId, chatId });
      let variables = { files: [{ key: file.key, name: file.name, type: file.type }] };
      const assertValues = (values) => {
        assert.equal(values.n, 0);
        assert.equal(values.flag, false);
        assert.equal(values.text, '');
        assert.deepEqual(values.obj, { items: [1, 2] });
        assert.deepEqual(values.files, [{ key: file.key, name: file.name, type: file.type }]);
        assert.equal(typeof values.password.secret, 'string');
        assert.notEqual(values.password.secret, 'FG-TEST-after');
      };
      if (mode === 'debug') {
        let state = {
          nodes: runtime.storeNodes2RuntimeNodes(
            graph.nodes,
            runtime.getWorkflowEntryNodeIds(graph.nodes)
          ),
          edges: runtime.storeEdges2RuntimeEdges(graph.edges)
        };
        let verified = false;
        for (let step = 0; step < 8; step++) {
          const data = success(
            await c.request({
              route: '/api/core/workflow/debug',
              body: {
                appId,
                ...state,
                variables,
                chatId,
                chatConfig: graph.chatConfig,
                query: [{ text: { content: c.run } }]
              }
            })
          );
          variables = data.newVariables;
          if (data.nodeResponses.Verify?.type === 'run') {
            assert.equal(data.nodeResponses.Verify.response.ifElseResult, 'IF');
            verified = true;
          }
          if (!data.entryNodeIds.length) break;
          state = {
            nodes: data.memoryNodes.map((node) => ({
              ...node,
              isEntry: data.entryNodeIds.includes(node.nodeId)
            })),
            edges: data.memoryEdges,
            usageId: data.usageId,
            skipNodeQueue: data.skipNodeQueue
          };
        }
        assert.ok(verified, '真实条件节点必须消费更新后的普通值和密码明文');
        assertValues(variables);
        assert.equal((await c.persisted(appId, chatId)).rows.length, 0);
      } else {
        const result = await c.complete(appId, { chatId, stream: true, extra: { variables } });
        success(result);
        assert.equal(result.text, '\na=A0|b=B0|stamp=S0|n=0|flag=false|text=');
        const stored = await c.persisted(appId, chatId);
        assertValues(stored.chats[0].variables);
        assert.equal(stored.chats[0].errorCount, 0);
        assert.ok(
          stored.rows.some((row) => row.data.nodeId === 'Verify' && row.data.ifElseResult === 'IF')
        );
      }
      c.record('类型变量验收', {
        mode,
        fileKey: file.key,
        runtimePasswordComparedByCondition: true,
        storePasswordEncrypted: true,
        runtimeValues: { n: 0, flag: false, text: '', obj: { items: [1, 2] } }
      });
    }
    return '真实 Debug 与独立发布会话均读取更新后的假值/对象；真实私有文件保留 key/name/type，条件节点验证密码运行明文而存储为加密结构。';
  },
  async C2(context) {
    const c = await workflowScenario(context);
    const { workflowService } = await import('./workflow-service.mjs');
    const s = await workflowService(context, c);
    // 本场景直接调用真实 provider，不需要创建或调用模拟模型。
    const model = await c.activeModel('deepseek-v4.1-flash');
    for (const order of ['SLOW-FIRST', 'FAST-FIRST']) {
      const graph = await c.load('tool-concurrent', { __MODEL_ID__: model.modelId });
      const run = c.run + '-' + order;
      for (const role of ['Slow', 'Fast'])
        graph.nodes
          .find((node) => node.nodeId === role + 'Gate')
          .inputs.find((input) => input.key === 'system_httpJsonBody').value = JSON.stringify({
          runId: run + '-' + role.toLowerCase()
        });
      const appId = await c.create('tool-completion-' + order, graph);
      const result = await s.run(
        appId,
        graph,
        run,
        { workflowDispatchDeep: 1 },
        undefined,
        async ({ data, context: ctx }) => {
          // 等效于父 Queue 已完成 Start 并进入 ToolCall callback 的真实初态，不能重启根入口。
          data.runtimeNodes.forEach((node) => {
            node.isEntry = false;
          });
          const { createToolCallToolProvider } = s.load(
            'packages/service/core/workflow/dispatch/ai/toolcall/toolProvider/createToolCallToolProvider.ts'
          );
          const { createNodeSummary } = s.load(
            'packages/service/core/workflow/dispatch/utils/summary.ts'
          );
          const provider = await createToolCallToolProvider({
            messages: [],
            toolNodes: data.runtimeNodes.filter((node) => ['Slow', 'Fast'].includes(node.nodeId)),
            runtimeNodes: data.runtimeNodes,
            runtimeEdges: data.runtimeEdges,
            workflowProps: {
              ...data,
              node: data.runtimeNodes.find((node) => node.nodeId === 'Tools'),
              params: {},
              usagePush() {},
              nodeSummary: createNodeSummary(),
              nodeResponseParentId: 'ROOT-TOOLS'
            },
            cacheToolFlowResponse() {}
          });
          const running = {},
            completions = [];
          for (const name of order === 'FAST-FIRST' ? ['Fast', 'Slow'] : ['Slow', 'Fast']) {
            running[name] = provider
              .executeTool({
                messages: [],
                call: {
                  id: run + '-' + name,
                  type: 'function',
                  function: { name, arguments: '{}' }
                }
              })
              .then((value) => {
                completions.push(name);
                return value;
              });
          }
          try {
            await poll(async () => {
              const observations = await c.gateObservations();
              for (const role of ['slow', 'fast'])
                assert.ok(
                  observations.some(
                    (entry) => entry.body.runId === run + '-' + role && entry.path === '/' + role
                  )
                );
            });
            await c.release(run + '-fast');
            const fast = await running.Fast;
            c.record('快工具实际返回', { fast, values: ctx.variableContext.toStoreRecord() });
            assert.deepEqual(completions, ['Fast']);
            assert.equal(ctx.variableContext.get('b'), 'B1');
            await c.release(run + '-slow');
            const slow = await running.Slow;
            const variables = ctx.variableContext.toStoreRecord();
            assert.deepEqual(
              Object.fromEntries(['a', 'b', 'stamp'].map((key) => [key, variables[key]])),
              { a: 'A1', b: 'B1', stamp: 'slow' }
            );
            return {
              variables,
              completions,
              fast,
              slow,
              entry: '真实 ToolCall provider 服务集成；聊天外壳 batchToolSize=1 未改变'
            };
          } finally {
            await c.release(run + '-fast');
            await c.release(run + '-slow');
            await Promise.all(Object.values(running));
          }
        }
      );
      const persisted = await c.persisted(appId, run);
      for (const id of ['SlowUpdate', 'FastUpdate']) {
        assert.equal(result.flat.filter((row) => row.nodeId === id).length, 1);
        const written = persisted.rows.filter((row) => row.data.nodeId === id);
        assert.ok(written.length, `${id} 必须通过真实 writer 持久化`);
        assert.equal(new Set(written.map((row) => row.data.id)).size, 1);
        assert.ok(written.every((row) => row.chatItemDataId === `${c.run}-response`));
      }
      c.record('工具调用/完成顺序与父差量', { order, ...result });
    }
    return '真实 provider + Queue + DB writer 服务集成，两种发起次序均真实并发到达 gate；Fast 先提交 B1，最终 A1/B1/slow。未宣称串行聊天外壳支持并发。';
  },
  async C3(context) {
    const c = await workflowScenario(context),
      model = await workflowModel(context, c);
    for (const mode of ['error', 'interactive']) {
      const graph = await c.load('tool-concurrent', { __MODEL_ID__: model.modelId });
      const removed = new Set(['Fast', 'FastGate', 'FastUpdate']);
      graph.nodes = graph.nodes.filter((node) => !removed.has(node.nodeId));
      graph.edges = graph.edges.filter(
        (edge) => !removed.has(edge.source) && !removed.has(edge.target)
      );
      graph.nodes
        .find((node) => node.nodeId === 'SlowGate')
        .inputs.find((input) => input.key === 'system_httpReqUrl').value =
        c.fixture.workflowRuntime.gateUrl + '/count';
      graph.nodes.push(
        fixtureNode({
          kind: 'text',
          id: 'CompletedOutput',
          values: { system_textareaInput: 'NODE-OUTPUT-KEPT' }
        })
      );
      graph.nodes.push(
        mode === 'error'
          ? fixtureNode({
              kind: 'http',
              id: 'StopPoint',
              values: {
                system_httpReqUrl: c.fixture.workflowRuntime.gateUrl + '/fail'
              }
            })
          : fixtureNode({
              kind: 'form',
              id: 'StopPoint',
              values: {
                userInputForms: [
                  {
                    key: 'value',
                    label: 'value',
                    type: 'input',
                    valueType: 'string',
                    required: true
                  }
                ]
              }
            })
      );
      graph.edges.push(
        fixtureEdge({ source: 'SlowUpdate', target: 'CompletedOutput' }),
        fixtureEdge({ source: 'CompletedOutput', target: 'StopPoint' })
      );
      graph.nodes
        .find((node) => node.nodeId === 'ReadVariables')
        .inputs.find((input) => input.key === 'text').value +=
        '|completed={{$CompletedOutput.system_text$}}';
      const appId = await c.create('tool-settlement-' + mode, graph),
        chatId = c.run + '-' + mode;
      const result = await c.complete(appId, { chatId, stream: true });
      assert.equal(result.http, 200);
      assert.equal(result.done, true);
      const stored = await c.persisted(appId, chatId);
      assert.equal(stored.chats[0].variables.a, mode === 'error' ? 'A0' : 'A1');
      assert.equal(stored.chats[0].variables.stamp, mode === 'error' ? 'S0' : 'slow');
      assert.ok(
        stored.rows.some(
          (row) =>
            row.data.nodeId === 'CompletedOutput' && row.data.textOutput === 'NODE-OUTPUT-KEPT'
        )
      );
      if (mode === 'error') {
        assert.ok(
          result.text.includes('completed=NODE-OUTPUT-KEPT'),
          '已完成节点输出按 runner finally 提交，与全局变量事务不同'
        );
        assert.ok(result.text.includes('a=A0'));
        assert.ok(stored.rows.some((row) => row.data.nodeId === 'StopPoint' && row.data.errorText));
      } else {
        assert.ok(
          stored.items.some(
            (item) => item.obj === 'AI' && item.value.some((value) => value.interactive)
          ),
          '必须真实暂停而非模拟失败'
        );
        const countBefore = (await c.gateObservations()).filter(
          (entry) => entry.path === '/count'
        ).length;
        const resumed = await c.complete(appId, {
          chatId,
          question: '{"value":"RESUME-RUN"}',
          stream: true
        });
        success(resumed);
        assert.equal(resumed.done, true);
        assert.ok(resumed.text.includes('a=A1'));
        const final = await c.persisted(appId, chatId);
        assert.equal(final.chats[0].variables.a, 'A1');
        assert.equal(final.chats[0].variables.stamp, 'slow');
        assert.equal(
          (await c.gateObservations()).filter((entry) => entry.path === '/count').length,
          countBefore,
          '恢复不能重放暂停前 gate'
        );
        c.record('ToolCall 暂停检查点恢复', {
          resumed,
          variables: final.chats[0].variables,
          countBefore
        });
      }
      c.record('失败/交互工具回写对照', {
        mode,
        response: result,
        variables: stored.chats[0].variables,
        modelCalls: model.calls
      });
    }
    return '真实 ToolCall 错误分支保留父变量基线；正常表单暂停提交 A1/slow，同会话恢复后仍可读取且前序 gate 未重跑；已完成节点输出按 finally 保留。';
  },
  async C4(context) {
    const c = await workflowScenario(context);
    const graph = await c.load('loop-checkpoint');
    const update = graph.nodes.find((node) => node.nodeId === 'BodyUpdate');
    update.inputs.find((input) => input.key === 'updateList').value[0].value = ['', 'checkpoint'];
    const once = fixtureNode({
      kind: 'http',
      id: 'Once',
      values: {
        system_httpReqUrl: context.fixture.workflowRuntime.gateUrl + '/count',
        system_httpJsonBody: JSON.stringify({ runId: c.run, node: 'Once' })
      },
      extra: { parentNodeId: 'Container' }
    });
    graph.nodes.push(once);
    graph.nodes
      .find((node) => node.nodeId === 'Container')
      .inputs.find((input) => input.key === 'childrenNodeIdList')
      .value.push('Once');
    graph.edges = graph.edges.filter(
      (edge) => !(edge.source === 'BodyStart' && edge.target === 'BodyUpdate')
    );
    graph.edges.push(
      fixtureEdge({ source: 'BodyStart', target: 'Once' }),
      fixtureEdge({ source: 'Once', target: 'BodyUpdate' })
    );
    const appId = await c.create('loop-checkpoint', graph);
    const chatId = c.run + '-checkpoint';
    const paused = await c.complete(appId, { chatId, stream: true });
    success(paused);
    const pauseState = await c.persisted(appId, chatId);
    assert.equal(pauseState.chats[0].variables.a, 'checkpoint');
    assert.ok(
      pauseState.items.some(
        (item) => item.obj === 'AI' && item.value.some((value) => value.interactive)
      ),
      '必须真实停在交互节点'
    );
    const before = (await c.gateObservations()).filter(
      (entry) => entry.path === '/count' && entry.body.runId === c.run
    );
    assert.equal(before.length, 1);
    const resumed = await c.complete(appId, {
      chatId,
      question: JSON.stringify({ value: 'RESUME-RUN' }),
      stream: true
    });
    success(resumed);
    const final = await c.persisted(appId, chatId);
    assert.equal(final.chats[0].variables.a, 'checkpoint');
    assert.equal(
      (await c.gateObservations()).filter(
        (entry) => entry.path === '/count' && entry.body.runId === c.run
      ).length,
      1,
      '恢复不得重放已完成 gate'
    );
    assert.ok(resumed.text.includes('a=checkpoint'));
    assert.ok(
      !resumed.events.some(
        (event) =>
          event.event === 'flowNodeResponse' && ['Once', 'BodyUpdate'].includes(event.data.nodeId)
      ),
      '恢复不能重复执行 checkpoint 前节点'
    );
    c.record('暂停/恢复对照', {
      chatId,
      gateBefore: before.length,
      finalGateCount: 1,
      parentA: final.chats[0].variables.a
    });
    return '真实循环暂停前变量已持久化，原 chatId 表单恢复后仍为 checkpoint；gate 与更新节点均未重放。';
  },
  async C5(context) {
    return verifyParallelRetry(await workflowScenario(context));
  },
  async C6(context) {
    const c = await workflowScenario(context);
    const childId = await c.create('child-variable-leaf', await c.load('child-leaf'));
    const parentId = await c.create(
      'child-variable-parent',
      await c.load('child-parent', { __CHILD_APP_ID__: childId })
    );
    const chatId = c.run + '-child';
    const result = await c.complete(parentId, { chatId, stream: true });
    success(result);
    assert.equal(result.text, '\nPARENT:A0|\nCHILD:child-output');
    const stored = await c.persisted(parentId, chatId);
    // 模板显式禁止子流程 SSE，子节点执行详情仍应通过共享 writer 落库。
    const childInput = stored.rows.find((row) => row.data.nodeId === 'ChildInput')?.data;
    assert.ok(childInput, '必须实际执行已发布子应用，不接受固定模拟返回值');
    assert.equal(childInput.textOutput, 'child-input');
    assert.equal(stored.chats.length, 1);
    assert.equal(stored.chats[0].variables.a, 'A0');
    const flat = stored.rows.map((row) => row.data);
    assert.ok(flat.some((response) => response.nodeId === 'ChildInput'));
    c.record('父子变量隔离对照', {
      parentAppId: parentId,
      childAppId: childId,
      input: childInput.textOutput,
      childResult: 'child-output',
      parentA: stored.chats[0].variables.a
    });
    return '真实发布子应用消费 child-input、独立写 child-output；父变量 A0 未被覆盖，子输入与父会话持久化均已核对。';
  }
});
