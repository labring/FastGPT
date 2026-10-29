import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum,
  LoopRunModeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import type { RuntimeEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import { UserConfigError } from '@fastgpt/global/common/error/utils';
import { codeSandbox } from '@fastgpt/service/thirdProvider/codeSandbox';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { SystemToolRepo } from '@fastgpt/service/core/app/tool/systemTool/systemTool.repo';
import * as workflowMetrics from '@fastgpt/service/core/workflow/metrics';
import {
  graphNode,
  graphEdge,
  graphReference,
  graphValues,
  runGraph
} from './testUtils/workflowGraph';

const { loadChild } = vi.hoisted(() => ({ loadChild: vi.fn() }));
vi.mock('@fastgpt/service/core/workflow/resource/service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/workflow/resource/service')>()),
  loadChildWorkflowWithResource: loadChild
}));
vi.mock('@fastgpt/service/support/user/team/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/support/user/team/utils')>()),
  getUserChatInfo: vi.fn(async () => ({ externalProvider: undefined }))
}));
vi.mock('@fastgpt/service/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/env')>();
  return {
    ...actual,
    serviceEnv: { ...actual.serviceEnv, CODE_SANDBOX_URL: 'http://sandbox.test' }
  };
});

/** 资源加载边界返回固定工作流，内部实际执行 runWorkflow 和所有节点。 */
const childResource = ({
  nodes,
  edges
}: {
  nodes: RuntimeNodeItemType[];
  edges: RuntimeEdgeItemType[];
}) => ({
  appData: {
    _id: 'childapp',
    name: 'Child App',
    avatar: '',
    teamId: '654a4107c32f3bf5f998452f',
    tmbId: '65ab7007462ada7dbb899948'
  },
  childVersion: { nodes, edges, chatConfig: { variables: [] }, resources: [] },
  resourceContext: {}
});

beforeEach(() => {
  loadChild.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe('child workflow data transfer without mocking runWorkflow', () => {
  /** 仅替换系统工具资源读取，插件输入、输出和父子 Queue 均真实执行。 */
  const mockCommercialWorkflow = () => {
    const input = graphNode({
      id: 'plugininput',
      type: FlowNodeTypeEnum.pluginInput,
      params: { value: '', error: '' },
      outputs: ['value', 'error']
    });
    const output = graphNode({
      id: 'pluginoutput',
      type: FlowNodeTypeEnum.pluginOutput,
      inputs: ['value', 'error'].map((key) => graphReference({ key, from: ['plugininput', key] }))
    });
    return vi
      .spyOn(SystemToolRepo.getInstance(), 'getSystemToolWorkflowRuntime')
      .mockResolvedValue({
        id: 'commercial-regression',
        associatedPluginId: 'system-workflow',
        name: 'Commercial workflow',
        avatar: '',
        nodes: [input, output],
        edges: [graphEdge({ source: 'plugininput', target: 'pluginoutput' })],
        chatConfig: {}
      });
  };

  it('passes workflowStart query through a real answer node, parent app node, and downstream references', async () => {
    const start = graphNode({
      id: 'childstart',
      type: FlowNodeTypeEnum.workflowStart,
      outputs: [NodeOutputKeyEnum.userChatInput]
    });
    const answer = graphNode({
      id: 'childanswer',
      type: FlowNodeTypeEnum.answerNode,
      params: { text: 'child: {{$childstart.userChatInput$}}' },
      outputs: [NodeOutputKeyEnum.answerText]
    });
    loadChild.mockResolvedValue(
      childResource({
        nodes: [start, answer],
        edges: [graphEdge({ source: 'childstart', target: 'childanswer' })]
      })
    );
    const app = graphNode({
      id: 'app',
      type: FlowNodeTypeEnum.appModule,
      pluginId: 'childapp',
      params: { userChatInput: 'hello' },
      outputs: [NodeOutputKeyEnum.answerText, NodeOutputKeyEnum.history],
      isEntry: true
    });
    const target = graphNode({
      id: 'target',
      type: FlowNodeTypeEnum.toolParams,
      inputs: [
        graphReference({ key: 'text', from: ['app', NodeOutputKeyEnum.answerText] }),
        graphReference({ key: 'history', from: ['app', NodeOutputKeyEnum.history] })
      ],
      outputs: ['text', 'history']
    });
    const { result, responses } = await runGraph({
      nodes: [app, target],
      edges: [graphEdge({ source: 'app', target: 'target' })]
    });
    expect(graphValues(target).text).toBe('\nchild: hello');
    expect(graphValues(target).history).toHaveLength(2);
    expect(responses.map((response) => response.nodeId)).toEqual(
      expect.arrayContaining(['childstart', 'childanswer', 'app', 'target'])
    );
    expect(result.workflowRuntimeSummary.errorCount).toBe(0);
    expect(Object.hasOwn(result, 'rawError')).toBe(false);
  });

  it('passes plugin input and output fields through the parent to downstream', async () => {
    const values = {
      zero: 0,
      flag: false,
      empty: '',
      nested: { items: [0, false, ''] },
      error: 'business error field'
    };
    const keys = Object.keys(values);
    const input = graphNode({
      id: 'plugininput',
      type: FlowNodeTypeEnum.pluginInput,
      params: Object.fromEntries(keys.map((key) => [key, 'default'])),
      outputs: keys
    });
    const output = graphNode({
      id: 'pluginoutput',
      type: FlowNodeTypeEnum.pluginOutput,
      inputs: keys.map((key) => graphReference({ key, from: ['plugininput', key] }))
    });
    loadChild.mockResolvedValue(
      childResource({
        nodes: [input, output],
        edges: [graphEdge({ source: 'plugininput', target: 'pluginoutput' })]
      })
    );
    const plugin = graphNode({
      id: 'plugin',
      type: FlowNodeTypeEnum.pluginModule,
      pluginId: 'childplugin',
      params: values,
      outputs: keys,
      isEntry: true
    });
    const target = graphNode({
      id: 'target',
      type: FlowNodeTypeEnum.toolParams,
      inputs: keys.map((key) => graphReference({ key, from: ['plugin', key] })),
      outputs: keys
    });
    const { result, responses } = await runGraph({
      nodes: [plugin, target],
      edges: [graphEdge({ source: 'plugin', target: 'target' })]
    });
    expect(graphValues(target)).toEqual(values);
    expect(responses.find((response) => response.nodeId === 'pluginoutput')?.pluginOutput).toEqual(
      values
    );
    expect(result.workflowRuntimeSummary.errorCount).toBe(0);
    expect(Object.hasOwn(result, 'rawError')).toBe(false);
  });

  it.each([
    { failed: false, catchError: true },
    { failed: true, catchError: true },
    { failed: true, catchError: false }
  ])(
    'routes commercial plugin output with failed=$failed and catchError=$catchError',
    async ({ failed, catchError }) => {
      const stepObservation = vi.spyOn(workflowMetrics, 'observeWorkflowStep');
      const message = failed ? 'upstream unavailable' : '';
      mockCommercialWorkflow();
      const plugin = graphNode({
        id: 'plugin',
        type: FlowNodeTypeEnum.pluginModule,
        pluginId: 'commercial-regression',
        params: { value: 'partial output', error: message },
        outputs: [
          'value',
          NodeOutputKeyEnum.errorText,
          {
            id: 'default',
            key: 'default',
            label: 'default',
            type: FlowNodeOutputTypeEnum.static,
            valueType: WorkflowIOValueTypeEnum.string,
            required: true,
            defaultValue: 'success only'
          }
        ],
        isEntry: true,
        catchError
      });
      const normal = graphNode({
        id: 'normal',
        type: FlowNodeTypeEnum.toolParams,
        inputs: [graphReference({ key: 'value', from: ['plugin', 'value'] })],
        outputs: ['value']
      });
      const caught = graphNode({
        id: 'caught',
        type: FlowNodeTypeEnum.toolParams,
        inputs: [graphReference({ key: 'message', from: ['plugin', NodeOutputKeyEnum.errorText] })],
        outputs: ['message']
      });
      const warn = vi.spyOn(getLogger(LogCategories.MODULE.WORKFLOW.DISPATCH), 'warn');
      const { result, responses } = await runGraph({
        nodes: [plugin, normal, caught],
        edges: [
          graphEdge({ source: 'plugin', target: 'normal' }),
          graphEdge({ source: 'plugin', target: 'caught', error: true })
        ]
      });

      expect(graphValues(normal).value).toBe(failed ? undefined : 'partial output');
      expect(graphValues(caught).message).toBe(failed && catchError ? message : undefined);
      expect(graphValues(plugin).value).toBe('partial output');
      expect(graphValues(plugin).default).toBe(failed ? undefined : 'success only');
      expect(responses.find((response) => response.nodeId === 'plugin')?.errorCaptured).toBe(
        failed && catchError ? true : undefined
      );
      expect(result.workflowRuntimeSummary.errorCount).toBe(failed && !catchError ? 1 : 0);
      expect(Object.hasOwn(result, 'rawError')).toBe(false);
      expect(warn).not.toHaveBeenCalledWith('Workflow node returned error', expect.anything());

      const pluginIndex = stepObservation.mock.calls.findIndex(
        ([attributes]) => attributes.nodeType === FlowNodeTypeEnum.pluginModule
      );
      const observedResult = await stepObservation.mock.results[pluginIndex].value;
      expect(observedResult.result.responseData).toBeUndefined();
      expect(stepObservation.mock.calls[pluginIndex][2]?.getStatus?.(observedResult)).toBe(
        failed ? 'error' : 'ok'
      );
    }
  );

  it('stops a loop on a child business failure while preserving partial outputs for the catch branch', async () => {
    const loadCommercial = mockCommercialWorkflow();
    const stepObservation = vi.spyOn(workflowMetrics, 'observeWorkflowStep');
    const loop = graphNode({
      id: 'loop',
      type: FlowNodeTypeEnum.loopRun,
      params: {
        [NodeInputKeyEnum.loopRunMode]: LoopRunModeEnum.array,
        [NodeInputKeyEnum.loopRunInputArray]: ['first', 'second'],
        [NodeInputKeyEnum.childrenNodeIdList]: ['start', 'plugin']
      },
      inputs: [{ ...graphReference({ key: 'value', from: ['plugin', 'value'] }), canEdit: true }],
      outputs: [
        {
          id: 'value',
          key: 'value',
          label: 'value',
          type: FlowNodeOutputTypeEnum.dynamic,
          valueType: WorkflowIOValueTypeEnum.any
        },
        NodeOutputKeyEnum.errorText
      ],
      isEntry: true,
      catchError: true
    });
    const start = graphNode({
      id: 'start',
      type: FlowNodeTypeEnum.loopRunStart,
      params: {
        loopRunMode: LoopRunModeEnum.array,
        [NodeInputKeyEnum.nestedStartInput]: undefined,
        [NodeInputKeyEnum.nestedStartIndex]: 0
      },
      outputs: [NodeOutputKeyEnum.currentItem]
    });
    const plugin = graphNode({
      id: 'plugin',
      type: FlowNodeTypeEnum.pluginModule,
      pluginId: 'commercial-regression',
      params: { value: 'partial output', error: 'upstream unavailable' },
      outputs: ['value', NodeOutputKeyEnum.errorText]
    });
    const caught = graphNode({
      id: 'caught',
      type: FlowNodeTypeEnum.toolParams,
      inputs: [
        graphReference({ key: 'value', from: ['loop', 'value'] }),
        graphReference({ key: 'message', from: ['loop', NodeOutputKeyEnum.errorText] })
      ],
      outputs: ['value', 'message']
    });
    const { result, responses } = await runGraph({
      nodes: [loop, start, plugin, caught],
      edges: [
        graphEdge({ source: 'start', target: 'plugin' }),
        graphEdge({ source: 'loop', target: 'caught', error: true })
      ]
    });

    expect(graphValues(caught)).toEqual({
      value: 'partial output',
      message: 'upstream unavailable'
    });
    expect(loadCommercial).toHaveBeenCalledOnce();
    expect(responses.find((response) => response.nodeId === 'loop')?.loopRunHistory).toMatchObject([
      { iteration: 1, success: false, error: 'upstream unavailable' }
    ]);
    expect(Object.hasOwn(result, 'rawError')).toBe(false);
    const index = stepObservation.mock.calls.findIndex(
      ([attributes]) => attributes.nodeType === FlowNodeTypeEnum.loopRun
    );
    const observedResult = await stepObservation.mock.results[index].value;
    expect(stepObservation.mock.calls[index][2]?.getStatus?.(observedResult)).toBe('error');
  });

  it.each([FlowNodeTypeEnum.appModule, FlowNodeTypeEnum.pluginModule])(
    '%s exposes its own resource-load failure through the catch branch',
    async (type) => {
      const error = new UserConfigError('child resource is unavailable');
      loadChild.mockRejectedValue(error);
      const source = graphNode({
        id: 'source',
        type,
        pluginId: 'childapp',
        params: { userChatInput: 'hello' },
        outputs: [NodeOutputKeyEnum.errorText],
        isEntry: true,
        catchError: true
      });
      const target = graphNode({
        id: 'target',
        type: FlowNodeTypeEnum.toolParams,
        inputs: [graphReference({ key: 'message', from: ['source', NodeOutputKeyEnum.errorText] })],
        outputs: ['message']
      });
      const { result } = await runGraph({
        nodes: [source, target],
        edges: [graphEdge({ source: 'source', target: 'target', error: true })]
      });
      expect(graphValues(target).message).toBe(error.message);
      expect(result.workflowRuntimeSummary.errorCount).toBe(0);
      expect(Object.hasOwn(result, 'rawError')).toBe(false);
      expect(loadChild).toHaveBeenCalledOnce();
    }
  );

  it.each([
    { type: FlowNodeTypeEnum.appModule, catchError: true },
    { type: FlowNodeTypeEnum.appModule, catchError: false },
    { type: FlowNodeTypeEnum.pluginModule, catchError: true },
    { type: FlowNodeTypeEnum.pluginModule, catchError: false }
  ])(
    'propagates an uncaught child failure through $type with catchError=$catchError',
    async ({ type, catchError }) => {
      const failure = new Error('child sandbox failed');
      vi.spyOn(codeSandbox, 'runCode').mockRejectedValueOnce(failure);
      const start = graphNode({
        id: 'childstart',
        type:
          type === FlowNodeTypeEnum.appModule
            ? FlowNodeTypeEnum.workflowStart
            : FlowNodeTypeEnum.pluginInput
      });
      const code = graphNode({
        id: 'childcode',
        type: FlowNodeTypeEnum.code,
        params: { codeType: 'javascript', code: 'fixture' },
        outputs: [NodeOutputKeyEnum.errorText]
      });
      loadChild.mockResolvedValue(
        childResource({
          nodes: [start, code],
          edges: [graphEdge({ source: 'childstart', target: 'childcode' })]
        })
      );
      const source = graphNode({
        id: 'app',
        type,
        pluginId: 'childapp',
        params: { userChatInput: 'hello' },
        outputs: [NodeOutputKeyEnum.answerText, NodeOutputKeyEnum.errorText],
        isEntry: true,
        catchError
      });
      const target = graphNode({
        id: 'target',
        type: FlowNodeTypeEnum.toolParams,
        inputs: [graphReference({ key: 'answer', from: ['app', NodeOutputKeyEnum.answerText] })],
        outputs: ['answer']
      });
      const caught = graphNode({
        id: 'caught',
        type: FlowNodeTypeEnum.toolParams,
        inputs: [graphReference({ key: 'message', from: ['app', NodeOutputKeyEnum.errorText] })],
        outputs: ['message']
      });
      const warn = vi.spyOn(getLogger(LogCategories.MODULE.WORKFLOW.DISPATCH), 'warn');
      warn.mockClear();
      const { result, responses } = await runGraph({
        nodes: [source, target, caught],
        edges: [
          graphEdge({ source: 'app', target: 'target' }),
          graphEdge({ source: 'app', target: 'caught', error: true })
        ]
      });
      expect(warn).toHaveBeenCalledExactlyOnceWith('Workflow node returned error', {
        error: failure
      });
      expect(responses.find((response) => response.nodeId === 'childcode')?.errorText).toBe(
        failure.message
      );
      expect(graphValues(source)[NodeOutputKeyEnum.errorText]).toBe(failure.message);
      expect(graphValues(target).answer).toBeUndefined();
      expect(graphValues(caught).message).toBe(catchError ? failure.message : undefined);
      expect(responses.find((response) => response.nodeId === 'app')).toMatchObject({
        errorText: failure.message,
        ...(catchError ? { errorCaptured: true } : {})
      });
      expect(result.workflowRuntimeSummary.errorCount).toBe(catchError ? 0 : 1);
      expect(Object.hasOwn(result, 'rawError')).toBe(false);
    }
  );

  it.each([FlowNodeTypeEnum.appModule, FlowNodeTypeEnum.pluginModule])(
    '%s succeeds when the child catches and recovers from its own error',
    async (type) => {
      vi.spyOn(codeSandbox, 'runCode').mockRejectedValueOnce(new Error('handled child failure'));
      const start = graphNode({
        id: 'childstart',
        type:
          type === FlowNodeTypeEnum.appModule
            ? FlowNodeTypeEnum.workflowStart
            : FlowNodeTypeEnum.pluginInput
      });
      const code = graphNode({
        id: 'childcode',
        type: FlowNodeTypeEnum.code,
        params: { codeType: 'javascript', code: 'fixture' },
        outputs: [NodeOutputKeyEnum.errorText],
        catchError: true
      });
      const output = graphNode({
        id: 'childoutput',
        type:
          type === FlowNodeTypeEnum.appModule
            ? FlowNodeTypeEnum.answerNode
            : FlowNodeTypeEnum.pluginOutput,
        params: { text: 'recovered', value: 'recovered' },
        outputs: [NodeOutputKeyEnum.answerText]
      });
      loadChild.mockResolvedValue(
        childResource({
          nodes: [start, code, output],
          edges: [
            graphEdge({ source: 'childstart', target: 'childcode' }),
            graphEdge({ source: 'childcode', target: 'childoutput', error: true })
          ]
        })
      );
      const source = graphNode({
        id: 'source',
        type,
        pluginId: 'childapp',
        params: { userChatInput: 'hello' },
        outputs: [NodeOutputKeyEnum.answerText, 'value', NodeOutputKeyEnum.errorText],
        isEntry: true,
        catchError: true
      });
      const target = graphNode({
        id: 'target',
        type: FlowNodeTypeEnum.toolParams,
        inputs: [
          graphReference({
            key: 'value',
            from: [
              'source',
              type === FlowNodeTypeEnum.appModule ? NodeOutputKeyEnum.answerText : 'value'
            ]
          })
        ],
        outputs: ['value']
      });
      const { result, responses } = await runGraph({
        nodes: [source, target],
        edges: [graphEdge({ source: 'source', target: 'target' })]
      });

      expect(graphValues(target).value).toBe(
        type === FlowNodeTypeEnum.appModule ? '\nrecovered' : 'recovered'
      );
      expect(graphValues(source)[NodeOutputKeyEnum.errorText]).toBeUndefined();
      expect(responses.find((response) => response.nodeId === 'childcode')?.errorCaptured).toBe(
        true
      );
      expect(responses.find((response) => response.nodeId === 'source')?.errorText).toBeUndefined();
      expect(result.workflowRuntimeSummary.errorCount).toBe(0);
    }
  );

  it('propagates a failed grandchild through an app and plugin to the outer catch branch', async () => {
    const failure = new Error('grandchild sandbox failed');
    vi.spyOn(codeSandbox, 'runCode').mockRejectedValueOnce(failure);
    const start = graphNode({ id: 'childstart', type: FlowNodeTypeEnum.workflowStart });
    const plugin = graphNode({
      id: 'childplugin',
      type: FlowNodeTypeEnum.pluginModule,
      pluginId: 'grandchild',
      outputs: [NodeOutputKeyEnum.errorText]
    });
    const input = graphNode({ id: 'plugininput', type: FlowNodeTypeEnum.pluginInput });
    const code = graphNode({
      id: 'grandchildcode',
      type: FlowNodeTypeEnum.code,
      params: { codeType: 'javascript', code: 'fixture' },
      outputs: [NodeOutputKeyEnum.errorText]
    });
    loadChild.mockImplementation(async ({ appId }) =>
      childResource(
        appId === 'childapp'
          ? {
              nodes: [start, plugin],
              edges: [graphEdge({ source: 'childstart', target: 'childplugin' })]
            }
          : {
              nodes: [input, code],
              edges: [graphEdge({ source: 'plugininput', target: 'grandchildcode' })]
            }
      )
    );
    const source = graphNode({
      id: 'source',
      type: FlowNodeTypeEnum.appModule,
      pluginId: 'childapp',
      params: { userChatInput: 'hello' },
      outputs: [NodeOutputKeyEnum.errorText],
      isEntry: true,
      catchError: true
    });
    const caught = graphNode({
      id: 'caught',
      type: FlowNodeTypeEnum.toolParams,
      inputs: [graphReference({ key: 'message', from: ['source', NodeOutputKeyEnum.errorText] })],
      outputs: ['message']
    });
    const { result, responses } = await runGraph({
      nodes: [source, caught],
      edges: [graphEdge({ source: 'source', target: 'caught', error: true })]
    });

    expect(graphValues(caught).message).toBe(failure.message);
    expect(responses.find((response) => response.nodeId === 'childplugin')?.errorText).toBe(
      failure.message
    );
    expect(result.workflowRuntimeSummary.errorCount).toBe(0);
    expect(Object.hasOwn(result, 'rawError')).toBe(false);
  });
});
