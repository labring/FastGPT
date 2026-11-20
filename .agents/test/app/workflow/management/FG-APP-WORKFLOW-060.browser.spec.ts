import { expect, type APIRequestContext } from '@playwright/test';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  VariableInputEnum,
  VARIABLE_NODE_ID,
  WorkflowIOValueTypeEnum
} from '../../../../../packages/global/core/workflow/constants';
import { DatasetTagFilterVersionEnum } from '../../../../../packages/global/core/dataset/constants';
import { FlowNodeInputTypeEnum } from '../../../../../packages/global/core/workflow/node/constant';
import { AssignedAnswerModule } from '../../../../../packages/global/core/workflow/template/system/assignedAnswer';
import { DatasetSearchModule } from '../../../../../packages/global/core/workflow/template/system/datasetSearch';
import { CodeNode } from '../../../../../packages/global/core/workflow/template/system/sandbox';
import { buildWorkflowGraph, workflowEditor } from '../editor/workflow.browser';
import {
  attachJson,
  chooseSave,
  openEditor,
  publishPath,
  removeTestApp,
  responseData,
  test,
  waitForSave,
  webHeaders,
  type AppDetail,
  type WorkflowGraph
} from '../editor/workflow-persistence.browser';

const caseId = 'FG-APP-WORKFLOW-060';
const missingLabel = 'Historical Origin';
const referenceValue = `{{$Source.${NodeOutputKeyEnum.text}$}}/{{$Start.${NodeOutputKeyEnum.userChatInput}$}}`;
const connected = buildWorkflowGraph(
  ['Start', 'Source', 'Consumer'],
  [
    ['Start', 'Source'],
    ['Start', 'Consumer'],
    ['Source', 'Consumer']
  ]
);
const origin = connected.nodes[1];
origin.name = missingLabel;
connected.nodes[2].inputs.find((input) => input.key === NodeInputKeyEnum.textareaInput)!.value =
  referenceValue;

const missing = {
  reference: ['Source', NodeOutputKeyEnum.text] as [string, string],
  sourceLabel: missingLabel,
  outputLabel: 'Historical Output'
};
const deleted: WorkflowGraph = {
  ...connected,
  nodes: connected.nodes.filter(({ nodeId }) => nodeId !== 'Source'),
  edges: connected.edges.filter(({ source, target }) => source !== 'Source' && target !== 'Source')
};

const consumerValue = ({ nodes }: Pick<WorkflowGraph, 'nodes'>) =>
  nodes
    .find(({ nodeId }) => nodeId === 'Consumer')
    ?.inputs.find(({ key }) => key === NodeInputKeyEnum.textareaInput)?.value;

const get = async <T>({
  request,
  route,
  params
}: {
  request: APIRequestContext;
  route: string;
  params: Record<string, string>;
}) => responseData<T>(await request.get('/api/core/app/' + route, { params, headers: webHeaders }));

async function save({
  request,
  appId,
  data
}: {
  request: APIRequestContext;
  appId: string;
  data: WorkflowGraph & {
    autoSave?: boolean;
    isPublish?: boolean;
    versionName?: string;
  };
}) {
  const response = await request.post(publishPath, {
    params: { appId },
    headers: webHeaders,
    data
  });
  expect(await responseData(response)).toBeNull();
  return { http: response.status(), code: 200, data: null };
}

test(`[${caseId}/C1] 快照裁剪、省略继承和显式清空`, async ({ app, request }, info) => {
  const extra = [
    { reference: ['Unreferenced', 'output'] as [string, string], sourceLabel: 'Unused' },
    {
      reference: ['Start', NodeOutputKeyEnum.userChatInput] as [string, string],
      sourceLabel: 'Live Start'
    }
  ];
  const matrix = [
    {
      name: 'compact',
      data: { ...deleted, referenceSnapshots: [missing, ...extra] },
      expected: [missing]
    },
    { name: 'manual-inherit', data: { ...deleted, autoSave: false }, expected: [missing] },
    { name: 'auto-inherit', data: { ...deleted, autoSave: true }, expected: [missing] },
    { name: 'explicit-clear', data: { ...deleted, referenceSnapshots: [] }, expected: [] }
  ];
  for (const { name, data, expected } of matrix) {
    const response = await save({ request, appId: app._id, data });
    const draft = await get<AppDetail>({ request, route: 'detail', params: { appId: app._id } });
    const consumer = consumerValue(draft);
    expect(draft.referenceSnapshots).toEqual(expected);
    expect(consumer).toEqual(referenceValue);
    expect(draft.publishedVersionId).toEqual(app.publishedVersionId);
    await attachJson({
      testInfo: info,
      name,
      data: {
        submitted: data.referenceSnapshots ?? null,
        autoSave: 'autoSave' in data ? data.autoSave : undefined,
        response,
        snapshots: draft.referenceSnapshots,
        consumer,
        publishedVersionId: draft.publishedVersionId
      }
    });
  }
});

test(`[${caseId}/C2] 正式版本及团队云端恢复快照`, async ({ app, request, page }, info) => {
  const appId = app._id;
  const versionName = 'Snapshot history ' + appId.slice(-8);
  await save({
    request,
    appId,
    data: {
      ...deleted,
      referenceSnapshots: [missing],
      isPublish: true,
      versionName
    }
  });
  const published = await get<AppDetail>({ request, route: 'detail', params: { appId } });
  expect(published.publishedVersionId).toMatch(/^[a-f\d]{24}$/);
  const versionId = published.publishedVersionId!;
  await save({ request, appId, data: { ...deleted, referenceSnapshots: [] } });
  const draft = await get<AppDetail>({ request, route: 'detail', params: { appId } });
  const listed = await responseData<{
    list: { _id: string; versionName: string; isPublish: boolean }[];
  }>(
    await request.post('/api/core/app/version/list', {
      data: { appId, pageNum: 1, pageSize: 20 },
      headers: webHeaders
    })
  );
  expect(listed.list.find((version) => version._id === versionId)).toMatchObject({
    versionName,
    isPublish: true
  });
  const live = await get<WorkflowGraph>({ request, route: 'version/latest', params: { appId } });
  const historical = await get<WorkflowGraph>({
    request,
    route: 'version/detail',
    params: { appId, versionId }
  });
  expect(draft.referenceSnapshots).toEqual([]);
  for (const version of [live, historical]) {
    expect(version.referenceSnapshots).toEqual([missing]);
    expect(consumerValue(version)).toBe(referenceValue);
  }
  await openEditor(page, appId);
  await page
    .locator('button')
    .filter({ has: page.locator('svg[data-fastgpt-icon-scoped$="-history"]') })
    .click();
  await page.getByText('团队云端', { exact: true }).click();
  await page.getByText(versionName, { exact: true }).click();
  await expect(page.getByText('切换成功', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  const exported = (await workflowEditor(page, info).exportGraph()) as WorkflowGraph;
  expect(exported.referenceSnapshots).toEqual([missing]);
  expect(consumerValue(exported)).toBe(referenceValue);
  const stillDraft = await get<AppDetail>({ request, route: 'detail', params: { appId } });
  expect(stillDraft.referenceSnapshots).toEqual([]);
  expect(stillDraft.publishedVersionId).toBe(versionId);
  await attachJson({
    testInfo: info,
    name: 'live-history-draft-roundtrip',
    data: {
      versionId,
      versionName,
      live: live.referenceSnapshots,
      historical: historical.referenceSnapshots,
      draft: stillDraft.referenceSnapshots,
      exported: exported.referenceSnapshots,
      consumer: consumerValue(exported)
    }
  });
});

test.describe('用户在画布删除真实来源', () => {
  test.use({ graph: connected });

  test(`[${caseId}/C3] 删除、导出与重新导入保留引用来源提示`, async ({ app, page }, info) => {
    await openEditor(page, app._id);
    const editor = workflowEditor(page, info);
    const sourceOutput = (await editor.exportGraph()).nodes
      .find(({ nodeId }) => nodeId === 'Source')!
      .outputs.find(({ key }) => key === NodeOutputKeyEnum.text)!;
    await editor.fitCanvas();
    await editor.deleteNode('Source');
    const exported = (await editor.exportGraph()) as WorkflowGraph;
    expect(exported.referenceSnapshots).toEqual([
      {
        ...missing,
        outputLabel: sourceOutput.label,
        localizeOutputLabel: true,
        icon: origin.avatar
      }
    ]);
    expect(consumerValue(exported)).toBe(referenceValue);
    expect(editor.tupleSet(exported)).toEqual(editor.tupleSet(deleted));
    await editor.importGraph(connected);
    await editor.importGraph(exported);
    const rendered = page
      .locator('.react-flow__node[data-id="Consumer"]')
      .getByText(/Historical Origin.*拼接结果/)
      .first();
    await expect(rendered).toBeVisible();
    await rendered.hover();
    await expect(page.getByRole('tooltip').filter({ hasText: '变量已删除' })).toBeVisible();
    await info.attach('missing-origin-label', {
      body: await page.screenshot(),
      contentType: 'image/png'
    });
    const roundtrip = (await editor.exportGraph()) as WorkflowGraph;
    expect(roundtrip.referenceSnapshots).toEqual(exported.referenceSnapshots);
    expect(consumerValue(roundtrip)).toBe(referenceValue);
    await attachJson({
      testInfo: info,
      name: 'snapshot-import-export',
      data: {
        afterDelete: exported.referenceSnapshots,
        afterImport: roundtrip.referenceSnapshots,
        visibleLabel: await rendered.innerText(),
        consumer: consumerValue(roundtrip),
        edges: roundtrip.edges
      }
    });
  });
});

test.describe('旧知识库整项筛选引用', () => {
  const sourceKey = 'result';
  const sourceId = 'ref123';
  const graph = buildWorkflowGraph(
    ['Start', 'Code', 'Search'],
    [
      ['Start', 'Code'],
      ['Code', 'Search']
    ]
  );
  graph.nodes[1] = {
    ...graph.nodes[1],
    ...CodeNode,
    name: 'Code',
    outputs: CodeNode.outputs.map((output) =>
      output.key === sourceKey ? { ...output, id: sourceId } : output
    )
  };
  graph.nodes[2] = {
    ...graph.nodes[2],
    ...DatasetSearchModule,
    name: 'Search',
    inputs: DatasetSearchModule.inputs.map((input) => {
      if (input.key === NodeInputKeyEnum.collectionFilterVersion) {
        return { ...input, value: DatasetTagFilterVersionEnum.legacy };
      }
      if (input.key === NodeInputKeyEnum.collectionFilterMatch) {
        return {
          ...input,
          renderTypeList: [FlowNodeInputTypeEnum.textarea, FlowNodeInputTypeEnum.reference],
          selectedType: FlowNodeInputTypeEnum.textarea,
          value: ['Code', sourceKey]
        };
      }
      return input;
    })
  };
  const readFilter = ({ nodes }: Pick<WorkflowGraph, 'nodes'>) => ({
    outputId: nodes
      .find((node) => node.nodeId === 'Code')
      ?.outputs.find((output) => output.key === sourceKey)?.id,
    value: nodes
      .find((node) => node.nodeId === 'Search')
      ?.inputs.find((input) => input.key === NodeInputKeyEnum.collectionFilterMatch)?.value
  });
  test.use({ graph });

  test(`[${caseId}/C6] 旧筛选引用在导出和草稿中绑定真实输出 ID`, async ({
    app,
    page,
    request
  }, info) => {
    expect(readFilter(app)).toEqual({ outputId: sourceId, value: ['Code', sourceKey] });
    await openEditor(page, app._id);
    const editor = workflowEditor(page, info);
    const exported = readFilter(await editor.exportGraph());
    const normalized = { outputId: sourceId, value: ['Code', sourceId] };
    expect(exported).toEqual(normalized);

    const pendingSave = waitForSave({ page, appId: app._id, autoSave: false });
    await chooseSave(page, '仅保存');
    const saved = await pendingSave;
    expect(await responseData(saved)).toBeNull();
    const submitted = saved.request().postDataJSON();
    expect(submitted.isPublish).not.toBe(true);
    const submittedFilter = readFilter(submitted);
    const draft = await get<AppDetail>({ request, route: 'detail', params: { appId: app._id } });
    const draftFilter = readFilter(draft);
    expect(submittedFilter).toEqual(normalized);
    expect(draftFilter).toEqual(normalized);
    expect(draft.publishedVersionId).toEqual(app.publishedVersionId);

    await page.reload();
    await expect(page.getByRole('button', { name: 'Expand', exact: true })).toBeVisible();
    await expect(page.locator('.react-flow__node')).toHaveCount(graph.nodes.length);
    const restored = readFilter(await editor.exportGraph());
    expect(restored).toEqual(normalized);
    await attachJson({
      testInfo: info,
      name: 'legacy-whole-filter-roundtrip',
      data: {
        inputKey: NodeInputKeyEnum.collectionFilterMatch,
        sourceKey,
        created: readFilter(app),
        exported,
        submitted: submittedFilter,
        draft: draftFilter,
        restored
      }
    });
  });
});

test(`[${caseId}/C8] 同名新输出不会接管已有历史快照的引用`, async ({
  app,
  page,
  request
}, info) => {
  const graph = structuredClone(connected);
  const replacement = {
    ...CodeNode.outputs.find(({ key }) => key === 'result')!,
    id: 'replacement-output-id',
    key: missing.reference[1],
    label: 'Current Output'
  };
  graph.nodes[1] = { ...graph.nodes[1], ...CodeNode, name: 'Code', outputs: [replacement] };
  const value = `${referenceValue}/{{$Source.${replacement.id}$}}`;
  graph.nodes[2].inputs.find(({ key }) => key === NodeInputKeyEnum.textareaInput)!.value = value;
  await save({ request, appId: app._id, data: { ...graph, referenceSnapshots: [missing] } });

  const readReferences = ({ nodes, referenceSnapshots }: Omit<WorkflowGraph, 'type'>) => ({
    outputId: nodes
      .find(({ nodeId }) => nodeId === 'Source')
      ?.outputs.find(({ key }) => key === replacement.key)?.id,
    value: consumerValue({ nodes }),
    referenceSnapshots
  });
  const expected = { outputId: replacement.id, value, referenceSnapshots: [missing] };
  await openEditor(page, app._id);
  const editor = workflowEditor(page, info);
  const lostOutput = page
    .locator('.react-flow__node[data-id="Consumer"]')
    .getByText(/Historical Origin.*Historical Output/)
    .first();
  await expect(lostOutput).toBeVisible();
  const opened = readReferences(await editor.exportGraph());
  expect(opened).toEqual(expected);

  const pendingSave = waitForSave({ page, appId: app._id, autoSave: false });
  await chooseSave(page, '仅保存');
  const persisted = await pendingSave;
  expect(await responseData(persisted)).toBeNull();
  const submitted = readReferences(persisted.request().postDataJSON());
  expect(submitted).toEqual(expected);
  const draft = await get<AppDetail>({ request, route: 'detail', params: { appId: app._id } });
  expect(readReferences(draft)).toEqual(expected);
  expect(draft.publishedVersionId).toBe(app.publishedVersionId);

  await page.reload();
  await expect(lostOutput).toBeVisible({ timeout: 30_000 });
  const reopened = readReferences(await editor.exportGraph());
  expect(reopened).toEqual(expected);
  await attachJson({
    testInfo: info,
    name: 'historical-output-key-collision',
    data: {
      opened,
      submitted,
      draft: readReferences(draft),
      reopened,
      label: await lostOutput.innerText()
    }
  });
});

/** 复制/转换后的版本保留完整的消费者、边和已删除来源元数据。 */
function expectVersionGraph(version: Omit<WorkflowGraph, 'type'>, hasDeletedSource: boolean) {
  const expected = hasDeletedSource ? deleted : connected;
  expect(version.nodes.map(({ nodeId }) => nodeId)).toEqual(
    expected.nodes.map(({ nodeId }) => nodeId)
  );
  expect(version.edges).toMatchObject(expected.edges);
  expect(version.referenceSnapshots).toEqual(hasDeletedSource ? [missing] : []);
  expect(consumerValue(version)).toBe(referenceValue);
}

test.describe('工作流复制', () => {
  test.use({ graph: connected });

  test(`[${caseId}/C4] 复制工作草稿，来源正式版本独立`, async ({ app, request }, info) => {
    const appId = app._id;
    await save({ request, appId, data: { ...deleted, referenceSnapshots: [missing] } });
    const { appId: copyId } = await responseData<{ appId: string }>(
      await request.post('/api/core/app/copy', { data: { appId }, headers: webHeaders })
    );
    expect(copyId).not.toEqual(appId);
    try {
      await attachJson({
        testInfo: info,
        name: 'temporary-app',
        data: {
          appId: copyId,
          teamId: app.teamId,
          sourceAppId: appId
        }
      });
      const copy = await get<AppDetail>({ request, route: 'detail', params: { appId: copyId } });
      const liveCopy = await get<WorkflowGraph>({
        request,
        route: 'version/latest',
        params: { appId: copyId }
      });
      const original = await get<AppDetail>({ request, route: 'detail', params: { appId } });
      const liveOriginal = await get<WorkflowGraph>({
        request,
        route: 'version/latest',
        params: { appId }
      });
      expect(copy.teamId).toBe(app.teamId);
      expect(copy.type).toBe('advanced');
      expect(copy.publishedVersionId).toMatch(/^[a-f\d]{24}$/);
      expect(copy.publishedVersionId).not.toBe(original.publishedVersionId);
      expect(original.publishedVersionId).toBe(app.publishedVersionId);
      expectVersionGraph(copy, true);
      expectVersionGraph(liveCopy, true);
      expectVersionGraph(original, true);
      expectVersionGraph(liveOriginal, false);
      await attachJson({
        testInfo: info,
        name: 'copied-workflow-and-original',
        data: {
          copy,
          liveCopy,
          original,
          liveOriginal
        }
      });
    } finally {
      await removeTestApp({ request, appId: copyId, testInfo: info });
    }
  });
});

test.describe('简易应用转换', () => {
  test.use({ graph: { ...connected, type: 'simple' } });

  for (const createNew of [true, false]) {
    test(`[${caseId}/C5] ${createNew ? '新建' : '原地'}转换保留草稿快照`, async ({
      app,
      request
    }, info) => {
      const appId = app._id;
      expect(app.type).toBe('simple');
      await save({ request, appId, data: { ...deleted, referenceSnapshots: [missing] } });
      const result = await responseData<{ id: string } | null>(
        await request.post('/api/core/app/transitionWorkflow', {
          data: { appId, createNew },
          headers: webHeaders
        })
      );
      const convertedId = result?.id ?? appId;
      if (createNew) expect(convertedId).not.toEqual(appId);
      else expect(result).toBeNull();
      try {
        if (createNew) {
          await attachJson({
            testInfo: info,
            name: 'temporary-app',
            data: {
              appId: convertedId,
              teamId: app.teamId,
              sourceAppId: appId
            }
          });
        }
        const converted = await get<AppDetail>({
          request,
          route: 'detail',
          params: { appId: convertedId }
        });
        const liveConverted = await get<WorkflowGraph>({
          request,
          route: 'version/latest',
          params: {
            appId: convertedId
          }
        });
        const source = createNew
          ? await get<AppDetail>({ request, route: 'detail', params: { appId } })
          : converted;
        expect(converted.teamId).toBe(app.teamId);
        expect(converted.type).toBe('advanced');
        expect(source.type).toBe(createNew ? 'simple' : 'advanced');
        expect(source.publishedVersionId).toBe(app.publishedVersionId);
        if (createNew) {
          expect(converted.publishedVersionId).toMatch(/^[a-f\d]{24}$/);
          expect(converted.publishedVersionId).not.toBe(source.publishedVersionId);
          expectVersionGraph(source, true);
          expectVersionGraph(
            await get<WorkflowGraph>({ request, route: 'version/latest', params: { appId } }),
            false
          );
        }
        expectVersionGraph(converted, true);
        expectVersionGraph(liveConverted, createNew);
        await attachJson({
          testInfo: info,
          name: 'converted-and-source',
          data: {
            createNew,
            appId,
            converted,
            liveConverted,
            source
          }
        });
      } finally {
        if (createNew) await removeTestApp({ request, appId: convertedId, testInfo: info });
      }
    });
  }
});

test(`[${caseId}/C7] CLI 往返保留快照且正式运行将失效引用视为空`, async ({
  app,
  request,
  baseURL
}, info) => {
  const appId = app._id;
  const graph = buildWorkflowGraph(
    ['Start', 'Source', 'Text', 'VariableText', 'Code', 'Reply'],
    [
      ['Start', 'Source'],
      ['Source', 'Text'],
      ['Text', 'VariableText'],
      ['VariableText', 'Code'],
      ['Code', 'Reply']
    ]
  );
  const liveReference: [string, string] = ['Source', 'current-text-id'];
  const sourceOutput = graph.nodes[1].outputs.find(({ key }) => key === NodeOutputKeyEnum.text)!;
  sourceOutput.id = liveReference[1];
  const changedVariable: [string, string] = [VARIABLE_NODE_ID, 'changed'];
  for (const [index, value] of [
    [2, missing.reference],
    [3, changedVariable]
  ] as const) {
    graph.nodes[index].inputs = graph.nodes[index].inputs.map((input) =>
      input.key === NodeInputKeyEnum.textareaInput
        ? {
            ...input,
            required: false,
            renderTypeList: [FlowNodeInputTypeEnum.reference],
            selectedType: FlowNodeInputTypeEnum.reference,
            value
          }
        : input
    );
  }
  graph.chatConfig.variables = [
    {
      key: 'changed',
      label: 'Changed',
      description: '',
      type: VariableInputEnum.switch,
      valueType: WorkflowIOValueTypeEnum.boolean,
      defaultValue: true
    }
  ];
  const output = CodeNode.outputs.find(({ key }) => key === 'result')!;
  graph.nodes[4] = {
    ...graph.nodes[4],
    ...CodeNode,
    inputs: [
      ...CodeNode.inputs.map((input) => {
        if (input.key === 'data1') {
          return {
            ...input,
            selectedType: FlowNodeInputTypeEnum.reference,
            value: ['Text', NodeOutputKeyEnum.text]
          };
        }
        if (input.key === 'data2') {
          return { ...input, value: ['VariableText', NodeOutputKeyEnum.text] };
        }
        if (input.key === NodeInputKeyEnum.code) {
          return {
            ...input,
            value:
              "function main({ data1, data2, flag, current }) { return { result: data1 === '' && data2 === '' && flag === true && current === '固定文本 Source' ? 'empty' : 'unexpected input' }; }"
          };
        }
        return input;
      }),
      {
        key: 'flag',
        label: 'Flag',
        canEdit: true,
        renderTypeList: [FlowNodeInputTypeEnum.reference],
        valueType: WorkflowIOValueTypeEnum.boolean,
        value: changedVariable
      },
      {
        key: 'current',
        label: 'Current output',
        canEdit: true,
        renderTypeList: [FlowNodeInputTypeEnum.reference],
        valueType: WorkflowIOValueTypeEnum.string,
        value: liveReference
      }
    ],
    outputs: [output]
  };
  graph.nodes[5] = {
    ...graph.nodes[5],
    ...AssignedAnswerModule,
    inputs: AssignedAnswerModule.inputs.map((input) => ({
      ...input,
      selectedType: FlowNodeInputTypeEnum.reference,
      value: ['Code', output.id]
    }))
  };
  await save({
    request,
    appId,
    data: { ...graph, isPublish: false, referenceSnapshots: [missing] }
  });
  const { cookies } = await request.storageState();
  const session = cookies.find(({ name }) => name === 'fastgpt_token');
  expect(session).toBeDefined();
  const repo = process.cwd();
  const tsx = createRequire(join(repo, 'projects/app/package.json')).resolve('tsx/cli');
  const cli = join(repo, 'cli/src/cli/cli.ts');
  const dir = await mkdtemp(join(tmpdir(), 'fastgpt-case-060-cli-'));
  const tsconfig = join(dir, 'tsconfig.json');
  const env = {
    FASTGPT_BASE_URL: new URL('/api', baseURL).toString(),
    FASTGPT_TOKEN: decodeURIComponent(session!.value),
    FASTGPT_CONFIG_DIR: join(dir, 'config'),
    FASTGPT_SECRET_STORE: 'file'
  };
  const command = async (operation: 'pull' | 'save' | 'publish' | 'diff') => {
    try {
      const { stdout } = await promisify(execFile)(
        process.execPath,
        [
          tsx,
          '--tsconfig',
          tsconfig,
          cli,
          operation === 'diff' ? 'workflow' : 'app',
          operation,
          appId,
          '--dir',
          dir,
          '--format',
          'json'
        ],
        { cwd: dir, env: { ...env, PATH: process.env.PATH }, timeout: 30_000 }
      );
      return {
        operation,
        exitCode: 0,
        result: operation === 'diff' ? JSON.parse(stdout) : undefined
      };
    } catch (error) {
      const stdout = error instanceof Error && 'stdout' in error ? String(error.stdout) : '';
      const message = (String(error) + '\n' + stdout)
        .replaceAll(env.FASTGPT_TOKEN, '[REDACTED]')
        .replaceAll(session!.value, '[REDACTED]');
      throw new Error(message);
    }
  };
  const readReferences = ({ nodes }: WorkflowGraph) => ({
    historical: nodes
      .find(({ nodeId }) => nodeId === 'Text')
      ?.inputs.find(({ key }) => key === NodeInputKeyEnum.textareaInput)?.value,
    current: nodes
      .find(({ nodeId }) => nodeId === 'Code')
      ?.inputs.find(({ key }) => key === 'current')?.value
  });
  const expectedReferences = { historical: missing.reference, current: liveReference };
  const welcomeText = 'CLI snapshot round trip';
  try {
    // 和 CLI 单测一致解析 workspace 源码，避免误用本机上次构建的 workflow-core。
    await writeFile(
      tsconfig,
      JSON.stringify({
        compilerOptions: {
          baseUrl: repo,
          paths: {
            '@fastgpt/workflow-core/*': ['packages/workflow-core/src/*'],
            '@fastgpt/global/*': ['packages/global/*']
          }
        }
      })
    );
    const pulled = await command('pull');
    const workflowPath = join(dir, 'workflow.json');
    const local = JSON.parse(await readFile(workflowPath, 'utf8'));
    const { referenceSnapshots, ...legacy } = local;
    expect(referenceSnapshots).toEqual([missing]);
    const edited = {
      ...legacy,
      chatConfig: {
        ...local.chatConfig,
        welcomeText,
        welcomeConfig: { ...local.chatConfig.welcomeConfig, welcomeText }
      }
    };
    await writeFile(workflowPath, JSON.stringify(edited));
    const saved = await command('save');
    const draft = await get<WorkflowGraph>({ request, route: 'detail', params: { appId } });
    expect(readReferences(draft)).toEqual(expectedReferences);
    expect(draft.referenceSnapshots).toEqual([missing]);
    expect(draft.chatConfig.welcomeText).toBe(welcomeText);
    const inherited = await command('diff');
    await attachJson({ testInfo: info, name: 'cli-inherited-diff', data: inherited.result?.data });
    expect(inherited.result?.data).toMatchObject({
      inSync: true,
      summary: { referenceSnapshotsChanged: false }
    });
    const released = await command('publish');
    await writeFile(workflowPath, JSON.stringify({ ...edited, referenceSnapshots: [] }));
    const cleared = await command('diff');
    expect(cleared.result?.data).toMatchObject({
      inSync: false,
      summary: { referenceSnapshotsChanged: true }
    });
    await attachJson({
      testInfo: info,
      name: 'cli-round-trip',
      data: {
        pulled,
        saved,
        inherited,
        released,
        cleared,
        draftReferences: readReferences(draft),
        draftSnapshots: draft.referenceSnapshots
      }
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  const published = await get<WorkflowGraph>({
    request,
    route: 'version/latest',
    params: { appId }
  });
  expect(readReferences(published)).toEqual(expectedReferences);
  expect(published.referenceSnapshots).toEqual([missing]);
  expect(published.chatConfig.welcomeText).toBe(welcomeText);

  const response = await request.post('/api/v2/chat/completions', {
    headers: webHeaders,
    data: { appId, messages: [{ role: 'user', content: 'Check optional input' }], stream: false }
  });
  expect(response.status()).toBe(200);
  const completion = await response.json();
  expect(completion.choices[0].message.content.trim()).toBe('empty');
  await attachJson({
    testInfo: info,
    name: 'published-optional-reference',
    data: {
      references: readReferences(published),
      snapshots: published.referenceSnapshots,
      content: completion.choices[0].message.content
    }
  });
});
