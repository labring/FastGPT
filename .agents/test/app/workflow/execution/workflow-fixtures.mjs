import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFile, realpath } from 'node:fs/promises';

const repo = fileURLToPath(new URL('../../../../../', import.meta.url));
const require = createRequire(repo + 'projects/app/package.json');
const tsx = require('tsx/cjs/api');
const load = (file) => tsx.require(repo + file, fileURLToPath(import.meta.url));
const { StoreNodeItemTypeSchema } = load('packages/global/core/workflow/type/node.ts');
const { StoreEdgeItemTypeSchema } = load('packages/global/core/workflow/type/edge.ts');
const {
  NodeInputKeyEnum: I,
  NodeOutputKeyEnum: O,
  WorkflowIOValueTypeEnum: V,
  VARIABLE_NODE_ID: GLOBAL
} = load('packages/global/core/workflow/constants.ts');
const { FlowNodeInputTypeEnum: Input, FlowNodeOutputTypeEnum: Output } = load(
  'packages/global/core/workflow/node/constant.ts'
);
const template = (file, name) =>
  load('packages/global/core/workflow/template/system/' + file)[name];
const templates = {
  start: template('workflowStart.ts', 'WorkflowStart'),
  answer: template('assignedAnswer.ts', 'AssignedAnswerModule'),
  update: template('variableUpdate/index.tsx', 'VariableUpdateNode'),
  text: template('textEditor.ts', 'TextEditorNode'),
  http: template('http468.ts', 'HttpNode468'),
  app: template('runApp.ts', 'RunAppNode'),
  form: template('interactive/formInput.ts', 'FormInputNode'),
  loop: template('loopRun/loopRun.ts', 'LoopRunNode'),
  loopStart: template('loopRun/loopRunStart.ts', 'LoopRunStartNode'),
  loopBreak: template('loopRun/loopRunBreak.ts', 'LoopRunBreakNode'),
  parallel: template('parallelRun/parallelRun.ts', 'ParallelRunNode'),
  nestedStart: template('loop/loopStart.ts', 'LoopStartNode'),
  nestedEnd: template('loop/loopEnd.ts', 'LoopEndNode'),
  tool: template('toolCall.ts', 'ToolCallNode'),
  toolParams: template('toolParams.ts', 'ToolParamsNode'),
  agent: template('agent/index.ts', 'AgentNode'),
  llm: template('aiChat/index.ts', 'AiChatModule'),
  files: template('readFiles/index.tsx', 'ReadFilesNode'),
  condition: template('ifElse/index.ts', 'IfElseNode'),
  code: template('sandbox/index.ts', 'CodeNode'),
  dataset: template('datasetSearch.ts', 'DatasetSearchModule'),
  pluginInput: template('pluginInput.ts', 'PluginInputModule'),
  pluginOutput: template('pluginOutput.ts', 'PluginOutputModule'),
  plugin: template('runPlugin.ts', 'RunPluginModule'),
  select: template('interactive/userSelect.ts', 'UserSelectNode')
};
const clone = (value) => JSON.parse(JSON.stringify(value));

/** 从真实节点模板构建可导入图；只替换可配置输入，不向 JSON 写入运行 Context 或函数。 */
export function fixtureNode(kind, id, values = {}, extra = {}) {
  const node = {
    ...clone(templates[kind]),
    nodeId: id,
    name: id,
    position: { x: 0, y: 0 },
    ...extra
  };
  for (const [key, value] of Object.entries(values)) {
    const input = node.inputs.find((input) => input.key === key);
    if (input) input.value = value;
    else
      node.inputs.push({ key, label: key, value, valueType: V.any, renderTypeList: [Input.input] });
  }
  return node;
}

/** 使用生产端口格式；容器内边与主链路边分别显式声明。 */
export const fixtureEdge = (source, target, handle = 'right') => ({
  source,
  target,
  sourceHandle: handle === O.selectedTools ? O.selectedTools : `${source}-source-${handle}`,
  targetHandle: handle === O.selectedTools ? O.selectedTools : `${target}-target-left`
});
const ref = (node, key) => `{{$${node}.${key}$}}`;
const valueConfig = (key, valueType, defaultValue) => ({
  key,
  label: key,
  description: '',
  type: 'input',
  valueType,
  defaultValue,
  required: false
});
const variables = [
  valueConfig('a', V.string, 'A0'),
  valueConfig('b', V.string, 'B0'),
  valueConfig('stamp', V.string, 'S0'),
  valueConfig('n', V.number, 9),
  valueConfig('flag', V.boolean, true),
  valueConfig('text', V.string, 'seed'),
  valueConfig('obj', V.object, { items: [1] })
];
const assignment = (key, value, valueType = V.string) => ({
  variable: [GLOBAL, key],
  value: ['', value],
  valueType,
  renderType: Input.input
});
const answer = (id, text) => fixtureNode('answer', id, { [I.answerText]: text });
const update = (id, items) => fixtureNode('update', id, { [I.updateList]: items });
const http = (id, path) =>
  fixtureNode('http', id, {
    [I.httpReqUrl]: '__GATE_URL__' + path,
    [I.httpTimeout]: 100,
    [I.httpJsonBody]: JSON.stringify({ runId: ref('Start', O.userChatInput), node: id })
  });
const graph = (nodes, edges, chatConfig = { variables }) => ({
  nodes: nodes.map((node, index) => ({
    ...node,
    position: { x: index * 300, y: node.parentNodeId ? 300 : 0 }
  })),
  edges,
  chatConfig: clone(chatConfig)
});
const chain = (...nodes) =>
  graph(
    nodes,
    nodes.slice(1).map((node, index) => fixtureEdge(nodes[index].nodeId, node.nodeId))
  );
const start = () => fixtureNode('start', 'Start');
const readVariables = () =>
  answer(
    'ReadVariables',
    ['a', 'b', 'stamp', 'n', 'flag', 'text'].map((key) => `${key}=${ref(GLOBAL, key)}`).join('|')
  );

/** 一份模板覆盖同一拓扑的参数变体；资源 ID、gate 和模型必须在执行前绑定并留档。 */
export function buildWorkflowFixtures() {
  const result = {};
  result['root-variables'] = chain(
    start(),
    update('Update', [
      assignment('n', 0, V.number),
      assignment('flag', false, V.boolean),
      assignment('text', '', V.string),
      assignment('obj', { items: [1, 2] }, V.object)
    ]),
    readVariables()
  );
  result['special-variables'] = clone(result['root-variables']);
  result['special-variables'].chatConfig.variables.push(
    {
      key: 'files',
      label: 'files',
      description: '',
      type: 'file',
      maxFiles: 2,
      defaultValue: [{ key: '__PRIVATE_FILE_KEY__', name: 'a.pdf', type: 'document' }]
    },
    {
      key: 'password',
      label: 'password',
      description: '',
      type: 'password',
      valueType: V.string,
      defaultValue: 'FG-TEST-before'
    }
  );
  result['special-variables'].nodes
    .find((node) => node.nodeId === 'Update')
    .inputs.find((input) => input.key === I.updateList)
    .value.push(
      assignment('files', ['__FILE_URL__'], V.arrayString),
      assignment('password', 'FG-TEST-after')
    );
  result['input-precedence'] = chain(start(), readVariables());
  result['stream-lifecycle'] = chain(
    start(),
    answer('Prefix', 'PREFIX:' + ref('Start', O.userChatInput)),
    http('Gate', '/wait'),
    answer('Tail', 'TAIL:' + ref('Start', O.userChatInput))
  );
  result['error-routing'] = graph(
    [
      start(),
      { ...http('Fail', '/fail'), catchError: true },
      answer('Normal', 'MUST-NOT-RUN'),
      answer('Caught', 'CAUGHT:' + ref('Fail', O.error))
    ],
    [
      fixtureEdge('Start', 'Fail'),
      fixtureEdge('Fail', 'Normal'),
      fixtureEdge('Fail', 'Caught', 'catch-right')
    ]
  );
  // 错误 handle 的分隔符与普通 handle 不同，使用生产错误端口。
  result['error-routing'].edges[2].sourceHandle = 'Fail-source_catch-right';
  result['child-leaf'] = chain(
    start(),
    fixtureNode('text', 'ChildInput', { [I.textareaInput]: ref(GLOBAL, 'a') }),
    update('ChildUpdate', [assignment('a', 'child-output')]),
    answer('ChildReply', 'CHILD:' + ref(GLOBAL, 'a'))
  );
  const child = fixtureNode(
    'app',
    'Child',
    { [I.userChatInput]: ref('Start', O.userChatInput), a: 'child-input', [I.forbidStream]: true },
    {
      pluginId: '__CHILD_APP_ID__',
      outputs: [
        {
          id: O.answerText,
          key: O.answerText,
          label: 'Child answer',
          type: Output.static,
          valueType: V.string
        }
      ]
    }
  );
  result['child-parent'] = chain(
    start(),
    child,
    answer('ParentReply', 'PARENT:' + ref(GLOBAL, 'a') + '|' + ref('Child', O.answerText))
  );
  const form = fixtureNode('form', 'Form', {
    [I.userInputForms]: [
      { key: 'value', label: 'value', type: 'input', valueType: V.string, required: true }
    ]
  });
  result['interactive-checkpoint'] = chain(
    start(),
    http('Once', '/count'),
    update('Checkpoint', [assignment('a', 'checkpoint')]),
    form,
    answer('Resumed', ref('Form', O.formInputResult))
  );
  for (const kind of ['loop', 'parallel']) {
    const container = fixtureNode(kind, 'Container', {
      [kind === 'loop' ? I.loopRunInputArray : I.nestedInputArray]: [0, false, ''],
      [I.childrenNodeIdList]: ['BodyStart', 'BodyUpdate', 'BodyEnd'],
      ...(kind === 'parallel'
        ? { [I.parallelRunMaxConcurrency]: 2, [I.parallelRunMaxRetryTimes]: 0 }
        : {})
    });
    const bodyStart = fixtureNode(
      kind === 'loop' ? 'loopStart' : 'nestedStart',
      'BodyStart',
      {},
      { parentNodeId: 'Container' }
    );
    if (kind === 'parallel')
      bodyStart.outputs.push({
        id: O.nestedStartInput,
        key: O.nestedStartInput,
        label: 'Current item',
        type: Output.static,
        valueType: V.any
      });
    const bodyUpdate = {
      ...update('BodyUpdate', [assignment('a', 'body-complete')]),
      parentNodeId: 'Container'
    };
    const bodyEnd = fixtureNode('nestedEnd', 'BodyEnd', {}, { parentNodeId: 'Container' });
    bodyEnd.inputs.find((item) => item.key === I.nestedEndInput).value = [
      'BodyStart',
      kind === 'loop' ? O.currentItem : O.nestedStartInput
    ];
    result[kind + '-container'] = graph(
      [start(), container, bodyStart, bodyUpdate, bodyEnd, readVariables()],
      [
        fixtureEdge('Start', 'Container'),
        fixtureEdge('Container', 'ReadVariables'),
        fixtureEdge('BodyStart', 'BodyUpdate'),
        fixtureEdge('BodyUpdate', 'BodyEnd')
      ]
    );
  }
  result['loop-break'] = clone(result['loop-container']);
  const breaking = result['loop-break'];
  breaking.nodes = breaking.nodes.filter(
    (node) => !['BodyUpdate', 'BodyEnd'].includes(node.nodeId)
  );
  breaking.nodes.push(fixtureNode('loopBreak', 'Break', {}, { parentNodeId: 'Container' }));
  breaking.nodes
    .find((node) => node.nodeId === 'Container')
    .inputs.find((input) => input.key === I.childrenNodeIdList).value = ['BodyStart', 'Break'];
  breaking.edges = breaking.edges.filter(
    (edge) =>
      !['BodyUpdate', 'BodyEnd'].includes(edge.source) &&
      !['BodyUpdate', 'BodyEnd'].includes(edge.target)
  );
  breaking.edges.push(fixtureEdge('BodyStart', 'Break'));
  result['loop-checkpoint'] = clone(result['loop-container']);
  const checkpoint = result['loop-checkpoint'];
  checkpoint.nodes
    .find((node) => node.nodeId === 'Container')
    .inputs.find((item) => item.key === I.loopRunInputArray).value = ['one'];
  checkpoint.nodes.splice(4, 0, { ...clone(form), parentNodeId: 'Container' });
  checkpoint.nodes
    .find((node) => node.nodeId === 'Container')
    .inputs.find((item) => item.key === I.childrenNodeIdList)
    .value.push('Form');
  checkpoint.edges = checkpoint.edges.filter((edge) => edge.source !== 'BodyUpdate');
  checkpoint.edges.push(fixtureEdge('BodyUpdate', 'Form'), fixtureEdge('Form', 'BodyEnd'));
  result['parallel-retry'] = clone(result['parallel-container']);
  const retry = result['parallel-retry'];
  const parallel = retry.nodes.find((node) => node.nodeId === 'Container');
  parallel.inputs.find((item) => item.key === I.nestedInputArray).value = ['retry', 'sibling'];
  parallel.inputs.find((item) => item.key === I.parallelRunMaxRetryTimes).value = 1;
  retry.nodes = retry.nodes.filter((node) => node.nodeId !== 'BodyUpdate');
  const retryChildren = [
    fixtureNode('condition', 'TaskBranch', {
      [I.ifElseList]: [
        {
          branchId: 'first',
          condition: 'AND',
          list: [
            {
              variable: ['BodyStart', O.nestedStartIndex],
              condition: 'equalTo',
              value: '1',
              valueType: 'input'
            }
          ]
        }
      ]
    }),
    update('FailedWrite', [assignment('a', 'failed')]),
    http('Attempt', '/attempt'),
    update('SuccessWrite', [assignment('a', 'retry-ok')]),
    update('SiblingWrite', [assignment('b', 'B1')])
  ].map((node) => ({ ...node, parentNodeId: 'Container' }));
  retry.nodes.push(...retryChildren);
  parallel.inputs.find((item) => item.key === I.childrenNodeIdList).value = [
    'BodyStart',
    ...retryChildren.map((node) => node.nodeId),
    'BodyEnd'
  ];
  retry.edges = retry.edges.filter((edge) => !['BodyStart', 'BodyUpdate'].includes(edge.source));
  retry.edges.push(
    fixtureEdge('BodyStart', 'TaskBranch'),
    fixtureEdge('TaskBranch', 'FailedWrite', 'first'),
    fixtureEdge('FailedWrite', 'Attempt'),
    fixtureEdge('Attempt', 'SuccessWrite'),
    fixtureEdge('SuccessWrite', 'BodyEnd'),
    fixtureEdge('TaskBranch', 'SiblingWrite', 'ELSE'),
    fixtureEdge('SiblingWrite', 'BodyEnd')
  );
  result['file-reader'] = chain(
    start(),
    fixtureNode('files', 'Files', { [I.fileUrlList]: ['__FILE_URL__'] }),
    answer('FileReply', ref('Files', O.text))
  );
  result['file-form'] = chain(
    start(),
    fixtureNode('form', 'FileForm', {
      [I.userInputForms]: [
        { key: 'first', label: 'first', type: 'fileSelect', required: true, maxFiles: 2 },
        { key: 'second', label: 'second', type: 'fileSelect', required: true, maxFiles: 2 }
      ]
    }),
    answer('FileResult', ref('FileForm', O.formInputResult))
  );
  result['tool-concurrent'] = graph(
    [
      start(),
      fixtureNode('tool', 'Tools', {
        [I.aiModelId]: '__MODEL_ID__',
        [I.userChatInput]: ref('Start', O.userChatInput)
      }),
      fixtureNode('toolParams', 'Slow', {}, { intro: 'slow deterministic tool' }),
      fixtureNode('toolParams', 'Fast', {}, { intro: 'fast deterministic tool' }),
      http('SlowGate', '/slow'),
      http('FastGate', '/fast'),
      update('SlowUpdate', [assignment('a', 'A1'), assignment('stamp', 'slow')]),
      update('FastUpdate', [assignment('b', 'B1'), assignment('stamp', 'fast')]),
      readVariables()
    ],
    [
      fixtureEdge('Start', 'Tools'),
      fixtureEdge('Tools', 'Slow', O.selectedTools),
      fixtureEdge('Tools', 'Fast', O.selectedTools),
      fixtureEdge('Slow', 'SlowGate'),
      fixtureEdge('Fast', 'FastGate'),
      fixtureEdge('SlowGate', 'SlowUpdate'),
      fixtureEdge('FastGate', 'FastUpdate'),
      fixtureEdge('Tools', 'ReadVariables')
    ]
  );
  result['agent-child'] = chain(
    start(),
    fixtureNode('agent', 'Agent', {
      [I.aiModelId]: '__MODEL_ID__',
      [I.userChatInput]: ref('Start', O.userChatInput),
      [I.datasetSearchUsingExtensionQuery]: true,
      [I.selectedTools]: [{ toolId: '__CHILD_APP_ID__' }]
    })
  );
  result['model-resource'] = chain(
    start(),
    fixtureNode('llm', 'Model', {
      [I.aiModelId]: '__MODEL_ID__',
      [I.userChatInput]: ref('Start', O.userChatInput)
    })
  );
  result['empty-input'] = chain(start(), answer('Reply', 'EMPTY-OK'));

  // 基础运行图与上下文回归共用生成入口，避免落盘 JSON 和测试说明各自维护一套节点结构。
  const customInput = ({ key, value, valueType = V.string, reference = false, ...extra }) => ({
    key,
    label: key,
    ...(value !== undefined ? { value } : {}),
    valueType,
    renderTypeList: reference ? [Input.reference, Input.input] : [Input.input, Input.reference],
    selectedType: reference ? Input.reference : Input.input,
    canEdit: true,
    ...extra
  });
  const customOutput = ({ key, id = key, valueType = V.string, ...extra }) => ({
    id,
    key,
    label: key,
    valueType,
    type: Output.dynamic,
    ...extra
  });
  const codeNode = ({ id, inputs, source, outputs = [] }) => {
    const node = fixtureNode('code', id, { [I.code]: source });
    node.inputs = node.inputs.filter((input) => !input.canEdit).concat(inputs);
    node.outputs = node.outputs.filter((output) => output.type !== Output.dynamic).concat(outputs);
    return node;
  };
  const condition = ({ id, branches }) =>
    fixtureNode('condition', id, { [I.ifElseList]: branches });
  const comparison = (key, value) => ({
    variable: [GLOBAL, key],
    condition: 'lessThan',
    value: String(value),
    valueType: 'input'
  });

  result['basic-dataflow'] = chain(
    start(),
    fixtureNode('text', 'Compose', { [I.textareaInput]: 'V1:' + ref('Start', O.userChatInput) }),
    update('Remember', [
      {
        variable: [GLOBAL, 'a'],
        value: ['Compose', O.text],
        valueType: V.string,
        renderType: Input.reference
      }
    ]),
    answer('Reply', 'a=' + ref(GLOBAL, 'a') + '|node=' + ref('Compose', O.text))
  );
  const source = fixtureNode('text', 'Source', { [I.textareaInput]: 'SOURCE' });
  source.outputs.find((output) => output.key === O.text).id = 'source-output-id';
  result['basic-parameters'] = chain(
    start(),
    source,
    codeNode({
      id: 'Probe',
      inputs: [
        customInput({ key: 'literal', value: 'LITERAL' }),
        customInput({ key: 'question', value: ['Start', O.userChatInput], reference: true }),
        customInput({ key: 'source', value: ['Source', 'source-output-id'], reference: true }),
        customInput({ key: 'mixed', value: 'q=' + ref('Start', O.userChatInput) + '|a={{a}}' }),
        customInput({ key: 'num', value: '7', valueType: V.number }),
        customInput({ key: 'flag', value: false, valueType: V.boolean }),
        customInput({ key: 'obj', value: '{"items":[1,2]}', valueType: V.object }),
        customInput({ key: 'arr', value: [0, false, ''], valueType: V.arrayAny }),
        customInput({ key: 'pair', value: ['left', 'right'], valueType: V.arrayString }),
        customInput({
          key: 'refs',
          value: [
            ['Start', O.userChatInput],
            ['Source', 'source-output-id']
          ],
          valueType: V.arrayString,
          reference: true
        })
      ],
      source:
        'function main(inputs) { console.log("FG-TEST parameter probe"); return { result: inputs }; }',
      outputs: [customOutput({ key: 'result', id: 'probe-result-id', valueType: V.object })]
    }),
    answer('Reply', ref('Probe', 'probe-result-id'))
  );
  const echo = fixtureNode('http', 'Echo', {
    [I.httpReqUrl]: '__GATE_URL__/echo',
    [I.httpMethod]: 'POST',
    [I.httpHeaders]: [{ key: 'x-fg-test', type: 'string', value: ref('Start', O.userChatInput) }],
    [I.httpParams]: [{ key: 'runId', type: 'string', value: ref('Start', O.userChatInput) }],
    [I.httpJsonBody]:
      '{"runId":"' +
      ref('Start', O.userChatInput) +
      '","text":"{{text}}","n":{{n}},"obj":{{obj}},"arr":[0,false,""]}'
  });
  echo.outputs.push(
    customOutput({ key: 'body.text', id: 'echo-text' }),
    customOutput({ key: 'body.n', id: 'echo-number', valueType: V.number }),
    customOutput({ key: 'body.obj', id: 'echo-object', valueType: V.object }),
    customOutput({ key: 'body.arr', id: 'echo-array', valueType: V.arrayAny }),
    customOutput({ key: '$.body.arr[*]', id: 'echo-wildcard', valueType: V.arrayAny }),
    customOutput({ key: 'absent', id: 'fallback', required: true, defaultValue: 'FALLBACK' }),
    customOutput({
      key: 'optional',
      id: 'optional',
      required: false,
      defaultValue: 'MUST-NOT-FILL'
    }),
    customOutput({
      key: 'nil',
      id: 'nil',
      valueType: V.any,
      required: true,
      defaultValue: 'MUST-NOT-FILL'
    }),
    customOutput({ key: 'zero', id: 'zero', valueType: V.number, required: true, defaultValue: 9 }),
    customOutput({
      key: 'flag',
      id: 'flag',
      valueType: V.boolean,
      required: true,
      defaultValue: true
    }),
    customOutput({ key: 'empty', id: 'empty', required: true, defaultValue: 'MUST-NOT-FILL' })
  );
  const echoProbe = codeNode({
    id: 'Observe',
    inputs: [
      customInput({
        key: 'raw',
        value: ['Echo', O.httpRawResponse],
        valueType: V.object,
        reference: true
      }),
      ...echo.outputs
        .filter((output) => output.type === Output.dynamic)
        .map((output) =>
          customInput({
            key: output.id,
            value: ['Echo', output.id],
            valueType: output.valueType,
            reference: true
          })
        )
    ],
    source: 'function main(inputs) { return { observed: inputs }; }',
    outputs: [customOutput({ key: 'observed', valueType: V.object })]
  });
  result['basic-http'] = chain(
    start(),
    echo,
    echoProbe,
    answer('Reply', ref('Observe', 'observed'))
  );
  result['basic-fan-in'] = graph(
    [
      start(),
      http('Fast', '/fast'),
      http('Slow', '/slow'),
      fixtureNode('text', 'FastValue', { [I.textareaInput]: 'FAST' }),
      fixtureNode('text', 'SlowValue', { [I.textareaInput]: 'SLOW' }),
      http('Merge', '/count'),
      answer('Reply', ref('FastValue', O.text) + '|' + ref('SlowValue', O.text)),
      http('Unreachable', '/count')
    ],
    [
      fixtureEdge('Start', 'Fast'),
      fixtureEdge('Start', 'Slow'),
      fixtureEdge('Fast', 'FastValue'),
      fixtureEdge('Slow', 'SlowValue'),
      fixtureEdge('FastValue', 'Merge'),
      fixtureEdge('SlowValue', 'Merge'),
      fixtureEdge('Merge', 'Reply')
    ]
  );
  // 两个 gate 独立放行，不能一次 release 同时释放两个分支而掩盖汇合等待错误。
  for (const id of ['Fast', 'Slow']) {
    result['basic-fan-in'].nodes
      .find((node) => node.nodeId === id)
      .inputs.find((input) => input.key === I.httpJsonBody).value = JSON.stringify({
      runId: ref('Start', O.userChatInput) + '-' + id,
      node: id
    });
  }
  result['basic-branch'] = graph(
    [
      start(),
      condition({
        id: 'Choose',
        branches: [
          { branchId: 'low', condition: 'AND', list: [comparison('n', 10)] },
          { branchId: 'mid', condition: 'AND', list: [comparison('n', 20)] }
        ]
      }),
      condition({
        id: 'Nested',
        branches: [
          {
            branchId: 'yes',
            condition: 'AND',
            list: [
              {
                variable: [GLOBAL, 'flag'],
                condition: 'equalTo',
                value: 'true',
                valueType: 'input'
              }
            ]
          }
        ]
      }),
      ...['LowTrue', 'LowFalse', 'Mid', 'High', 'Merge', 'Unreachable'].map((id) =>
        http(id, '/count')
      ),
      answer('Reply', 'BRANCH:' + ref('Choose', O.ifElseResult))
    ],
    [
      fixtureEdge('Start', 'Choose'),
      fixtureEdge('Choose', 'Nested', 'low'),
      fixtureEdge('Choose', 'Mid', 'mid'),
      fixtureEdge('Choose', 'High', 'ELSE'),
      fixtureEdge('Nested', 'LowTrue', 'yes'),
      fixtureEdge('Nested', 'LowFalse', 'ELSE'),
      ...['LowTrue', 'LowFalse', 'Mid', 'High'].map((id) => fixtureEdge(id, 'Merge')),
      fixtureEdge('Merge', 'Reply')
    ]
  );
  const count = http('Count', '/count');
  count.inputs.find((input) => input.key === I.httpJsonBody).value =
    '{"runId":"' + ref('Start', O.userChatInput) + '","node":"Count","n":{{n}}}';
  result['basic-cycle'] = graph(
    [
      start(),
      update('Increment', [{ ...assignment('n', 1, V.number), numberOperator: '+' }]),
      count,
      condition({
        id: 'Continue',
        branches: [{ branchId: 'again', condition: 'AND', list: [comparison('n', 3)] }]
      }),
      answer('Reply', 'DONE:' + ref(GLOBAL, 'n'))
    ],
    [
      fixtureEdge('Start', 'Increment'),
      fixtureEdge('Increment', 'Count'),
      fixtureEdge('Count', 'Continue'),
      fixtureEdge('Continue', 'Increment', 'again'),
      fixtureEdge('Continue', 'Reply', 'ELSE')
    ]
  );
  result['basic-cycle'].chatConfig.variables.find((variable) => variable.key === 'n').defaultValue =
    0;
  result['basic-model-chain'] = chain(
    start(),
    fixtureNode('text', 'Prompt', {
      [I.textareaInput]: 'QUESTION:' + ref('Start', O.userChatInput)
    }),
    fixtureNode('llm', 'Model', {
      [I.aiModelId]: '__MODEL_ID__',
      [I.aiSystemPrompt]: 'Return the marker FG-TEST-MODEL and preserve the current question.',
      [I.userChatInput]: ['Prompt', O.text],
      [I.history]: 0,
      [I.aiChatIsResponseText]: false
    }),
    answer('Reply', 'FINAL:' + ref('Model', O.answerText))
  );
  const search = fixtureNode('dataset', 'Search', {
    [I.datasetSelectList]: [{ datasetId: '__DATASET_ID__' }],
    [I.userChatInput]: ['Start', O.userChatInput],
    [I.datasetSearchMode]: 'fullTextRecall',
    [I.datasetSearchUsingReRank]: false,
    [I.datasetSearchUsingExtensionQuery]: false
  });
  result['basic-dataset-chain'] = clone(result['basic-model-chain']);
  result['basic-dataset-chain'].nodes[1] = search;
  const searchModel = result['basic-dataset-chain'].nodes.find((node) => node.nodeId === 'Model');
  searchModel.inputs.find((input) => input.key === I.userChatInput).value = [
    'Start',
    O.userChatInput
  ];
  searchModel.inputs.find((input) => input.key === I.aiChatDatasetQuote).value = [
    'Search',
    O.datasetQuoteQA
  ];
  result['basic-dataset-chain'].edges = [
    fixtureEdge('Start', 'Search'),
    fixtureEdge('Search', 'Model'),
    fixtureEdge('Model', 'Reply')
  ];
  const pluginInputs = [
    customInput({ key: 'label', defaultValue: 'TOOL-DEFAULT', required: false }),
    customInput({ key: 'amount', valueType: V.number, defaultValue: 8, required: false }),
    customInput({ key: 'enabled', valueType: V.boolean, defaultValue: true, required: false })
  ];
  result['basic-tool-child'] = chain(
    fixtureNode(
      'pluginInput',
      'Input',
      {},
      {
        inputs: pluginInputs,
        outputs: pluginInputs.map((input) =>
          customOutput({ key: input.key, valueType: input.valueType })
        )
      }
    ),
    fixtureNode(
      'pluginOutput',
      'Output',
      {},
      {
        inputs: pluginInputs.map((input) =>
          customInput({
            key: input.key,
            value: ['Input', input.key],
            valueType: input.valueType,
            reference: true
          })
        )
      }
    )
  );
  result['basic-tool-parent'] = chain(
    start(),
    fixtureNode(
      'plugin',
      'Tool',
      {},
      {
        pluginId: '__CHILD_TOOL_ID__',
        inputs: [
          customInput({ key: 'label', value: ['Start', O.userChatInput], reference: true }),
          customInput({ key: 'amount', value: 0, valueType: V.number }),
          customInput({ key: 'enabled', value: false, valueType: V.boolean })
        ],
        outputs: [
          customOutput({ key: 'label', id: 'label-id' }),
          customOutput({ key: 'amount', valueType: V.number }),
          customOutput({ key: 'enabled', valueType: V.boolean })
        ]
      }
    ),
    answer(
      'Reply',
      'TOOL:' + ref('Tool', 'label-id') + '|' + ref('Tool', 'amount') + '|' + ref('Tool', 'enabled')
    )
  );
  result['basic-interactive'] = graph(
    [
      start(),
      http('Once', '/count'),
      fixtureNode('select', 'Select', {
        [I.description]: 'FG-TEST select',
        [I.userSelectOptions]: [
          { key: 'a', value: 'A' },
          { key: 'b', value: 'B' }
        ]
      }),
      answer('SelectedA', 'SELECTED:A'),
      answer('SelectedB', 'SELECTED:B'),
      fixtureNode('form', 'Form', {
        [I.userInputForms]: [
          {
            key: 'name',
            label: 'name',
            type: Input.input,
            value: '',
            valueType: V.string,
            required: true
          },
          {
            key: 'count',
            label: 'count',
            type: Input.numberInput,
            value: 0,
            valueType: V.number,
            required: true
          }
        ]
      }),
      answer('Reply', 'FORM:' + ref('Form', O.formInputResult))
    ],
    [
      fixtureEdge('Start', 'Once'),
      fixtureEdge('Once', 'Select'),
      fixtureEdge('Select', 'SelectedA', 'a'),
      fixtureEdge('Select', 'SelectedB', 'b'),
      fixtureEdge('SelectedA', 'Form'),
      fixtureEdge('SelectedB', 'Form'),
      fixtureEdge('Form', 'Reply')
    ]
  );
  return result;
}

/** 静态检查只证明 JSON 合法与引用闭合，不冒充真实节点执行或资源鉴权通过。 */
export function validateFixture(value) {
  const ids = new Set(value.nodes.map((node) => node.nodeId));
  assert.equal(ids.size, value.nodes.length, '节点 ID 不得重复');
  for (const node of value.nodes) StoreNodeItemTypeSchema.parse(node);
  for (const edge of value.edges) {
    StoreEdgeItemTypeSchema.parse(edge);
    assert.ok(ids.has(edge.source) && ids.has(edge.target), '连线端点必须存在');
  }
  return { nodes: value.nodes.length, edges: value.edges.length };
}

if (process.argv[1] && (await realpath(process.argv[1])) === fileURLToPath(import.meta.url)) {
  const fixtures = buildWorkflowFixtures();
  if (process.argv.includes('--patch')) {
    const lines = ['*** Begin Patch'];
    for (const [name, graph] of Object.entries(fixtures)) {
      validateFixture(graph);
      lines.push(
        '*** Add File: ' + repo + '.agents/test/app/workflow/execution/fixtures/' + name + '.json'
      );
      lines.push(
        ...(JSON.stringify(graph, null, 2) + '\n')
          .trimEnd()
          .split('\n')
          .map((line) => '+' + line)
      );
    }
    lines.push('*** End Patch');
    process.stdout.write(lines.join('\n'));
  } else {
    const results = [];
    for (const [name, graph] of Object.entries(fixtures)) {
      validateFixture(graph);
      const stored = JSON.parse(
        await readFile(new URL('./fixtures/' + name + '.json', import.meta.url), 'utf8')
      );
      assert.deepEqual(stored, graph, name + ' 需要重新生成');
      results.push({ name, ...validateFixture(stored) });
    }
    console.log(JSON.stringify({ fixtures: results, validation: 'static-only' }, null, 2));
  }
}
