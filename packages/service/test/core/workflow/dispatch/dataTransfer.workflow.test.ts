import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  ParallelRunStatusEnum,
  WorkflowIOValueTypeEnum,
  VARIABLE_NODE_ID
} from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum,
  LoopRunModeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { VariableConditionEnum } from '@fastgpt/global/core/workflow/template/system/ifElse/constant';
import { codeSandbox } from '@fastgpt/service/thirdProvider/codeSandbox';
import { UserConfigError } from '@fastgpt/global/common/error/utils';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import {
  graphNode,
  graphEdge,
  graphReference,
  graphValues,
  runGraph
} from './testUtils/workflowGraph';

const { axiosMock } = vi.hoisted(() => ({ axiosMock: vi.fn() }));
vi.mock('@fastgpt/service/common/api/axios', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/common/api/axios')>()),
  axios: axiosMock
}));
vi.mock('@fastgpt/service/common/system/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/common/system/utils')>()),
  isInternalAddress: vi.fn(async () => false)
}));
vi.mock('@fastgpt/service/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/env')>();
  return {
    ...actual,
    serviceEnv: {
      ...actual.serviceEnv,
      CODE_SANDBOX_URL: 'http://sandbox.test',
      WORKFLOW_MAX_LOOP_TIMES: 10
    }
  };
});

vi.mock('@fastgpt/service/common/string/tiktoken/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/common/string/tiktoken/index')>()),
  countPromptTokensBatch: vi.fn(async (texts: string[]) => texts.map((text) => text.length))
}));

/** 构造真实消费者，输出值直接来自 Queue 解析后的引用参数。 */
const consumer = (id: string, references: Record<string, [string, string]>) =>
  graphNode({
    id,
    type: FlowNodeTypeEnum.toolParams,
    inputs: Object.entries(references).map(([key, from]) => graphReference({ key, from })),
    outputs: Object.keys(references)
  });

beforeEach(() => {
  axiosMock.mockReset();
  vi.spyOn(codeSandbox, 'runCode').mockImplementation(async ({ variables }) => ({
    codeReturn: variables,
    log: ''
  }));
});
afterEach(() => vi.restoreAllMocks());

// 这些场景直接运行完整生产调度，外部请求边界被替换；不覆盖 callbackMap，也不回放节点结果。
describe('workflow data transfer through real nodes', () => {
  it.each([
    0,
    false,
    '',
    null,
    undefined,
    [],
    {},
    { items: [0, false, '', null], error: 'business value' }
  ])('preserves %j through multiple hops and fan-out', async (value) => {
    const source = graphNode({
      id: 'source',
      type: FlowNodeTypeEnum.toolParams,
      params: { value },
      outputs: ['value'],
      isEntry: true
    });
    const middle = consumer('middle', { forwarded: ['source', 'value'] });
    const first = consumer('first', { value: ['middle', 'forwarded'] });
    const second = consumer('second', { value: ['source', 'value'] });
    const { result, responses } = await runGraph({
      nodes: [source, middle, first, second],
      edges: [
        graphEdge({ source: 'source', target: 'middle' }),
        graphEdge({ source: 'middle', target: 'first' }),
        graphEdge({ source: 'source', target: 'second' })
      ]
    });
    expect(graphValues(first).value).toEqual(value);
    expect(graphValues(second).value).toEqual(value);
    expect(responses.map((response) => response.nodeId)).toEqual(
      expect.arrayContaining(['source', 'middle', 'first', 'second'])
    );
    expect(result.workflowRuntimeSummary.errorCount).toBe(0);
    expect(Object.hasOwn(result, 'error')).toBe(false);
  });

  it.each([
    { value: '42', type: WorkflowIOValueTypeEnum.number, expected: 42 },
    { value: 0, type: WorkflowIOValueTypeEnum.string, expected: '0' },
    { value: 'false', type: WorkflowIOValueTypeEnum.boolean, expected: true },
    {
      value: '{"nested":[0,false]}',
      type: WorkflowIOValueTypeEnum.object,
      expected: { nested: [0, false] }
    }
  ])(
    'converts the referenced value using the consumer type: $type',
    async ({ value, type, expected }) => {
      const source = graphNode({
        id: 'source',
        type: FlowNodeTypeEnum.toolParams,
        params: { value },
        outputs: ['value'],
        isEntry: true
      });
      const target = graphNode({
        id: 'target',
        type: FlowNodeTypeEnum.toolParams,
        inputs: [graphReference({ key: 'value', from: ['source', 'value'], valueType: type })],
        outputs: ['value']
      });
      await runGraph({
        nodes: [source, target],
        edges: [graphEdge({ source: 'source', target: 'target' })]
      });
      expect(graphValues(target).value).toEqual(expected);
    }
  );

  it('collects reference arrays and interpolates text after a merge', async () => {
    const source = graphNode({
      id: 'source',
      type: FlowNodeTypeEnum.toolParams,
      params: { first: [0, false], second: [''], unused: undefined },
      outputs: ['first', 'second', 'unused'],
      isEntry: true
    });
    const target = graphNode({
      id: 'merge',
      type: FlowNodeTypeEnum.toolParams,
      inputs: [
        graphReference({
          key: 'values',
          from: [
            ['source', 'first'],
            ['source', 'second'],
            ['source', 'unused']
          ]
        })
      ],
      outputs: ['values']
    });
    const text = graphNode({
      id: 'text',
      type: FlowNodeTypeEnum.textEditor,
      params: { [NodeInputKeyEnum.textareaInput]: 'values={{$merge.values$}}' },
      outputs: [NodeOutputKeyEnum.text]
    });
    await runGraph({
      nodes: [source, target, text],
      edges: [
        graphEdge({ source: 'source', target: 'merge' }),
        graphEdge({ source: 'merge', target: 'text' })
      ]
    });
    expect(graphValues(target).values).toEqual([0, false, '']);
    expect(graphValues(text)[NodeOutputKeyEnum.text]).toContain('0');
    expect(graphValues(text)[NodeOutputKeyEnum.text]).toContain('false');
  });

  it('passes non-empty merged dataset quotes downstream without changing the input lists', async () => {
    const shared = { id: 'shared', q: 'shared question', a: 'shared answer', score: [] };
    const first = [shared, { id: 'first', q: 'first question', a: 'first answer', score: [] }];
    const second = [shared, { id: 'second', q: 'second question', a: 'second answer', score: [] }];
    const before = structuredClone([first, second]);
    const source = graphNode({
      id: 'source',
      type: FlowNodeTypeEnum.toolParams,
      params: { first, second },
      outputs: ['first', 'second'],
      isEntry: true
    });
    const concat = graphNode({
      id: 'concat',
      type: FlowNodeTypeEnum.datasetConcatNode,
      params: { limit: 1000 },
      inputs: [
        graphReference({ key: 'first', from: ['source', 'first'] }),
        graphReference({ key: 'second', from: ['source', 'second'] })
      ],
      outputs: [NodeOutputKeyEnum.datasetQuoteQA]
    });
    const target = consumer('target', { quotes: ['concat', NodeOutputKeyEnum.datasetQuoteQA] });
    const { result } = await runGraph({
      nodes: [source, concat, target],
      edges: [
        graphEdge({ source: 'source', target: 'concat' }),
        graphEdge({ source: 'concat', target: 'target' })
      ]
    });
    expect(graphValues(target).quotes).toHaveLength(3);
    expect(graphValues(target).quotes).toMatchObject([
      { id: 'shared', q: 'shared question', a: 'shared answer' },
      { id: 'first', q: 'first question', a: 'first answer' },
      { id: 'second', q: 'second question', a: 'second answer' }
    ]);
    expect([first, second]).toEqual(before);
    expect(result.workflowRuntimeSummary.errorCount).toBe(0);
  });

  it.each([false, true])(
    'updates node outputs and variables before the next consumer: boolean=%s',
    async (useBoolean) => {
      // 使用同一条顺序链同时覆盖节点输出写回和全局变量写回，确保下游读取的是更新后的值。
      const source = graphNode({
        id: 'source',
        type: FlowNodeTypeEnum.toolParams,
        params: { value: 'old' },
        outputs: ['value'],
        isEntry: true
      });
      const update = graphNode({
        id: 'update',
        type: FlowNodeTypeEnum.variableUpdate,
        params: {
          updateList: [
            {
              variable: ['source', 'value'],
              value: ['', useBoolean ? false : 0],
              valueType: useBoolean ? 'boolean' : 'number',
              renderType: 'input'
            },
            {
              variable: [VARIABLE_NODE_ID, 'custom'],
              value: ['', 'updated'],
              valueType: 'string',
              renderType: 'input'
            }
          ]
        }
      });
      const target = consumer('target', {
        output: ['source', 'value'],
        variable: [VARIABLE_NODE_ID, 'custom']
      });
      await runGraph({
        nodes: [source, update, target],
        edges: [
          graphEdge({ source: 'source', target: 'update' }),
          graphEdge({ source: 'update', target: 'target' })
        ]
      });
      expect(graphValues(target)).toEqual({ output: useBoolean ? false : 0, variable: 'updated' });
    }
  );

  it.each([0, 1])('runs only the selected if/else branch for %s', async (value) => {
    const source = graphNode({
      id: 'source',
      type: FlowNodeTypeEnum.toolParams,
      params: { value },
      outputs: ['value'],
      isEntry: true
    });
    const branch = graphNode({
      id: 'branch',
      type: FlowNodeTypeEnum.ifElseNode,
      params: {
        ifElseList: [
          {
            branchId: 'zero',
            condition: 'AND',
            list: [
              {
                variable: ['source', 'value'],
                condition: VariableConditionEnum.equalTo,
                value: 0,
                valueType: 'input'
              }
            ]
          }
        ]
      },
      outputs: [NodeOutputKeyEnum.ifElseResult]
    });
    const yes = consumer('yes', { value: ['source', 'value'] });
    const no = consumer('no', { value: ['source', 'value'] });
    const { responses } = await runGraph({
      nodes: [source, branch, yes, no],
      edges: [
        graphEdge({ source: 'source', target: 'branch' }),
        graphEdge({ source: 'branch', target: 'yes', handle: 'zero' }),
        graphEdge({ source: 'branch', target: 'no', handle: 'ELSE' })
      ]
    });
    const selected = value === 0 ? yes : no;
    const skipped = value === 0 ? no : yes;
    expect(graphValues(selected).value).toBe(value);
    expect(responses.some((response) => response.nodeId === selected.nodeId)).toBe(true);
    expect(responses.some((response) => response.nodeId === skipped.nodeId)).toBe(false);
  });
});

describe('real code and HTTP node error routes', () => {
  it.each([false, true])(
    'keeps business data.error successful and applies defaults only on success: failure=%s',
    async (fails) => {
      const error = Object.assign(
        new Error('sandbox failed', { cause: new Error('private cause') }),
        { privateErrorField: 'must not leak', error: 'must not overwrite data.error' }
      );
      vi.mocked(codeSandbox.runCode).mockImplementationOnce(async () => {
        if (fails) throw error;
        return { codeReturn: { error: 'business value', zero: 0, flag: false }, log: '' };
      });
      const source = graphNode({
        id: 'code',
        type: FlowNodeTypeEnum.code,
        params: { codeType: 'javascript', code: 'fixture', [NodeInputKeyEnum.addInputParam]: {} },
        isEntry: true,
        catchError: true,
        outputs: [
          'error',
          'zero',
          'flag',
          NodeOutputKeyEnum.errorText,
          'privateErrorField',
          'cause',
          'stack',
          {
            id: 'default',
            key: 'default',
            label: '',
            type: FlowNodeOutputTypeEnum.static,
            valueType: WorkflowIOValueTypeEnum.string,
            required: true,
            defaultValue: 'success only'
          }
        ]
      });
      const normal = consumer('normal', {
        error: ['code', 'error'],
        zero: ['code', 'zero'],
        flag: ['code', 'flag'],
        default: ['code', 'default']
      });
      const caught = consumer(
        'caught',
        Object.fromEntries(
          [
            NodeOutputKeyEnum.errorText,
            'error',
            'privateErrorField',
            'cause',
            'stack',
            'default'
          ].map((key) => [key, ['code', key] as [string, string]])
        )
      );
      const { result, responses } = await runGraph({
        nodes: [source, normal, caught],
        edges: [
          graphEdge({ source: 'code', target: 'normal' }),
          graphEdge({ source: 'code', target: 'caught', error: true })
        ]
      });
      expect(responses.some((response) => response.nodeId === (fails ? 'caught' : 'normal'))).toBe(
        true
      );
      expect(responses.some((response) => response.nodeId === (fails ? 'normal' : 'caught'))).toBe(
        false
      );
      if (fails) {
        expect(graphValues(caught)).toEqual({
          system_error_text: 'sandbox failed',
          error: 'sandbox failed',
          privateErrorField: undefined,
          cause: undefined,
          stack: undefined,
          default: undefined
        });
        expect(JSON.stringify(responses)).not.toContain('private cause');
      } else
        expect(graphValues(normal)).toEqual({
          error: 'business value',
          zero: 0,
          flag: false,
          default: 'success only'
        });
      expect(result.workflowRuntimeSummary.errorCount).toBe(0);
      expect(Object.hasOwn(result, 'error')).toBe(false);
    }
  );

  it.each([false, true])(
    'stops both downstream routes without catch: returned error=%s',
    async (asConfig) => {
      const error = asConfig
        ? new UserConfigError('invalid sandbox configuration')
        : new Error('sandbox unavailable');
      vi.mocked(codeSandbox.runCode).mockRejectedValueOnce(error);
      const source = graphNode({
        id: 'code',
        type: FlowNodeTypeEnum.code,
        params: { codeType: 'javascript', code: 'fixture' },
        outputs: [NodeOutputKeyEnum.errorText],
        isEntry: true
      });
      const normal = consumer('normal', { value: ['code', NodeOutputKeyEnum.errorText] });
      const caught = consumer('caught', { value: ['code', NodeOutputKeyEnum.errorText] });
      const warn = vi.spyOn(getLogger(LogCategories.MODULE.WORKFLOW.DISPATCH), 'warn');
      warn.mockClear();
      const { result, responses } = await runGraph({
        nodes: [source, normal, caught],
        edges: [
          graphEdge({ source: 'code', target: 'normal' }),
          graphEdge({ source: 'code', target: 'caught', error: true })
        ]
      });
      expect(result.error).toBe(error);
      expect(result.workflowRuntimeSummary.errorCount).toBe(1);
      expect(responses.map((response) => response.nodeId)).toEqual(['code']);
      // mock logger 只验证原始异常的提交，配置错误的降级由 logger 自身测例验证。
      expect(warn).toHaveBeenCalledExactlyOnceWith('Workflow node returned error', { error });
    }
  );

  it('does not retain prior error outputs when the same node succeeds in a new run', async () => {
    const error = new Error('first round failed');
    vi.mocked(codeSandbox.runCode)
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce({ codeReturn: { value: false }, log: '' });
    const source = graphNode({
      id: 'code',
      type: FlowNodeTypeEnum.code,
      params: { codeType: 'javascript', code: 'fixture' },
      outputs: ['value', NodeOutputKeyEnum.errorText, NodeOutputKeyEnum.error],
      isEntry: true
    });
    const target = consumer('target', {
      value: ['code', 'value'],
      message: ['code', NodeOutputKeyEnum.errorText],
      error: ['code', NodeOutputKeyEnum.error]
    });
    const first = await runGraph({
      nodes: [source, target],
      edges: [graphEdge({ source: 'code', target: 'target' })]
    });
    expect(first.result.error).toBe(error);
    expect(graphValues(source).system_error_text).toBe(error.message);
    source.isEntry = true;
    const second = await runGraph({
      nodes: [source, target],
      edges: [graphEdge({ source: 'code', target: 'target' })]
    });
    expect(graphValues(target)).toEqual({ value: false, message: undefined, error: undefined });
    expect(second.result.workflowRuntimeSummary.errorCount).toBe(0);
    expect(Object.hasOwn(second.result, 'error')).toBe(false);
  });

  it('passes selected JSON fields and the raw HTTP response to the next node', async () => {
    const body = {
      zero: 0,
      flag: false,
      empty: '',
      nested: { values: [1, 2] },
      error: 'business error field'
    };
    axiosMock.mockResolvedValueOnce({ data: body });
    const source = graphNode({
      id: 'http',
      type: FlowNodeTypeEnum.httpRequest468,
      params: {
        [NodeInputKeyEnum.httpReqUrl]: 'https://example.com',
        [NodeInputKeyEnum.httpMethod]: 'GET'
      },
      outputs: [
        NodeOutputKeyEnum.httpRawResponse,
        'zero',
        'flag',
        'empty',
        'nested.values',
        'error'
      ],
      isEntry: true
    });
    const target = consumer(
      'target',
      Object.fromEntries(
        source.outputs.map((output) => [output.key, ['http', output.key] as [string, string]])
      )
    );
    const { result } = await runGraph({
      nodes: [source, target],
      edges: [graphEdge({ source: 'http', target: 'target' })]
    });
    expect(graphValues(target)).toEqual({
      [NodeOutputKeyEnum.httpRawResponse]: body,
      zero: 0,
      flag: false,
      empty: '',
      'nested.values': [1, 2],
      error: undefined
    });
    expect(result.workflowRuntimeSummary.errorCount).toBe(0);
    expect(axiosMock).toHaveBeenCalledOnce();
  });

  it('exposes the HTTP failure body on the catch route without leaking raw exception fields', async () => {
    const error = Object.assign(new Error('HTTP failure'), {
      response: { status: 422, data: { message: 'sku missing', code: 'INVALID_SKU' } },
      privateErrorField: 'private'
    });
    axiosMock.mockRejectedValueOnce(error);
    const source = graphNode({
      id: 'http',
      type: FlowNodeTypeEnum.httpRequest468,
      params: {
        [NodeInputKeyEnum.httpReqUrl]: 'https://example.com',
        [NodeInputKeyEnum.httpMethod]: 'GET'
      },
      outputs: [
        NodeOutputKeyEnum.errorText,
        NodeOutputKeyEnum.error,
        NodeOutputKeyEnum.httpRawError,
        'privateErrorField'
      ],
      isEntry: true,
      catchError: true
    });
    const target = consumer(
      'target',
      Object.fromEntries(
        source.outputs.map((output) => [output.key, ['http', output.key] as [string, string]])
      )
    );
    const { result } = await runGraph({
      nodes: [source, target],
      edges: [graphEdge({ source: 'http', target: 'target', error: true })]
    });
    expect(graphValues(target).system_error_text).toContain('sku missing');
    expect(graphValues(target).error).toContain('sku missing');
    expect(graphValues(target).privateErrorField).toBeUndefined();
    expect(graphValues(target)[NodeOutputKeyEnum.httpRawError]).toBeDefined();
    expect(Object.hasOwn(result, 'error')).toBe(false);
  });
});

/** 每个容器使用真实子 Queue；沙箱只承担可控的远程成功/失败响应。 */
const containerNodes = (type: FlowNodeTypeEnum) => {
  const isLoopRun = type === FlowNodeTypeEnum.loopRun;
  const itemKey = isLoopRun ? NodeOutputKeyEnum.currentItem : NodeOutputKeyEnum.nestedStartInput;
  const start = graphNode({
    id: 'start',
    type: isLoopRun ? FlowNodeTypeEnum.loopRunStart : FlowNodeTypeEnum.nestedStart,
    params: {
      loopRunMode: LoopRunModeEnum.array,
      [NodeInputKeyEnum.nestedStartInput]: undefined,
      [NodeInputKeyEnum.nestedStartIndex]: 0
    },
    outputs: [itemKey]
  });
  const body = graphNode({
    id: 'body',
    type: FlowNodeTypeEnum.code,
    params: { codeType: 'javascript', code: 'echo' },
    inputs: [
      {
        key: NodeInputKeyEnum.addInputParam,
        label: '',
        renderTypeList: [FlowNodeInputTypeEnum.addInputParam],
        valueType: WorkflowIOValueTypeEnum.any
      },
      { ...graphReference({ key: 'value', from: ['start', itemKey] }), canEdit: true }
    ],
    outputs: ['value', NodeOutputKeyEnum.errorText]
  });
  const end = graphNode({
    id: 'end',
    type: FlowNodeTypeEnum.nestedEnd,
    inputs: [graphReference({ key: NodeInputKeyEnum.nestedEndInput, from: ['body', 'value'] })]
  });
  return { start, body, end };
};

describe('real container child workflows', () => {
  it.each([FlowNodeTypeEnum.loop, FlowNodeTypeEnum.parallelRun])(
    '%s passes every falsy result through nestedStart/nestedEnd to downstream',
    async (type) => {
      const { start, body, end } = containerNodes(type);
      const key =
        type === FlowNodeTypeEnum.loop
          ? NodeOutputKeyEnum.nestedArrayResult
          : NodeOutputKeyEnum.parallelSuccessResults;
      const source = graphNode({
        id: 'container',
        type,
        params: {
          loopInputArray: [0, false, ''],
          childrenNodeIdList: ['start', 'body', 'end'],
          parallelRunMaxRetryTimes: 0,
          parallelRunMaxConcurrency: 2
        },
        outputs: [key],
        isEntry: true
      });
      const target = consumer('target', { values: ['container', key] });
      const { result } = await runGraph({
        nodes: [source, start, body, end, target],
        edges: [
          graphEdge({ source: 'container', target: 'target' }),
          graphEdge({ source: 'start', target: 'body' }),
          graphEdge({ source: 'body', target: 'end' })
        ]
      });
      expect(graphValues(target).values).toEqual([0, false, '']);
      expect(Object.hasOwn(result, 'error')).toBe(false);
      expect(codeSandbox.runCode).toHaveBeenCalledTimes(3);
    }
  );

  it.each(['success', 'error', 'omitted'] as const)(
    'loopRun forwards the last snapshot and never reuses skipped outputs after %s',
    async (scenario) => {
      const fails = scenario === 'error';
      const omitted = scenario === 'omitted';
      const { start, body } = containerNodes(FlowNodeTypeEnum.loopRun);
      const failure = new Error('second item failed');
      vi.mocked(codeSandbox.runCode).mockImplementation(async ({ variables }) => {
        if (variables.value === 'fail') throw failure;
        if (variables.value === 'omit') return { codeReturn: {}, log: '' };
        return { codeReturn: variables, log: '' };
      });
      const source = graphNode({
        id: 'container',
        type: FlowNodeTypeEnum.loopRun,
        params: {
          loopRunMode: LoopRunModeEnum.array,
          [NodeInputKeyEnum.loopRunInputArray]: fails
            ? [0, 'fail', 2]
            : omitted
              ? [0, 'omit']
              : [0, false, ''],
          childrenNodeIdList: ['start', 'body']
        },
        inputs: [{ ...graphReference({ key: 'value', from: ['body', 'value'] }), canEdit: true }],
        outputs: [
          {
            id: 'value',
            key: 'value',
            label: '',
            type: FlowNodeOutputTypeEnum.dynamic,
            valueType: WorkflowIOValueTypeEnum.any
          },
          NodeOutputKeyEnum.errorText
        ],
        isEntry: true,
        catchError: true
      });
      const target = consumer('target', {
        value: ['container', 'value'],
        errorText: ['container', NodeOutputKeyEnum.errorText]
      });
      const { responses } = await runGraph({
        nodes: [source, start, body, target],
        edges: [
          graphEdge({ source: 'container', target: 'target', error: fails }),
          graphEdge({ source: 'start', target: 'body' })
        ]
      });
      expect(graphValues(target)).toEqual({
        value: fails || omitted ? undefined : '',
        errorText: fails ? failure.message : undefined
      });
      const history = responses.find((response) => response.nodeId === 'container')?.loopRunHistory;
      expect(history?.map((item) => item.customOutputs.value)).toEqual(
        fails || omitted ? [0, undefined] : [0, false, '']
      );
      expect(codeSandbox.runCode).toHaveBeenCalledTimes(fails || omitted ? 2 : 3);
    }
  );

  it('parallelRun forwards mixed results in input order, including failure details', async () => {
    const { start, body, end } = containerNodes(FlowNodeTypeEnum.parallelRun);
    vi.mocked(codeSandbox.runCode).mockImplementation(async ({ variables }) => {
      if (variables.value === 'fail') throw new Error('failed task');
      return { codeReturn: variables, log: '' };
    });
    const keys = [
      NodeOutputKeyEnum.parallelSuccessResults,
      NodeOutputKeyEnum.parallelFullResults,
      NodeOutputKeyEnum.parallelStatus
    ];
    const source = graphNode({
      id: 'container',
      type: FlowNodeTypeEnum.parallelRun,
      params: {
        loopInputArray: [0, 'fail', false],
        childrenNodeIdList: ['start', 'body', 'end'],
        parallelRunMaxRetryTimes: 0,
        parallelRunMaxConcurrency: 2
      },
      outputs: keys,
      isEntry: true
    });
    const target = consumer(
      'target',
      Object.fromEntries(keys.map((key) => [key, ['container', key] as [string, string]]))
    );
    await runGraph({
      nodes: [source, start, body, end, target],
      edges: [
        graphEdge({ source: 'container', target: 'target' }),
        graphEdge({ source: 'start', target: 'body' }),
        graphEdge({ source: 'body', target: 'end' })
      ]
    });
    expect(graphValues(target)[NodeOutputKeyEnum.parallelSuccessResults]).toEqual([0, false]);
    expect(graphValues(target)[NodeOutputKeyEnum.parallelFullResults]).toMatchObject([
      { success: true, data: 0 },
      { success: false, data: null, message: 'failed task' },
      { success: true, data: false }
    ]);
    expect(graphValues(target)[NodeOutputKeyEnum.parallelStatus]).not.toBe(
      ParallelRunStatusEnum.success
    );
  });
  it('loopRunBreak stops later iterations while preserving the current output', async () => {
    const { start, body } = containerNodes(FlowNodeTypeEnum.loopRun);
    const stop = graphNode({ id: 'stop', type: FlowNodeTypeEnum.loopRunBreak });
    const source = graphNode({
      id: 'container',
      type: FlowNodeTypeEnum.loopRun,
      params: {
        loopRunMode: LoopRunModeEnum.array,
        [NodeInputKeyEnum.loopRunInputArray]: [0, 1],
        childrenNodeIdList: ['start', 'body', 'stop']
      },
      inputs: [{ ...graphReference({ key: 'value', from: ['body', 'value'] }), canEdit: true }],
      outputs: [
        {
          id: 'value',
          key: 'value',
          label: '',
          type: FlowNodeOutputTypeEnum.dynamic,
          valueType: WorkflowIOValueTypeEnum.any
        }
      ],
      isEntry: true
    });
    const target = consumer('target', { value: ['container', 'value'] });
    const { responses } = await runGraph({
      nodes: [source, start, body, stop, target],
      edges: [
        graphEdge({ source: 'container', target: 'target' }),
        graphEdge({ source: 'start', target: 'body' }),
        graphEdge({ source: 'body', target: 'stop' })
      ]
    });
    expect(graphValues(target).value).toBe(0);
    expect(codeSandbox.runCode).toHaveBeenCalledOnce();
    expect(
      responses.find((response) => response.nodeId === 'container')?.loopRunHistory
    ).toHaveLength(1);
  });

  it('parallel retries a failed task and forwards only the final successful values', async () => {
    const { start, body, end } = containerNodes(FlowNodeTypeEnum.parallelRun);
    let hasFailed = false;
    vi.mocked(codeSandbox.runCode).mockImplementation(async ({ variables }) => {
      if (!hasFailed && variables.value === 0) {
        hasFailed = true;
        throw new Error('retry once');
      }
      return { codeReturn: variables, log: '' };
    });
    const source = graphNode({
      id: 'container',
      type: FlowNodeTypeEnum.parallelRun,
      params: {
        loopInputArray: [0, false],
        childrenNodeIdList: ['start', 'body', 'end'],
        parallelRunMaxRetryTimes: 1,
        parallelRunMaxConcurrency: 2
      },
      outputs: [NodeOutputKeyEnum.parallelSuccessResults, NodeOutputKeyEnum.parallelStatus],
      isEntry: true
    });
    const target = consumer('target', {
      values: ['container', NodeOutputKeyEnum.parallelSuccessResults],
      status: ['container', NodeOutputKeyEnum.parallelStatus]
    });
    await runGraph({
      nodes: [source, start, body, end, target],
      edges: [
        graphEdge({ source: 'container', target: 'target' }),
        graphEdge({ source: 'start', target: 'body' }),
        graphEdge({ source: 'body', target: 'end' })
      ]
    });
    expect(graphValues(target)).toEqual({
      values: [0, false],
      status: ParallelRunStatusEnum.success
    });
    expect(codeSandbox.runCode).toHaveBeenCalledTimes(3);
  });
});
