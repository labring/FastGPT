import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { runNodeCase } from '../../../support/runtime.mjs';
import { success } from '../../../support/scenario.mjs';
import { workflowScenario } from './workflow-api.mjs';
import { workflowModel } from './workflow-model.mjs';
import { fixtureEdge, fixtureNode } from './workflow-fixtures.mjs';

const require = createRequire(new URL('../../../../../projects/app/package.json', import.meta.url));
const load = (path) =>
  require('tsx/cjs/api').require(
    fileURLToPath(new URL('../../../../../' + path, import.meta.url)),
    fileURLToPath(import.meta.url)
  );
const runtime = load('packages/global/core/workflow/runtime/utils.ts');
const merge = load('packages/global/core/chat/utils/mergeNode.ts');
const flatten = (rows) => rows.flatMap((row) => [row, ...flatten(merge.getChildrenResponses(row))]);

/** 在真实日志详情中展开外层工具树，验证刷新读取后的可见性。 */
async function inspectResponseTree(context, { c, appId, expected, hidden = false }) {
  const { chromium } = require('@playwright/test');
  const browser = await chromium.launch({ headless: true });
  let page;
  try {
    const browserContext = await browser.newContext({
      baseURL: c.fixture.baseUrl,
      storageState: c.secret(c.fixture.actors.owner.stateEnv)
    });
    page = await browserContext.newPage();
    await page.goto(`/app/detail?appId=${appId}&currentTab=logs`, {
      waitUntil: 'domcontentloaded',
      timeout: 120000
    });
    await page.locator('tbody tr').first().click({ timeout: 60000 });
    await page
      .getByText(/^(运行详情|Run Details)$/)
      .last()
      .click({ timeout: 20000 });
    const expand = async (name) => {
      const label = page.getByText(name, { exact: true }).last();
      await label.waitFor({ state: 'visible', timeout: 20000 });
      // 折叠控件是 Flex 内的 SVG 而非 button，不能误点到外层弹窗的关闭按钮。
      const row = label.locator('xpath=../..');
      await row.locator(':scope > div').last().locator('svg').last().click({ timeout: 20000 });
    };
    await expand('Tools');
    for (const name of expected) {
      await page
        .getByText(name, { exact: true })
        .last()
        .waitFor({ state: 'visible', timeout: 20000 });
    }
    if (expected.includes('Loop')) {
      await expand('Loop');
      const task = page.getByText(/^(任务|Task) 1$/).last();
      await task.waitFor({ state: 'visible', timeout: 20000 });
      await page
        .getByText(/^(任务|Task) 2$/)
        .last()
        .waitFor({ state: 'visible', timeout: 20000 });
      await task
        .locator('xpath=../..')
        .locator(':scope > div')
        .last()
        .locator('svg')
        .last()
        .click();
      await page
        .getByText('BodyModel', { exact: true })
        .last()
        .waitFor({ state: 'visible', timeout: 20000 });
    }
    if (hidden) {
      await expand('VISIBLE-RUN');
      await page
        .getByText('VISIBLE-RUN-Input', { exact: true })
        .waitFor({ state: 'visible', timeout: 20000 });
      assert.equal(await page.getByText(/INTERNAL-RUN/).count(), 0);
    }
    const screenshot = `${context.itemId}-response-tree.png`;
    await page.screenshot({ path: `${context.directory}/${screenshot}` });
    context.attachments.push({ path: screenshot, label: '日志详情中的响应树' });
    c.record('真实日志响应树', { appId, expected, hidden });
    await browserContext.close();
  } catch (error) {
    if (page) {
      const screenshot = `${context.itemId}-response-tree-failure.png`;
      const saved = await page.screenshot({ path: `${context.directory}/${screenshot}` }).then(
        () => true,
        () => false
      );
      if (saved) context.attachments.push({ path: screenshot, label: '日志详情失败现场' });
      c.record('日志界面失败现场', {
        url: page.url(),
        text: (
          await page
            .locator('body')
            .innerText()
            .catch(() => '')
        ).slice(0, 5000)
      });
    }
    throw error;
  } finally {
    await browser.close();
  }
}

/** 通过真实节点调试抽屉触发 Debug，并校验调试会话不会写入聊天详情。 */
async function inspectDebugDrawer(context, { c, appId }) {
  const { chromium } = require('@playwright/test');
  const browser = await chromium.launch({ headless: true });
  let page;
  try {
    const browserContext = await browser.newContext({
      baseURL: c.fixture.baseUrl,
      storageState: c.secret(c.fixture.actors.owner.stateEnv)
    });
    page = await browserContext.newPage();
    await page.goto(`/app/detail?appId=${appId}&currentTab=appEdit`, {
      waitUntil: 'domcontentloaded',
      timeout: 120000
    });
    const node = page.locator('.react-flow__node[data-id="Tools"]');
    await node.waitFor({ state: 'visible', timeout: 60000 });
    for (const title of [/^(系统配置|System configuration)$/, /^(AI 辅助生成|Generate with AI)$/]) {
      const guide = page.getByText(title, { exact: true }).last();
      if (
        !(await guide.waitFor({ state: 'visible', timeout: 8000 }).then(
          () => true,
          () => false
        ))
      )
        continue;
      await page
        .getByRole('button', { name: /^(知道了|Got it)$/ })
        .last()
        .click();
      await guide.waitFor({ state: 'hidden', timeout: 10000 });
    }
    await node.hover({ timeout: 60000 });
    await node.getByRole('button', { name: /^(调试|Debug)$/ }).click({ timeout: 20000 });
    const drawer = page.getByRole('dialog');
    await drawer.waitFor({ state: 'visible', timeout: 20000 });
    await drawer.locator('[contenteditable="true"]:visible').first().fill(c.run);
    const debugResponse = page.waitForResponse(
      (response) => response.url().includes('/api/core/workflow/debug'),
      { timeout: 120000 }
    );
    await drawer.getByRole('button', { name: /^(运行|Run)$/ }).click();
    const response = await debugResponse;
    const request = response.request().postDataJSON();
    const body = await response.json();
    assert.equal(body.code, 200);
    assert.ok(body.data?.nodeResponses?.Tools?.response);
    assert.equal(
      flatten([body.data.nodeResponses.Tools.response]).filter((row) => row.nodeId === 'BodyModel')
        .length,
      2
    );
    assert.equal((await c.persisted(appId, request.chatId)).rows.length, 0);
    const screenshot = `${context.itemId}-debug-drawer.png`;
    await page.screenshot({ path: `${context.directory}/${screenshot}` });
    context.attachments.push({ path: screenshot, label: '真实节点调试结果' });
    c.record('节点调试抽屉', { chatId: request.chatId, response: body.data, persistedRows: 0 });
    await browserContext.close();
  } catch (error) {
    if (page) {
      const screenshot = `${context.itemId}-debug-drawer-failure.png`;
      const saved = await page.screenshot({ path: `${context.directory}/${screenshot}` }).then(
        () => true,
        () => false
      );
      if (saved) context.attachments.push({ path: screenshot, label: '节点调试界面失败现场' });
      c.record('节点调试界面失败现场', {
        url: page.url(),
        text: (
          await page
            .locator('body')
            .innerText()
            .catch(() => '')
        ).slice(0, 5000)
      });
    }
    throw error;
  } finally {
    await browser.close();
  }
}

/** 固定外壳和两次循环，只有交互开关不同；普通 AI 节点使用相同真实目录模型和 HTTP usage。 */
async function responseGraph(c, modelId, interactive) {
  const graph = await c.load('tool-concurrent', { __MODEL_ID__: modelId });
  for (const id of ['SlowGate', 'FastGate'])
    graph.nodes
      .find((node) => node.nodeId === id)
      .inputs.find((input) => input.key === 'system_httpReqUrl').value =
      c.fixture.workflowRuntime.gateUrl + '/count';
  const loop = await c.load(interactive ? 'loop-checkpoint' : 'loop-container');
  const children = loop.nodes.filter((node) => !['Start', 'ReadVariables'].includes(node.nodeId));
  for (const node of children) {
    if (node.nodeId === 'Container') {
      node.nodeId = 'Loop';
      node.name = 'Loop';
      node.inputs.find((input) => input.key === 'loopRunInputArray').value = ['one', 'two'];
      node.inputs.find((input) => input.key === 'childrenNodeIdList').value.push('BodyModel');
    }
    if (node.parentNodeId === 'Container') node.parentNodeId = 'Loop';
  }
  const model = (await c.load('model-resource', { __MODEL_ID__: modelId })).nodes.find(
    (node) => node.nodeId === 'Model'
  );
  model.nodeId = 'BodyModel';
  model.name = 'BodyModel';
  model.parentNodeId = 'Loop';
  model.inputs.find((input) => input.key === 'userChatInput').value = 'BODY-RUN';
  model.inputs.find((input) => input.key === 'isResponseAnswerText').value = false;
  graph.nodes.push(...children, model);
  graph.edges.push(fixtureEdge({ source: 'SlowUpdate', target: 'Loop' }));
  graph.edges.push(
    ...loop.edges.filter(
      (edge) =>
        !['Start', 'Container'].includes(edge.source) &&
        edge.target !== 'ReadVariables' &&
        edge.source !== 'BodyUpdate'
    )
  );
  graph.edges.push(
    fixtureEdge({ source: 'BodyUpdate', target: 'BodyModel' }),
    fixtureEdge({ source: 'BodyModel', target: interactive ? 'Form' : 'BodyEnd' })
  );
  return graph;
}

await runNodeCase('FG-APP-WORKFLOW-067', {
  async C1(context) {
    const c = await workflowScenario(context);
    const model = await workflowModel(context, c);
    const graph = await responseGraph(c, model.modelId, false);
    const appId = await c.create('nested-response-tree', graph);
    const chatId = `${c.run}-tree`;
    const response = await c.complete(appId, { chatId, question: chatId, stream: true });
    success(response);
    const stored = await c.persisted(appId, chatId);
    const trees = merge.mergeNodeResponseDataByIdAndParent(stored.rows.map((row) => row.data));
    const flat = flatten(trees);
    const tools = flat.find((row) => row.nodeId === 'Tools');
    assert.ok(tools, '必须有外层 ToolCall 详情');
    for (const nodeId of ['Slow', 'SlowGate', 'Fast', 'FastGate', 'Loop']) {
      const matches = flat.filter((row) => row.nodeId === nodeId);
      assert.equal(matches.length, 1, `${nodeId} 必须有独立且唯一的响应实例`);
      assert.equal(matches[0].parentId, tools.id);
    }
    const loop = flat.find((row) => row.nodeId === 'Loop');
    const iterations = flat.filter((row) => row.id?.startsWith(`${loop.id}:iter:`));
    assert.equal(iterations.length, 2);
    assert.ok(iterations.every((row) => row.parentId === loop.id));
    const models = flat.filter((row) => row.nodeId === 'BodyModel');
    assert.equal(models.length, 2);
    assert.ok(models.every((row) => iterations.some((iteration) => iteration.id === row.parentId)));
    assert.equal(model.calls.length, 4);
    assert.deepEqual(stored.chats[0].summary, { llmInputTokens: 28, llmOutputTokens: 12 });
    const calls = (await c.gateObservations()).filter(
      (entry) => entry.path === '/count' && entry.body.runId === chatId
    );
    assert.deepEqual(calls.map((entry) => entry.body.node).sort(), ['FastGate', 'SlowGate']);
    await inspectResponseTree(context, { c, appId, expected: ['Slow', 'Fast', 'Loop'] });
    c.record('工具与循环响应树及用量', {
      appId,
      chatId,
      response,
      trees,
      calls,
      modelCalls: model.calls,
      summary: stored.chats[0].summary
    });
    return '真实 ToolCall 按当前串行策略运行两个工具，循环各迭代响应身份正确，四次模型用量不随嵌套重复累计。';
  },
  async C2(context) {
    const c = await workflowScenario(context),
      model = await workflowModel(context, c);
    const graph = await responseGraph(c, model.modelId, true);
    const appId = await c.create('nested-response-checkpoint', graph),
      chatId = c.run + '-resume';
    const beforeCalls = model.calls.length,
      responses = [];
    let firstIdentity;
    for (const [index, question] of [
      c.run,
      JSON.stringify({ value: 'FIRST-RESUME' }),
      JSON.stringify({ value: 'SECOND-RESUME' })
    ].entries()) {
      const response = await c.complete(appId, { chatId, question, stream: true });
      assert.equal(response.http, 200);
      assert.equal(response.done, true);
      const stored = await c.persisted(appId, chatId);
      const iterations = stored.rows.filter((row) => row.data.id?.endsWith(':iter:1'));
      assert.ok(iterations.length);
      const ids = [...new Set(iterations.map((row) => row.data.id))];
      assert.equal(ids.length, 1, '第一迭代不得在恢复时换身份');
      firstIdentity ??= ids[0];
      assert.equal(ids[0], firstIdentity);
      responses.push({
        index,
        response,
        summary: stored.chats[0].summary,
        iterationRows: iterations.map((row) => row.data)
      });
    }
    const stored = await c.persisted(appId, chatId);
    const calls = model.calls.slice(beforeCalls);
    assert.equal(calls.length, 4, '外层选择/最终各一次、循环两个 AI 各一次，恢复不得重放');
    assert.equal(stored.rows.filter((row) => row.data.nodeId === 'SlowGate').length, 1);
    assert.equal(stored.rows.filter((row) => row.data.nodeId === 'BodyModel').length, 2);
    assert.deepEqual(stored.chats[0].summary, { llmInputTokens: 28, llmOutputTokens: 12 });
    const trees = merge.mergeNodeResponseDataByIdAndParent(stored.rows.map((row) => row.data));
    const wrappers = flatten(trees).filter((row) => /:iter:[12]$/.test(row.id ?? ''));
    assert.equal(wrappers.length, 2, '读取合并后只保留每迭代一层，不按物理增量行数断言重复');
    await inspectResponseTree(context, { c, appId, expected: ['Slow', 'Loop'] });
    c.record('真实嵌套暂停/恢复身份与统计', {
      responses,
      calls,
      firstIdentity,
      trees,
      finalSummary: stored.chats[0].summary
    });
    return '真实 ToolCall→循环两迭代表单共三轮请求：迭代身份稳定、完成 gate/AI 不重放，合并树每迭代一层，最终 tokens 精确为 28/12。';
  },
  async C3(context) {
    const c = await workflowScenario(context);
    const model = await workflowModel(context, c);
    const inner = await c.load('child-leaf');
    for (const node of inner.nodes) node.name = `INTERNAL-RUN-${node.nodeId}`;
    inner.nodes
      .find((node) => node.nodeId === 'ChildReply')
      .inputs.find((input) => input.key === 'text').value = 'SAFE-INNER-OUTPUT';
    const innerId = await c.create('hidden-inner-app', inner);
    const hiddenTool = await c.load('basic-tool-child');
    for (const node of hiddenTool.nodes) node.name = `INTERNAL-RUN-${node.nodeId}`;
    const internalCall = (await c.load('child-parent', { __CHILD_APP_ID__: innerId })).nodes.find(
      (node) => node.nodeId === 'Child'
    );
    internalCall.nodeId = 'InternalChild';
    internalCall.name = 'INTERNAL-RUN-Child';
    internalCall.inputs.find((input) => input.key === 'userChatInput').value = '{{$Input.label$}}';
    hiddenTool.nodes.push(internalCall);
    hiddenTool.nodes
      .find((node) => node.nodeId === 'Output')
      .inputs.push({
        key: 'result',
        label: 'result',
        value: ['InternalChild', 'answerText'],
        valueType: 'string',
        renderTypeList: ['reference', 'input'],
        selectedType: 'reference',
        canEdit: true
      });
    hiddenTool.edges = [
      fixtureEdge({ source: 'Input', target: 'InternalChild' }),
      fixtureEdge({ source: 'InternalChild', target: 'Output' })
    ];
    const hiddenToolId = await c.create('hidden-system-workflow', {
      ...hiddenTool,
      type: 'plugin'
    });
    const association = { 'customConfig.associatedPluginId': hiddenToolId };
    assert.equal(await c.db.collection('system_plugin_tools').countDocuments(association), 0);
    // 真实管理 API 注册到本轮独立系统目录；API 不返回 ID，因此按新建关联精确定位并回收。
    context.cleanups.push(async () => {
      const record = await c.db.collection('system_plugin_tools').findOne(association);
      if (!record) return;
      assert.match(record.pluginId, /^commercial-/);
      const deleted = await c.db.collection('system_plugin_tools').deleteOne({
        _id: record._id,
        pluginId: record.pluginId,
        ...association
      });
      assert.equal(deleted.deletedCount, 1);
      return { isolatedSystemTool: record.pluginId, deleted: true };
    });
    success(
      await c.request({
        route: '/api/core/plugin/admin/tool/app/create',
        body: {
          name: `FG-TEST-${c.run}-hidden`,
          avatar: '',
          intro: 'temporary isolated tool',
          associatedPluginId: hiddenToolId,
          currentCost: 1,
          hasTokenFee: false
        }
      })
    );
    const systemTool = await c.db.collection('system_plugin_tools').findOne(association);
    assert.ok(systemTool?.pluginId);
    const visibleGraph = await c.load('basic-tool-child');
    for (const node of visibleGraph.nodes) node.name = `VISIBLE-RUN-${node.nodeId}`;
    const visibleToolId = await c.create('visible-personal-workflow', {
      ...visibleGraph,
      type: 'plugin'
    });
    const graph = await c.load('tool-concurrent', { __MODEL_ID__: model.modelId });
    const toolTemplate = (
      await c.load('basic-tool-parent', { __CHILD_TOOL_ID__: visibleToolId })
    ).nodes.find((node) => node.nodeId === 'Tool');
    const hiddenCall = structuredClone(toolTemplate);
    hiddenCall.nodeId = 'RunHidden';
    hiddenCall.name = 'RunHidden';
    hiddenCall.pluginId = systemTool.pluginId;
    const visibleCall = structuredClone(toolTemplate);
    visibleCall.nodeId = 'RunVisible';
    visibleCall.name = 'VISIBLE-RUN';
    graph.nodes = graph.nodes.filter((node) => !['SlowGate', 'FastGate'].includes(node.nodeId));
    graph.nodes.push(hiddenCall, visibleCall);
    for (const edge of graph.edges) {
      if (edge.source === 'SlowGate') edge.source = 'RunHidden';
      if (edge.target === 'SlowGate') edge.target = 'RunHidden';
      if (edge.sourceHandle?.startsWith('SlowGate-'))
        edge.sourceHandle = edge.sourceHandle.replace('SlowGate-', 'RunHidden-');
      if (edge.targetHandle?.startsWith('SlowGate-'))
        edge.targetHandle = edge.targetHandle.replace('SlowGate-', 'RunHidden-');
      if (edge.source === 'FastGate') edge.source = 'RunVisible';
      if (edge.target === 'FastGate') edge.target = 'RunVisible';
      if (edge.sourceHandle?.startsWith('FastGate-'))
        edge.sourceHandle = edge.sourceHandle.replace('FastGate-', 'RunVisible-');
      if (edge.targetHandle?.startsWith('FastGate-'))
        edge.targetHandle = edge.targetHandle.replace('FastGate-', 'RunVisible-');
    }
    const appId = await c.create('system-tool-output-policy', graph);
    const chatId = `${c.run}-hidden`;
    const response = await c.complete(appId, { chatId, question: chatId, stream: true });
    success(response);
    const stored = await c.persisted(appId, chatId);
    const rows = stored.rows.map((row) => row.data);
    const hidden = rows.find((row) => row.nodeId === 'RunHidden');
    const visible = rows.find((row) => row.nodeId === 'RunVisible');
    const trees = merge.mergeNodeResponseDataByIdAndParent(rows);
    c.record('隐藏系统工具与可见兄弟', {
      systemToolId: systemTool.pluginId,
      hiddenToolId,
      innerId,
      visibleToolId,
      response,
      rows,
      summary: stored.chats[0].summary
    });
    assert.ok(hidden && visible);
    assert.equal(hidden.totalPoints, 1, '系统工具固定调用费用仍应归属外层节点');
    assert.equal(hidden.pluginOutput.result.trim(), 'SAFE-INNER-OUTPUT');
    assert.ok(rows.some((row) => row.moduleName === 'VISIBLE-RUN-Input'));
    assert.ok(!JSON.stringify(rows).includes('INTERNAL-RUN'));
    assert.ok(!JSON.stringify(trees).includes('INTERNAL-RUN'));
    assert.ok(!JSON.stringify(response.events).includes('INTERNAL-RUN'));
    assert.ok(JSON.stringify(response.events).includes('VISIBLE-RUN'));
    assert.equal(stored.chats[0].errorCount, 0);
    await inspectResponseTree(context, {
      c,
      appId,
      expected: ['RunHidden', 'VISIBLE-RUN'],
      hidden: true
    });
    return '真实注册的系统工作流工具隐藏内部及更深子应用详情；个人工具可见，业务输出和固定费用保留。';
  },
  async C4(context) {
    const c = await workflowScenario(context);
    const model = await workflowModel(context, c);
    for (const caught of [false, true]) {
      const graph = await responseGraph(c, model.modelId, false);
      const failing = fixtureNode({
        kind: 'http',
        id: 'Failure',
        extra: { catchError: caught },
        values: { system_httpReqUrl: `${c.fixture.workflowRuntime.gateUrl}/fail` }
      });
      graph.nodes.push(failing);
      graph.edges = graph.edges.filter(
        (edge) => !(edge.source === 'SlowUpdate' && edge.target === 'Loop')
      );
      graph.edges.push(
        fixtureEdge({ source: 'SlowUpdate', target: 'Failure' }),
        fixtureEdge({ source: 'Failure', target: 'Loop' }),
        {
          ...fixtureEdge({ source: 'Failure', target: 'Loop' }),
          sourceHandle: 'Failure-source_catch-right'
        }
      );
      const appId = await c.create(`tool-failure-${caught}`, graph);
      const chatId = `${c.run}-failure-${caught}`;
      const before = model.calls.length;
      const response = await c.complete(appId, { chatId, question: chatId, stream: true });
      success(response);
      const stored = await c.persisted(appId, chatId);
      const trees = merge.mergeNodeResponseDataByIdAndParent(stored.rows.map((row) => row.data));
      const flat = flatten(trees);
      const tools = flat.find((row) => row.nodeId === 'Tools');
      const failure = flat.find((row) => row.nodeId === 'Failure');
      const fast = flat.find((row) => row.nodeId === 'FastGate');
      const calls = model.calls.slice(before);
      c.record('工具失败与恢复的响应归属', {
        caught,
        response,
        trees,
        calls,
        chat: stored.chats[0]
      });
      assert.ok(failure?.errorText && tools && fast);
      assert.equal(failure.parentId, tools.id);
      assert.equal(fast.parentId, tools.id);
      assert.equal(failure.errorCaptured === true, caught);
      assert.equal(flat.filter((row) => row.nodeId === 'BodyModel').length, caught ? 2 : 0);
      assert.equal(stored.chats[0].variables.a, caught ? 'body-complete' : 'A0');
      assert.equal(stored.chats[0].variables.b, 'B1');
      assert.equal(stored.chats[0].errorCount, 0, '模型成功处理工具结果后不是根工作流未捕获错误');
      assert.deepEqual(stored.chats[0].summary, {
        llmInputTokens: calls.reduce((sum, call) => sum + call.usage.prompt_tokens, 0),
        llmOutputTokens: calls.reduce((sum, call) => sum + call.usage.completion_tokens, 0)
      });
      if (!caught)
        assert.ok(
          JSON.stringify(calls.at(-1).body.messages).includes('FG-TEST controlled failure')
        );
    }
    return '工具内失败及节点捕获两种模式均保留独立响应，兄弟工具成功；模型处理结果后的根摘要与实际 usage 一致。';
  },
  async C5(context) {
    const c = await workflowScenario(context),
      model = await workflowModel(context, c);
    const graph = await responseGraph(c, model.modelId, false);
    // 合成图的 Loop 原坐标与 Tools 重叠，真实画布上无法点击节点菜单。
    for (const node of graph.nodes) {
      if (node.nodeId === 'Loop' || node.parentNodeId === 'Loop') {
        node.position = { x: node.position.x + 2500, y: node.position.y + 1000 };
      } else if (!['Start', 'Tools'].includes(node.nodeId)) {
        node.position = { ...node.position, y: node.position.y + 1200 };
      }
    }
    // 调试抽屉先校验画布：数组引用和输入模式必须与编辑器可配置的格式一致。
    graph.chatConfig.variables.push({
      key: 'items',
      label: 'items',
      description: '',
      type: 'custom',
      valueType: 'arrayString',
      defaultValue: ['one', 'two'],
      required: false
    });
    const toolsInput = graph.nodes
      .find((node) => node.nodeId === 'Tools')
      .inputs.find((input) => input.key === 'userChatInput');
    toolsInput.selectedType = 'reference';
    toolsInput.value = ['Start', 'userChatInput'];
    const loopInput = graph.nodes
      .find((node) => node.nodeId === 'Loop')
      .inputs.find((input) => input.key === 'loopRunInputArray');
    loopInput.value = ['VARIABLE_NODE_ID', 'items'];
    const bodyInput = graph.nodes
      .find((node) => node.nodeId === 'BodyModel')
      .inputs.find((input) => input.key === 'userChatInput');
    bodyInput.selectedType = 'textarea';
    const appId = await c.create('debug-output-scope', graph),
      debugChatId = c.run + '-debug';
    let state = {
        nodes: runtime.storeNodes2RuntimeNodes(
          graph.nodes,
          runtime.getWorkflowEntryNodeIds(graph.nodes)
        ),
        edges: runtime.storeEdges2RuntimeEdges(graph.edges)
      },
      variables = {},
      sawTools = false;
    for (let step = 0; step < 6; step++) {
      const data = success(
        await c.request({
          route: '/api/core/workflow/debug',
          body: {
            appId,
            ...state,
            chatId: debugChatId,
            variables,
            chatConfig: graph.chatConfig,
            query: [{ type: 'text', text: { content: c.run } }]
          }
        })
      );
      variables = data.newVariables;
      if (data.nodeResponses.Tools?.response) {
        const nested = flatten([data.nodeResponses.Tools.response]);
        assert.equal(nested.filter((row) => row.nodeId === 'BodyModel').length, 2);
        sawTools = true;
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
    assert.ok(sawTools);
    assert.equal(variables.a, 'body-complete');
    assert.equal(variables.b, 'B1');
    assert.equal((await c.persisted(appId, debugChatId)).rows.length, 0);
    await inspectDebugDrawer(context, { c, appId });
    const beforeCalls = model.calls.length,
      chatId = c.run + '-published';
    success(await c.complete(appId, { chatId, stream: true }));
    const stored = await c.persisted(appId, chatId),
      calls = model.calls.slice(beforeCalls);
    assert.equal(calls.length, 4);
    assert.equal(stored.rows.filter((row) => row.data.nodeId === 'BodyModel').length, 2);
    assert.deepEqual(stored.chats[0].summary, { llmInputTokens: 28, llmOutputTokens: 12 });
    c.record('Debug 后发布的独立 sink/summary', {
      variables,
      debugPersistedRows: 0,
      publishedRows: stored.rows,
      calls,
      summary: stored.chats[0].summary
    });
    return '真实节点调试抽屉与 Debug API 返回 ToolCall 和循环详情且不落聊天详情；新发布会话正常保存，summary 与实际模型 usage 一致。';
  }
});
