import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import type { RuntimeEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import { UserConfigError } from '@fastgpt/global/common/error/utils';
import { codeSandbox } from '@fastgpt/service/thirdProvider/codeSandbox';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { SystemToolRepo } from '@fastgpt/service/core/app/tool/systemTool/systemTool.repo';
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
    expect(Object.hasOwn(result, 'error')).toBe(false);
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
    expect(Object.hasOwn(result, 'error')).toBe(false);
  });

  it.each([
    { failed: false, catchError: true },
    { failed: true, catchError: true },
    { failed: true, catchError: false }
  ])(
    'routes commercial plugin output with failed=$failed and catchError=$catchError',
    async ({ failed, catchError }) => {
      const message = failed ? 'upstream unavailable' : '';
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
      vi.spyOn(SystemToolRepo.getInstance(), 'getSystemToolWorkflowRuntime').mockResolvedValue({
        id: 'commercial-regression',
        associatedPluginId: 'system-workflow',
        name: 'Commercial workflow',
        avatar: '',
        nodes: [input, output],
        edges: [graphEdge({ source: 'plugininput', target: 'pluginoutput' })],
        chatConfig: {}
      });
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
      expect(Object.hasOwn(result, 'error')).toBe(false);
      expect(warn).not.toHaveBeenCalledWith('Workflow node returned error', expect.anything());
    }
  );

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
      expect(Object.hasOwn(result, 'error')).toBe(false);
      expect(loadChild).toHaveBeenCalledOnce();
    }
  );

  it('reports a child node failure in its own dispatch and keeps the parent app data contract', async () => {
    const failure = new Error('child sandbox failed');
    vi.spyOn(codeSandbox, 'runCode').mockRejectedValueOnce(failure);
    const start = graphNode({ id: 'childstart', type: FlowNodeTypeEnum.workflowStart });
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
      type: FlowNodeTypeEnum.appModule,
      pluginId: 'childapp',
      params: { userChatInput: 'hello' },
      outputs: [NodeOutputKeyEnum.answerText],
      isEntry: true
    });
    const target = graphNode({
      id: 'target',
      type: FlowNodeTypeEnum.toolParams,
      inputs: [graphReference({ key: 'answer', from: ['app', NodeOutputKeyEnum.answerText] })],
      outputs: ['answer']
    });
    const warn = vi.spyOn(getLogger(LogCategories.MODULE.WORKFLOW.DISPATCH), 'warn');
    warn.mockClear();
    const { result, responses } = await runGraph({
      nodes: [source, target],
      edges: [graphEdge({ source: 'app', target: 'target' })]
    });
    expect(warn).toHaveBeenCalledExactlyOnceWith('Workflow node returned error', {
      error: failure
    });
    expect(responses.find((response) => response.nodeId === 'childcode')?.errorText).toBe(
      failure.message
    );
    expect(graphValues(target).answer).toBe('');
    expect(Object.hasOwn(result, 'error')).toBe(false);
  });
});
