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
export function fixtureNode({ kind, id, values = {}, extra = {} }) {
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
export const fixtureEdge = ({ source, target, handle = 'right' }) => ({
  source,
  target,
  sourceHandle: handle === O.selectedTools ? O.selectedTools : `${source}-source-${handle}`,
  targetHandle: handle === O.selectedTools ? O.selectedTools : `${target}-target-left`
});
const ref = (node, key) => `{{$${node}.${key}$}}`;
const valueConfig = ({ key, valueType, defaultValue }) => ({
  key,
  label: key,
  description: '',
  type: 'input',
  valueType,
  defaultValue,
  required: false
});
const variables = [
  valueConfig({ key: 'a', valueType: V.string, defaultValue: 'A0' }),
  valueConfig({ key: 'b', valueType: V.string, defaultValue: 'B0' }),
  valueConfig({ key: 'stamp', valueType: V.string, defaultValue: 'S0' }),
  valueConfig({ key: 'n', valueType: V.number, defaultValue: 9 }),
  valueConfig({ key: 'flag', valueType: V.boolean, defaultValue: true }),
  valueConfig({ key: 'text', valueType: V.string, defaultValue: 'seed' }),
  valueConfig({ key: 'obj', valueType: V.object, defaultValue: { items: [1] } })
];
const assignment = ({ key, value, valueType = V.string }) => ({
  variable: [GLOBAL, key],
  value: ['', value],
  valueType,
  renderType: Input.input
});
const answer = (id, text) => fixtureNode({ kind: 'answer', id, values: { [I.answerText]: text } });
const update = (id, items) =>
  fixtureNode({ kind: 'update', id, values: { [I.updateList]: items } });
const http = (id, path) =>
  fixtureNode({
    kind: 'http',
    id,
    values: {
      [I.httpReqUrl]: '__GATE_URL__' + path,
      [I.httpTimeout]: 100,
      [I.httpJsonBody]: JSON.stringify({ runId: ref('Start', O.userChatInput), node: id })
    }
  });
const graph = ({ nodes, edges, chatConfig = { variables } }) => ({
  nodes: nodes.map((node, index) => ({
    ...node,
    position: { x: index * 300, y: node.parentNodeId ? 300 : 0 }
  })),
  edges,
  chatConfig: clone(chatConfig)
});
const chain = (...nodes) =>
  graph({
    nodes,
    edges: nodes
      .slice(1)
      .map((node, index) => fixtureEdge({ source: nodes[index].nodeId, target: node.nodeId }))
  });
const start = () => fixtureNode({ kind: 'start', id: 'Start' });
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
      assignment({ key: 'n', value: 0, valueType: V.number }),
      assignment({ key: 'flag', value: false, valueType: V.boolean }),
      assignment({ key: 'text', value: '', valueType: V.string }),
      assignment({ key: 'obj', value: { items: [1, 2] }, valueType: V.object })
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
      assignment({ key: 'files', value: ['__FILE_URL__'], valueType: V.arrayString }),
      assignment({ key: 'password', value: 'FG-TEST-after' })
    );
  result['input-precedence'] = chain(start(), readVariables());
  result['stream-lifecycle'] = chain(
    start(),
    answer('Prefix', 'PREFIX:' + ref('Start', O.userChatInput)),
    http('Gate', '/wait'),
    answer('Tail', 'TAIL:' + ref('Start', O.userChatInput))
  );
  result['error-routing'] = graph({
    nodes: [
      start(),
      { ...http('Fail', '/fail'), catchError: true },
      answer('Normal', 'MUST-NOT-RUN'),
      answer('Caught', 'CAUGHT:' + ref('Fail', O.error))
    ],
    edges: [
      fixtureEdge({ source: 'Start', target: 'Fail' }),
      fixtureEdge({ source: 'Fail', target: 'Normal' }),
      fixtureEdge({ source: 'Fail', target: 'Caught', handle: 'catch-right' })
    ]
  });
  // 错误 handle 的分隔符与普通 handle 不同，使用生产错误端口。
  result['error-routing'].edges[2].sourceHandle = 'Fail-source_catch-right';
  result['child-leaf'] = chain(
    start(),
    fixtureNode({
      kind: 'text',
      id: 'ChildInput',
      values: { [I.textareaInput]: ref(GLOBAL, 'a') }
    }),
    update('ChildUpdate', [assignment({ key: 'a', value: 'child-output' })]),
    answer('ChildReply', 'CHILD:' + ref(GLOBAL, 'a'))
  );
  const child = fixtureNode({
    kind: 'app',
    id: 'Child',
    values: {
      [I.userChatInput]: ref('Start', O.userChatInput),
      a: 'child-input',
      [I.forbidStream]: true
    },
    extra: {
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
  });
  result['child-parent'] = chain(
    start(),
    child,
    answer('ParentReply', 'PARENT:' + ref(GLOBAL, 'a') + '|' + ref('Child', O.answerText))
  );
  const form = fixtureNode({
    kind: 'form',
    id: 'Form',
    values: {
      [I.userInputForms]: [
        { key: 'value', label: 'value', type: 'input', valueType: V.string, required: true }
      ]
    }
  });
  result['interactive-checkpoint'] = chain(
    start(),
    http('Once', '/count'),
    update('Checkpoint', [assignment({ key: 'a', value: 'checkpoint' })]),
    form,
    answer('Resumed', ref('Form', O.formInputResult))
  );
  for (const kind of ['loop', 'parallel']) {
    const container = fixtureNode({
      kind,
      id: 'Container',
      values: {
        [kind === 'loop' ? I.loopRunInputArray : I.nestedInputArray]: [0, false, ''],
        [I.childrenNodeIdList]: ['BodyStart', 'BodyUpdate', 'BodyEnd'],
        ...(kind === 'parallel'
          ? { [I.parallelRunMaxConcurrency]: 2, [I.parallelRunMaxRetryTimes]: 0 }
          : {})
      }
    });
    const bodyStart = fixtureNode({
      kind: kind === 'loop' ? 'loopStart' : 'nestedStart',
      id: 'BodyStart',
      extra: { parentNodeId: 'Container' }
    });
    if (kind === 'parallel')
      bodyStart.outputs.push({
        id: O.nestedStartInput,
        key: O.nestedStartInput,
        label: 'Current item',
        type: Output.static,
        valueType: V.any
      });
    const bodyUpdate = {
      ...update('BodyUpdate', [assignment({ key: 'a', value: 'body-complete' })]),
      parentNodeId: 'Container'
    };
    const bodyEnd = fixtureNode({
      kind: 'nestedEnd',
      id: 'BodyEnd',
      extra: { parentNodeId: 'Container' }
    });
    bodyEnd.inputs.find((item) => item.key === I.nestedEndInput).value = [
      'BodyStart',
      kind === 'loop' ? O.currentItem : O.nestedStartInput
    ];
    result[kind + '-container'] = graph({
      nodes: [start(), container, bodyStart, bodyUpdate, bodyEnd, readVariables()],
      edges: [
        fixtureEdge({ source: 'Start', target: 'Container' }),
        fixtureEdge({ source: 'Container', target: 'ReadVariables' }),
        fixtureEdge({ source: 'BodyStart', target: 'BodyUpdate' }),
        fixtureEdge({ source: 'BodyUpdate', target: 'BodyEnd' })
      ]
    });
  }
  result['loop-break'] = clone(result['loop-container']);
  const breaking = result['loop-break'];
  breaking.nodes = breaking.nodes.filter(
    (node) => !['BodyUpdate', 'BodyEnd'].includes(node.nodeId)
  );
  breaking.nodes.push(
    fixtureNode({
      kind: 'loopBreak',
      id: 'Break',
      extra: { parentNodeId: 'Container' }
    })
  );
  breaking.nodes
    .find((node) => node.nodeId === 'Container')
    .inputs.find((input) => input.key === I.childrenNodeIdList).value = ['BodyStart', 'Break'];
  breaking.edges = breaking.edges.filter(
    (edge) =>
      !['BodyUpdate', 'BodyEnd'].includes(edge.source) &&
      !['BodyUpdate', 'BodyEnd'].includes(edge.target)
  );
  breaking.edges.push(fixtureEdge({ source: 'BodyStart', target: 'Break' }));
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
  checkpoint.edges.push(
    fixtureEdge({ source: 'BodyUpdate', target: 'Form' }),
    fixtureEdge({ source: 'Form', target: 'BodyEnd' })
  );
  result['parallel-retry'] = clone(result['parallel-container']);
  const retry = result['parallel-retry'];
  const parallel = retry.nodes.find((node) => node.nodeId === 'Container');
  parallel.inputs.find((item) => item.key === I.nestedInputArray).value = ['retry', 'sibling'];
  parallel.inputs.find((item) => item.key === I.parallelRunMaxRetryTimes).value = 1;
  retry.nodes = retry.nodes.filter((node) => node.nodeId !== 'BodyUpdate');
  const retryChildren = [
    fixtureNode({
      kind: 'condition',
      id: 'TaskBranch',
      values: {
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
      }
    }),
    update('FailedWrite', [assignment({ key: 'a', value: 'failed' })]),
    http('Attempt', '/attempt'),
    update('SuccessWrite', [assignment({ key: 'a', value: 'retry-ok' })]),
    update('SiblingWrite', [assignment({ key: 'b', value: 'B1' })])
  ].map((node) => ({ ...node, parentNodeId: 'Container' }));
  retry.nodes.push(...retryChildren);
  parallel.inputs.find((item) => item.key === I.childrenNodeIdList).value = [
    'BodyStart',
    ...retryChildren.map((node) => node.nodeId),
    'BodyEnd'
  ];
  retry.edges = retry.edges.filter((edge) => !['BodyStart', 'BodyUpdate'].includes(edge.source));
  retry.edges.push(
    fixtureEdge({ source: 'BodyStart', target: 'TaskBranch' }),
    fixtureEdge({ source: 'TaskBranch', target: 'FailedWrite', handle: 'first' }),
    fixtureEdge({ source: 'FailedWrite', target: 'Attempt' }),
    fixtureEdge({ source: 'Attempt', target: 'SuccessWrite' }),
    fixtureEdge({ source: 'SuccessWrite', target: 'BodyEnd' }),
    fixtureEdge({ source: 'TaskBranch', target: 'SiblingWrite', handle: 'ELSE' }),
    fixtureEdge({ source: 'SiblingWrite', target: 'BodyEnd' })
  );
  result['file-reader'] = chain(
    start(),
    fixtureNode({ kind: 'files', id: 'Files', values: { [I.fileUrlList]: ['__FILE_URL__'] } }),
    answer('FileReply', ref('Files', O.text))
  );
  result['file-form'] = chain(
    start(),
    fixtureNode({
      kind: 'form',
      id: 'FileForm',
      values: {
        [I.userInputForms]: [
          { key: 'first', label: 'first', type: 'fileSelect', required: true, maxFiles: 2 },
          { key: 'second', label: 'second', type: 'fileSelect', required: true, maxFiles: 2 }
        ]
      }
    }),
    answer('FileResult', ref('FileForm', O.formInputResult))
  );
  result['tool-concurrent'] = graph({
    nodes: [
      start(),
      fixtureNode({
        kind: 'tool',
        id: 'Tools',
        values: {
          [I.aiModelId]: '__MODEL_ID__',
          [I.userChatInput]: ref('Start', O.userChatInput)
        }
      }),
      fixtureNode({
        kind: 'toolParams',
        id: 'Slow',
        extra: { intro: 'slow deterministic tool' }
      }),
      fixtureNode({
        kind: 'toolParams',
        id: 'Fast',
        extra: { intro: 'fast deterministic tool' }
      }),
      http('SlowGate', '/slow'),
      http('FastGate', '/fast'),
      update('SlowUpdate', [
        assignment({ key: 'a', value: 'A1' }),
        assignment({ key: 'stamp', value: 'slow' })
      ]),
      update('FastUpdate', [
        assignment({ key: 'b', value: 'B1' }),
        assignment({ key: 'stamp', value: 'fast' })
      ]),
      readVariables()
    ],
    edges: [
      fixtureEdge({ source: 'Start', target: 'Tools' }),
      fixtureEdge({ source: 'Tools', target: 'Slow', handle: O.selectedTools }),
      fixtureEdge({ source: 'Tools', target: 'Fast', handle: O.selectedTools }),
      fixtureEdge({ source: 'Slow', target: 'SlowGate' }),
      fixtureEdge({ source: 'Fast', target: 'FastGate' }),
      fixtureEdge({ source: 'SlowGate', target: 'SlowUpdate' }),
      fixtureEdge({ source: 'FastGate', target: 'FastUpdate' }),
      fixtureEdge({ source: 'Tools', target: 'ReadVariables' })
    ]
  });
  result['agent-child'] = chain(
    start(),
    fixtureNode({
      kind: 'agent',
      id: 'Agent',
      values: {
        [I.aiModelId]: '__MODEL_ID__',
        [I.userChatInput]: ref('Start', O.userChatInput),
        [I.datasetSearchUsingExtensionQuery]: true,
        [I.selectedTools]: [{ toolId: '__CHILD_APP_ID__' }]
      }
    })
  );
  result['model-resource'] = chain(
    start(),
    fixtureNode({
      kind: 'llm',
      id: 'Model',
      values: {
        [I.aiModelId]: '__MODEL_ID__',
        [I.userChatInput]: ref('Start', O.userChatInput)
      }
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
    const node = fixtureNode({ kind: 'code', id, values: { [I.code]: source } });
    node.inputs = node.inputs.filter((input) => !input.canEdit).concat(inputs);
    node.outputs = node.outputs.filter((output) => output.type !== Output.dynamic).concat(outputs);
    return node;
  };
  const condition = ({ id, branches }) =>
    fixtureNode({ kind: 'condition', id, values: { [I.ifElseList]: branches } });
  const comparison = (key, value) => ({
    variable: [GLOBAL, key],
    condition: 'lessThan',
    value: String(value),
    valueType: 'input'
  });

  result['basic-dataflow'] = chain(
    start(),
    fixtureNode({
      kind: 'text',
      id: 'Compose',
      values: { [I.textareaInput]: 'V1:' + ref('Start', O.userChatInput) }
    }),
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
  const source = fixtureNode({
    kind: 'text',
    id: 'Source',
    values: { [I.textareaInput]: 'SOURCE' }
  });
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
  const echo = fixtureNode({
    kind: 'http',
    id: 'Echo',
    values: {
      [I.httpReqUrl]: '__GATE_URL__/echo',
      [I.httpMethod]: 'POST',
      [I.httpHeaders]: [{ key: 'x-fg-test', type: 'string', value: ref('Start', O.userChatInput) }],
      [I.httpParams]: [{ key: 'runId', type: 'string', value: ref('Start', O.userChatInput) }],
      [I.httpJsonBody]:
        '{"runId":"' +
        ref('Start', O.userChatInput) +
        '","text":"{{text}}","n":{{n}},"obj":{{obj}},"arr":[0,false,""]}'
    }
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
  result['basic-fan-in'] = graph({
    nodes: [
      start(),
      http('Fast', '/fast'),
      http('Slow', '/slow'),
      fixtureNode({ kind: 'text', id: 'FastValue', values: { [I.textareaInput]: 'FAST' } }),
      fixtureNode({ kind: 'text', id: 'SlowValue', values: { [I.textareaInput]: 'SLOW' } }),
      http('Merge', '/count'),
      answer('Reply', ref('FastValue', O.text) + '|' + ref('SlowValue', O.text)),
      http('Unreachable', '/count')
    ],
    edges: [
      fixtureEdge({ source: 'Start', target: 'Fast' }),
      fixtureEdge({ source: 'Start', target: 'Slow' }),
      fixtureEdge({ source: 'Fast', target: 'FastValue' }),
      fixtureEdge({ source: 'Slow', target: 'SlowValue' }),
      fixtureEdge({ source: 'FastValue', target: 'Merge' }),
      fixtureEdge({ source: 'SlowValue', target: 'Merge' }),
      fixtureEdge({ source: 'Merge', target: 'Reply' })
    ]
  });
  // 两个 gate 独立放行，不能一次 release 同时释放两个分支而掩盖汇合等待错误。
  for (const id of ['Fast', 'Slow']) {
    result['basic-fan-in'].nodes
      .find((node) => node.nodeId === id)
      .inputs.find((input) => input.key === I.httpJsonBody).value = JSON.stringify({
      runId: ref('Start', O.userChatInput) + '-' + id,
      node: id
    });
  }
  result['basic-branch'] = graph({
    nodes: [
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
    edges: [
      fixtureEdge({ source: 'Start', target: 'Choose' }),
      fixtureEdge({ source: 'Choose', target: 'Nested', handle: 'low' }),
      fixtureEdge({ source: 'Choose', target: 'Mid', handle: 'mid' }),
      fixtureEdge({ source: 'Choose', target: 'High', handle: 'ELSE' }),
      fixtureEdge({ source: 'Nested', target: 'LowTrue', handle: 'yes' }),
      fixtureEdge({ source: 'Nested', target: 'LowFalse', handle: 'ELSE' }),
      ...['LowTrue', 'LowFalse', 'Mid', 'High'].map((id) =>
        fixtureEdge({ source: id, target: 'Merge' })
      ),
      fixtureEdge({ source: 'Merge', target: 'Reply' })
    ]
  });
  const count = http('Count', '/count');
  count.inputs.find((input) => input.key === I.httpJsonBody).value =
    '{"runId":"' + ref('Start', O.userChatInput) + '","node":"Count","n":{{n}}}';
  result['basic-cycle'] = graph({
    nodes: [
      start(),
      update('Increment', [
        { ...assignment({ key: 'n', value: 1, valueType: V.number }), numberOperator: '+' }
      ]),
      count,
      condition({
        id: 'Continue',
        branches: [{ branchId: 'again', condition: 'AND', list: [comparison('n', 3)] }]
      }),
      answer('Reply', 'DONE:' + ref(GLOBAL, 'n'))
    ],
    edges: [
      fixtureEdge({ source: 'Start', target: 'Increment' }),
      fixtureEdge({ source: 'Increment', target: 'Count' }),
      fixtureEdge({ source: 'Count', target: 'Continue' }),
      fixtureEdge({ source: 'Continue', target: 'Increment', handle: 'again' }),
      fixtureEdge({ source: 'Continue', target: 'Reply', handle: 'ELSE' })
    ]
  });
  result['basic-cycle'].chatConfig.variables.find((variable) => variable.key === 'n').defaultValue =
    0;
  result['basic-model-chain'] = chain(
    start(),
    fixtureNode({
      kind: 'text',
      id: 'Prompt',
      values: {
        [I.textareaInput]: 'QUESTION:' + ref('Start', O.userChatInput)
      }
    }),
    fixtureNode({
      kind: 'llm',
      id: 'Model',
      values: {
        [I.aiModelId]: '__MODEL_ID__',
        [I.aiSystemPrompt]: 'Return the marker FG-TEST-MODEL and preserve the current question.',
        [I.userChatInput]: ['Prompt', O.text],
        [I.history]: 0,
        [I.aiChatIsResponseText]: false
      }
    }),
    answer('Reply', 'FINAL:' + ref('Model', O.answerText))
  );
  const search = fixtureNode({
    kind: 'dataset',
    id: 'Search',
    values: {
      [I.datasetSelectList]: [{ datasetId: '__DATASET_ID__' }],
      [I.userChatInput]: ['Start', O.userChatInput],
      [I.datasetSearchMode]: 'fullTextRecall',
      [I.datasetSearchUsingReRank]: false,
      [I.datasetSearchUsingExtensionQuery]: false
    }
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
    fixtureEdge({ source: 'Start', target: 'Search' }),
    fixtureEdge({ source: 'Search', target: 'Model' }),
    fixtureEdge({ source: 'Model', target: 'Reply' })
  ];
  const pluginInputs = [
    customInput({ key: 'label', defaultValue: 'TOOL-DEFAULT', required: false }),
    customInput({ key: 'amount', valueType: V.number, defaultValue: 8, required: false }),
    customInput({ key: 'enabled', valueType: V.boolean, defaultValue: true, required: false })
  ];
  result['basic-tool-child'] = chain(
    fixtureNode({
      kind: 'pluginInput',
      id: 'Input',
      extra: {
        inputs: pluginInputs,
        outputs: pluginInputs.map((input) =>
          customOutput({ key: input.key, valueType: input.valueType })
        )
      }
    }),
    fixtureNode({
      kind: 'pluginOutput',
      id: 'Output',
      extra: {
        inputs: pluginInputs.map((input) =>
          customInput({
            key: input.key,
            value: ['Input', input.key],
            valueType: input.valueType,
            reference: true
          })
        )
      }
    })
  );
  result['basic-tool-parent'] = chain(
    start(),
    fixtureNode({
      kind: 'plugin',
      id: 'Tool',
      extra: {
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
    }),
    answer(
      'Reply',
      'TOOL:' + ref('Tool', 'label-id') + '|' + ref('Tool', 'amount') + '|' + ref('Tool', 'enabled')
    )
  );
  result['basic-interactive'] = graph({
    nodes: [
      start(),
      http('Once', '/count'),
      fixtureNode({
        kind: 'select',
        id: 'Select',
        values: {
          [I.description]: 'FG-TEST select',
          [I.userSelectOptions]: [
            { key: 'a', value: 'A' },
            { key: 'b', value: 'B' }
          ]
        }
      }),
      answer('SelectedA', 'SELECTED:A'),
      answer('SelectedB', 'SELECTED:B'),
      fixtureNode({
        kind: 'form',
        id: 'Form',
        values: {
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
        }
      }),
      answer('Reply', 'FORM:' + ref('Form', O.formInputResult))
    ],
    edges: [
      fixtureEdge({ source: 'Start', target: 'Once' }),
      fixtureEdge({ source: 'Once', target: 'Select' }),
      fixtureEdge({ source: 'Select', target: 'SelectedA', handle: 'a' }),
      fixtureEdge({ source: 'Select', target: 'SelectedB', handle: 'b' }),
      fixtureEdge({ source: 'SelectedA', target: 'Form' }),
      fixtureEdge({ source: 'SelectedB', target: 'Form' }),
      fixtureEdge({ source: 'Form', target: 'Reply' })
    ]
  });
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
