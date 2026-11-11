import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { runNodeCase } from '../../../support/runtime.mjs';
import { success } from '../../../support/scenario.mjs';
import { workflowScenario } from './workflow-api.mjs';
import { workflowService } from './workflow-service.mjs';
import { workflowModel } from './workflow-model.mjs';
import { createTestPdf } from './workflow-pdf.mjs';

await runNodeCase('FG-APP-WORKFLOW-054', {
  async C1(context) {
    const c = await workflowScenario(context);
    const s = await workflowService(context, c);
    const model = await workflowModel(context, c);
    const childGraph = await c.load('model-resource', { __MODEL_ID__: model.modelId });
    childGraph.chatConfig.variables.push({
      key: 'files',
      label: 'files',
      description: '',
      type: 'file',
      maxFiles: 2,
      required: false,
      defaultValue: []
    });
    const modelNode = childGraph.nodes.find((node) => node.nodeId === 'Model');
    modelNode.inputs.find((input) => input.key === 'fileUrlList').value = [
      'VARIABLE_NODE_ID',
      'files'
    ];
    modelNode.inputs.find((input) => input.key === 'history').value = 6;
    const childId = await c.create('file-child', childGraph);
    const root = await c.load('child-parent', { __CHILD_APP_ID__: childId });
    root.chatConfig.fileSelectConfig = { canSelectFile: true, maxFiles: 10 };
    const appId = await c.create('file-parent', root);
    const chatId = `${c.run}-derived`;
    const aText = `FGTEST-A-${c.run}`;
    const bText = `FGTEST-B-${c.run}`;
    const aPdf = createTestPdf(aText);
    const a = await c.upload({ appId, chatId, filename: 'a.pdf', content: aPdf });
    const b = await c.upload({ appId, chatId, filename: 'b.pdf', content: createTestPdf(bText) });
    const aValue = { key: a.key, name: a.name, type: a.type };
    const bValue = { key: b.key, name: b.name, type: b.type };
    const query = [
      { type: 'text', text: { content: 'FG-TEST query' } },
      { type: 'file', file: aValue },
      { type: 'file', file: aValue }
    ];
    const histories = [
      {
        obj: 'Human',
        value: [
          { type: 'text', text: { content: 'FG-TEST history' } },
          { type: 'file', file: aValue },
          { type: 'file', file: bValue }
        ]
      }
    ];
    const prepared = await s.prepareWorkflowFileContext({
      query,
      histories,
      scope: { sourceType: 'app', sourceId: appId, uid: c.fixture.actors.owner.tmbId, chatId },
      maxFileAmount: 2,
      maxBytesPerFile: 1024 * 1024
    });
    const before = structuredClone({ query: prepared.query, histories: prepared.histories });
    const external = `${c.fixture.workflowRuntime.gateUrl}/file.txt`;
    const { prepareDerivedWorkflowFileContext } = s.load(
      'packages/service/core/workflow/dispatch/context/file.ts'
    );
    const derived = await prepareDerivedWorkflowFileContext({
      parent: prepared.fileContext,
      query: prepared.query,
      histories: prepared.histories,
      files: [external]
    });
    const privateRef = derived.fileContext.resolveInputFile(aValue);
    assert.equal(privateRef?.type, 'document');
    assert.deepEqual(privateRef?.source, { type: 'chatObject', objectKey: a.key });
    assert.equal(derived.fileContext.resolveInputFile(bValue), undefined);
    assert.ok(derived.fileContext.resolve(external));
    assert.ok(!JSON.stringify(derived.histories).includes(b.key));
    assert.equal(derived.filterFiles([privateRef.modelUrl, external]).length, 2);
    const read = await derived.fileContext.readBuffer({ url: privateRef.modelUrl });
    assert.equal(
      createHash('sha256').update(read).digest('hex'),
      createHash('sha256').update(aPdf).digest('hex')
    );
    assert.deepEqual({ query: prepared.query, histories: prepared.histories }, before);

    // 用真实子应用节点再次走相同边界：当前 query 传 A，文件变量传 U1，历史中还有 B。
    const rootChild = root.nodes.find((node) => node.nodeId === 'Child');
    rootChild.inputs.push(
      {
        key: 'history',
        label: 'history',
        value: 6,
        valueType: 'number',
        renderTypeList: ['input']
      },
      {
        key: 'fileUrlList',
        label: 'fileUrlList',
        value: [privateRef.modelUrl],
        valueType: 'arrayString',
        renderTypeList: ['input']
      },
      {
        key: 'files',
        label: 'files',
        value: [external],
        valueType: 'arrayString',
        renderTypeList: ['input']
      }
    );
    success(
      await c.request({
        route: `/api/core/app/version/publish?appId=${appId}`,
        body: { ...root, isPublish: true, versionName: 'FG-TEST derived files' }
      })
    );
    const result = await s.run(
      appId,
      root,
      chatId,
      {},
      undefined,
      async ({ data, context: parent }) =>
        s.runWithContext(parent.getChildContext({ fileContext: prepared.fileContext }), () =>
          s.runWorkflow({
            ...data,
            query: prepared.query,
            histories: prepared.histories,
            maxFileAmount: 2
          })
        )
    );
    assert.equal(model.calls.length, 1, '子应用必须实际调用模型');
    const modelMessages = JSON.stringify(model.calls[0].body.messages);
    assert.ok(modelMessages.includes(aText), '模型必须读到 A 的真实 PDF 解析正文');
    assert.ok(modelMessages.includes('FG-TEST-CONTENT'), '模型必须读到当前文件变量 U1');
    assert.ok(!modelMessages.includes(bText), '超额历史 B 不得进入实际模型请求');
    assert.ok(result.flat.some((row) => row.nodeId === 'Child'));
    assert.deepEqual({ query: prepared.query, histories: prepared.histories }, before);
    c.record('父子文件选择与模型输入', {
      appId,
      childId,
      aKey: a.key,
      bKey: b.key,
      derived,
      modelCall: model.calls[0],
      rows: result.flat
    });
    return '真实 PDF A 去重并继承私有身份，U1 随文件变量进入子应用，历史 B 被排除；实际模型读取到 A/U1 且父消息不变。';
  },
  async C2(context) {
    const c = await workflowScenario(context),
      s = await workflowService(context, c);
    const graph = await c.load('root-variables');
    graph.chatConfig.fileSelectConfig = { canSelectFile: true, maxFiles: 10 };
    const appId = await c.create('file-auth', graph);
    const anotherId = await c.create('file-other', graph);
    const chatId = c.run + '-auth';
    const aContent = createTestPdf('FG-TEST private content');
    const a = await c.upload({ appId, chatId, filename: 'allowed.pdf', content: aContent });
    const x = await c.upload({
      appId: anotherId,
      chatId,
      filename: 'other-app.pdf',
      content: createTestPdf('other app')
    });
    const y = await c.upload({
      appId,
      chatId: chatId + '-other',
      filename: 'other-chat.pdf',
      content: createTestPdf('other chat')
    });
    // 仅在本轮隔离应用上准备另一成员的读取 ACL；上传与后续拒绝仍走真实鉴权。
    await c.db.collection('resource_permissions').insertOne({
      teamId: new c.ObjectId(c.fixture.teamId),
      resourceId: new c.ObjectId(appId),
      resourceType: 'app',
      tmbId: new c.ObjectId(c.fixture.actors.A.tmbId),
      permission: 4
    });
    const otherUser = await c.upload({
      role: 'A',
      appId,
      chatId,
      filename: 'other-user.pdf',
      content: createTestPdf('other user')
    });
    const scope = { sourceType: 'app', sourceId: appId, uid: c.fixture.actors.owner.tmbId, chatId };
    const base = {
      query: [{ type: 'file', file: { type: a.type, name: a.name, key: a.key } }],
      histories: [],
      scope,
      maxFileAmount: 10,
      maxBytesPerFile: 1024
    };
    const prepared = await s.prepareWorkflowFileContext(base);
    const allowed = prepared.fileContext.resolveInputFile(a).modelUrl;
    const child = await prepared.fileContext.derive([allowed]);
    for (const value of [x, y, otherUser, { ...x, url: allowed }]) {
      await assert.rejects(
        () => child.register({ file: value, source: 'variable' }),
        /does not belong/
      );
      assert.equal(child.resolveInputFile(value), undefined);
      c.record('子文件登记拒绝', {
        key: value.key,
        conflictingAllowedUrl: Boolean(value.url),
        rejected: true
      });
    }
    for (const [kind, wrongScope] of [
      ['sourceId', { ...scope, sourceId: anotherId }],
      ['uid', { ...scope, uid: c.fixture.actors.A.tmbId }],
      ['chatId', { ...scope, chatId: chatId + '-other' }]
    ]) {
      await assert.rejects(
        () => s.prepareWorkflowFileContext({ ...base, scope: wrongScope }),
        /does not belong/
      );
      c.record('根文件归属拒绝', { kind, wrongScope, rejected: true });
    }
    assert.deepEqual(await child.readBuffer({ url: allowed }), aContent);
    return '真实对象上传后，子登记拒绝跨应用/跨会话私有 key 与 key/url 冲突；根 sourceId、uid、chatId 错配均拒绝，合法 A 仍可读取。';
  },
  async C3(context) {
    const c = await workflowScenario(context),
      s = await workflowService(context, c);
    const graph = await c.load('file-form');
    graph.chatConfig.fileSelectConfig = { canSelectFile: true, maxFiles: 10 };
    const appId = await c.create('derived-form-quota', graph),
      chatId = c.run + '-quota';
    const uploaded = [];
    for (const filename of ['a.txt', 'first.txt', 'second.txt', 'third.txt'])
      uploaded.push(await c.upload({ appId, chatId, filename }));
    const [a, first, second, third] = uploaded;
    const prepared = await s.prepareWorkflowFileContext({
      query: [{ type: 'file', file: { key: a.key, name: a.name, type: a.type } }],
      histories: [],
      scope: { sourceType: 'app', sourceId: appId, uid: c.fixture.actors.owner.tmbId, chatId },
      maxFileAmount: 2,
      maxBytesPerFile: 1024
    });
    const child = await prepared.fileContext.derive([
      prepared.fileContext.resolveInputFile(a).modelUrl
    ]);
    await s.run(appId, graph, chatId, {}, undefined, async ({ data, context: parent }) =>
      s.runWithContext(parent.getChildContext({ fileContext: child }), async () => {
        const paused = await s.runWorkflow(data);
        assert.equal(paused.workflowInteractiveResponse.type, 'userInput');
        const interactive = paused.workflowInteractiveResponse;
        const resumed = await s.runWorkflow({
          ...data,
          runtimeNodes: paused.debugResponse.memoryNodes.map((node) => ({
            ...node,
            isEntry: interactive.entryNodeIds.includes(node.nodeId)
          })),
          runtimeEdges: s
            .load('packages/global/core/workflow/runtime/utils.ts')
            .storeEdges2RuntimeEdges(graph.edges, interactive),
          lastInteractive: interactive,
          query: [
            {
              type: 'text',
              text: {
                content: JSON.stringify({
                  first: [{ key: first.key, name: first.name, type: first.type }],
                  second: [{ key: second.key, name: second.name, type: second.type }]
                })
              }
            }
          ]
        });
        const form = resumed.debugResponse.memoryNodes.find((node) => node.nodeId === 'FileForm');
        const values = form.outputs.find((output) => output.key === 'formInputResult').value;
        assert.equal(
          values.first.length + values.second.length,
          1,
          '两个字段必须共用子作用域额度，不能各自接受一个'
        );
        const selected = [first, second].filter((file) => child.resolveInputFile(file));
        assert.equal(selected.length, 1);
        assert.ok(child.resolveInputFile(a), '原始 A 复用且保留');
        const rejected = await child.register({
          file: { key: third.key, name: third.name, type: third.type },
          source: 'interactive'
        });
        assert.equal(rejected, undefined);
        assert.equal(child.resolveInputFile(third), undefined);
        assert.equal(
          (
            await child.readBuffer({ url: child.resolveInputFile(selected[0]).modelUrl })
          ).toString(),
          'FG-TEST private content'
        );
        c.record('真实表单暂停恢复/子作用域额度', {
          limit: 2,
          initialKey: a.key,
          acceptedKeys: selected.map((file) => file.key),
          fieldLengths: [values.first.length, values.second.length],
          thirdRegistered: Boolean(rejected),
          paused,
          resumed
        });
        return resumed;
      })
    );
    return '真实 Form Queue 先暂停再恢复，两个 fileSelect 字段并发登记只接受一个新私有文件，A 仍可复用，总量为 2，第三个合法新文件不再获得 Ref。';
  },
  async C4(context) {
    const c = await workflowScenario(context),
      s = await workflowService(context, c);
    const graph = await c.load('root-variables');
    graph.chatConfig.fileSelectConfig = { canSelectFile: true, maxFiles: 10 };
    const appId = await c.create('file-variable-setter', graph),
      chatId = c.run + '-setter';
    const a = await c.upload({ appId, chatId });
    const prepared = await s.prepareWorkflowFileContext({
      query: [],
      histories: [],
      scope: { sourceType: 'app', sourceId: appId, uid: c.fixture.actors.owner.tmbId, chatId },
      maxFileAmount: 3,
      maxBytesPerFile: 1024
    });
    const state = await s.WorkflowVariableState.create({
      timezone: 'Asia/Shanghai',
      runningAppInfo: { sourceType: 'app', sourceId: appId },
      uid: c.fixture.actors.owner.tmbId,
      chatId,
      responseChatItemId: c.run,
      variablesConfig: [
        { key: 'files', label: 'files', type: 'file', maxFiles: 3, required: false }
      ],
      inputVariables: { files: [{ key: a.key, name: a.name, type: a.type }] },
      maxFileAmount: 3,
      resolveInputFile: async (file) =>
        (await prepared.fileContext.register({ file, source: 'variable' })).modelUrl
    });
    const runtimeUrl = state.get('files')[0],
      external = c.fixture.workflowRuntime.gateUrl + '/file.txt';
    await state.set('files', [runtimeUrl, external]);
    const expected = [
      { key: a.key, name: a.name, type: a.type },
      { url: external, name: 'file.txt', type: 'document' }
    ];
    assert.deepEqual(state.getStoreValue('files'), expected);
    assert.deepEqual(state.toStoreRecord().files, expected);
    assert.deepEqual(state.toRuntimeRecord().files, [runtimeUrl, external]);
    assert.equal(prepared.fileContext.resolve(external), undefined, '变量 setter 不扩展登记表');
    for (const invalid of ['/relative.txt', 'file:///private.txt']) {
      await assert.rejects(() => state.set('files', [runtimeUrl, invalid]));
      assert.deepEqual(state.getStoreValue('files'), expected, '非法本次更新必须原子拒绝');
    }
    // 同一 app/chat 的真实入口和更新节点进一步验证可持久化形态，不把 getter 测试冒充会话写入。
    const published = await c.load('special-variables', {
      __PRIVATE_FILE_KEY__: a.key,
      __FILE_URL__: external
    });
    published.chatConfig.variables.find((item) => item.key === 'files').defaultValue = [];
    Object.assign(
      published.nodes
        .find((node) => node.nodeId === 'Update')
        .inputs.find((input) => input.key === 'updateList')
        .value.find((item) => item.variable[1] === 'files'),
      { renderType: 'reference', value: ['VARIABLE_NODE_ID', 'files'] }
    );
    success(
      await c.request({
        route: `/api/core/app/version/publish?appId=${appId}`,
        body: { ...published, isPublish: true, versionName: 'FG-TEST file variable' }
      })
    );
    const result = await c.complete(appId, {
      chatId,
      stream: true,
      extra: { variables: { files: expected } }
    });
    success(result);
    const stored = await c.persisted(appId, chatId);
    assert.deepEqual(stored.chats[0].variables.files, expected);
    c.record('真实文件 setter 对照', {
      store: state.getStoreValue('files'),
      persisted: stored.chats[0].variables.files,
      privateRef: prepared.fileContext.resolve(runtimeUrl),
      externalRegistered: Boolean(prepared.fileContext.resolve(external)),
      rejected: ['relative', 'non-http']
    });
    return '真实变量实例保留私有 key/name/type，外链作为 URL 保存但不登记 Context；相对及非 HTTP 更新原子拒绝，原值未被部分改写。';
  },
  async C5(context) {
    const c = await workflowScenario(context),
      s = await workflowService(context, c);
    const observed = [],
      limit = 32;
    const server = createServer((req, res) => {
      const name = req.url.split('?')[0].slice(1),
        large = name === 'large.txt' || name === 'mismatch.txt';
      const value = name === 'small.txt' ? 'SMALL' : 'x'.repeat(large ? limit + 1 : limit);
      observed.push({ method: req.method, path: req.url, actualBytes: value.length });
      res.setHeader('content-type', 'text/plain');
      if (req.method === 'HEAD') {
        res.setHeader('content-length', name === 'mismatch.txt' ? 1 : value.length);
        return res.end();
      }
      if (name !== 'mismatch.txt') res.setHeader('content-length', value.length);
      res.end(value);
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    context.cleanups.push(async () => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    });
    const baseUrl = 'http://127.0.0.1:' + server.address().port;
    const graph = await c.load('file-reader', { __FILE_URL__: baseUrl + '/small.txt' });
    graph.chatConfig.fileSelectConfig = { canSelectFile: true, maxFiles: 10 };
    const appId = await c.create('file-size-limits', graph);
    for (const [source, size] of [
      ['private', limit],
      ['private', limit + 1],
      ['external', limit],
      ['external', limit + 1],
      ['mismatch', limit + 1]
    ]) {
      const chatId = c.run + '-' + source + '-' + size;
      const query = [{ type: 'text', text: { content: c.run } }];
      let url;
      if (source === 'private') {
        const file = await c.upload({
          appId,
          chatId,
          filename: 'private-' + size + '.txt',
          content: 'x'.repeat(size)
        });
        url = file.url;
        query.push({
          type: 'file',
          file: { key: file.key, url: file.url, name: file.name, type: file.type }
        });
      } else
        url =
          baseUrl +
          '/' +
          (source === 'mismatch' ? 'mismatch.txt' : size === limit ? 'limit.txt' : 'large.txt') +
          '?run=' +
          chatId;
      const copy = structuredClone(graph);
      copy.nodes
        .find((node) => node.nodeId === 'Files')
        .inputs.find((input) => input.key === 'fileUrlList').value = [
        url,
        baseUrl + '/small.txt?run=' + chatId
      ];
      const data = await s.props(appId, copy, chatId, { query, maxBytesPerFile: limit });
      const result = await s.dispatchWorkFlow(data);
      const rows = result.debugResponse.memoryNodes
        .find((node) => node.nodeId === 'Files')
        .outputs.find((output) => output.key === 'system_rawResponse').value;
      assert.equal(rows.length, 2, '单文件失败不吞掉同批小文件');
      assert.equal(rows[1].text, 'SMALL');
      assert.equal(rows[1].error, undefined);
      if (source === 'private' || size === limit) {
        assert.equal(rows[0].error, undefined);
        assert.equal(rows[0].text, 'x'.repeat(size));
      } else assert.ok(rows[0].error, 'L+1 必须被实际读取器拒绝');
      c.record('真实文件字节边界', {
        source,
        bytes: size,
        limit,
        rows,
        observed: observed.filter((item) => item.path.includes(chatId))
      });
    }
    const zero = await c.upload({ appId, chatId: c.run + '-zero' });
    const zeroGraph = await c.load('empty-input');
    const zeroQuery = [
      { type: 'text', text: { content: 'KEEP-TEXT' } },
      { type: 'file', file: { key: zero.key, name: zero.name, type: zero.type } }
    ];
    const filtered = await s.prepareWorkflowFileContext({
      query: zeroQuery,
      histories: [],
      scope: {
        sourceType: 'app',
        sourceId: appId,
        uid: c.fixture.actors.owner.tmbId,
        chatId: c.run + '-zero'
      },
      maxFileAmount: 0,
      maxBytesPerFile: limit
    });
    assert.deepEqual(filtered.query, [zeroQuery[0]]);
    assert.equal(filtered.fileContext.resolveInputFile(zero), undefined);
    const zeroResult = await s.dispatchWorkFlow(
      await s.props(appId, zeroGraph, c.run + '-zero', { maxFileAmount: 0, query: zeroQuery })
    );
    const start = zeroResult.debugResponse.memoryNodes.find((node) => node.nodeId === 'Start');
    assert.equal(start.outputs.find((output) => output.key === 'userChatInput').value, 'KEEP-TEXT');
    const rawQuery = zeroResult.debugResponse.memoryNodes.find((node) => node.nodeId === 'Reply');
    assert.ok(rawQuery);
    c.record('零文件额度真实入口', {
      maxFileAmount: 0,
      text: 'KEEP-TEXT',
      fileConsumers: zeroResult.flatNodeResponses.filter((row) => row.readFiles?.length),
      result: zeroResult
    });
    return '可信私有对象沿用上传鉴权/metadata；公网 L 可读、L+1 拒绝，HEAD=1/实际 GET=L+1 仍拒绝，同批小文件继续；零额度保留文本并无文件消费。';
  }
});
