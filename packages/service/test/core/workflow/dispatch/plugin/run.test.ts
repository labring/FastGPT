import { describe, expect, it, vi, beforeEach } from 'vitest';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import {
  NodeOutputKeyEnum,
  VariableInputEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import { WorkflowVariableState } from '@fastgpt/service/core/workflow/dispatch/utils/variables';
import { summarizeRuntimeNodeResponses } from '@fastgpt/service/core/workflow/dispatch/utils';

const runWorkflowMock = vi.fn();
const getSystemToolWorkflowRuntimeMock = vi.fn();

vi.mock('@fastgpt/service/core/workflow/dispatch', () => ({
  runWorkflow: (args: any) => runWorkflowMock(args)
}));

vi.mock('@fastgpt/service/core/app/tool/systemTool/systemTool.repo', () => ({
  SystemToolRepo: {
    getInstance: () => ({
      getSystemToolWorkflowRuntime: getSystemToolWorkflowRuntimeMock
    })
  }
}));

vi.mock('@fastgpt/service/support/user/team/utils', () => ({
  getUserChatInfo: vi.fn().mockResolvedValue({ externalProvider: undefined })
}));

vi.mock('@fastgpt/service/core/app/tool/runtime/utils', () => ({
  computedAppToolUsage: vi.fn().mockResolvedValue(1)
}));

vi.mock('@fastgpt/service/core/app/tool/workflowTool/utils', () => ({
  serverGetWorkflowToolRunUserQuery: vi.fn().mockReturnValue({ value: [{ text: { content: '' } }] })
}));

import { dispatchRunPlugin } from '@fastgpt/service/core/workflow/dispatch/plugin/run';

const createVariableState = () =>
  WorkflowVariableState.create({
    timezone: 'Asia/Shanghai',
    runningAppInfo: {
      id: 'app',
      name: 'app',
      teamId: 'team',
      tmbId: 'member'
    },
    uid: 'user',
    chatId: 'chat',
    responseChatItemId: 'response',
    histories: [],
    variablesConfig: []
  });

describe('dispatchRunPlugin', () => {
  beforeEach(() => {
    runWorkflowMock.mockReset();
    getSystemToolWorkflowRuntimeMock.mockReset();
  });

  it('系统级 workflow tool 不把外层 nodeResponseSink 传给 child workflow', async () => {
    getSystemToolWorkflowRuntimeMock.mockResolvedValue({
      id: 'commercial-system-workflow',
      name: 'System Workflow',
      avatar: 'system-avatar',
      nodes: [
        {
          nodeId: 'pluginInput',
          name: 'Input',
          avatar: '',
          flowNodeType: FlowNodeTypeEnum.pluginInput,
          showStatus: false,
          isEntry: true,
          inputs: [],
          outputs: []
        },
        {
          nodeId: 'pluginOutput',
          name: 'Output',
          avatar: '',
          flowNodeType: FlowNodeTypeEnum.pluginOutput,
          showStatus: false,
          isEntry: false,
          inputs: [{ key: 'result', isToolOutput: true }],
          outputs: []
        }
      ],
      edges: [],
      chatConfig: {
        variables: [
          {
            key: 'counter',
            label: 'counter',
            type: VariableInputEnum.numberInput,
            valueType: WorkflowIOValueTypeEnum.number,
            defaultValue: 0,
            description: ''
          }
        ]
      },
      currentCost: 0,
      associatedPluginId: 'associated-app'
    });
    runWorkflowMock.mockResolvedValue({
      flowUsages: [],
      debugResponse: {},
      workflowInteractiveResponse: undefined,
      [DispatchNodeResponseKeyEnum.assistantResponses]: [],
      [DispatchNodeResponseKeyEnum.runTimes]: 1,
      [DispatchNodeResponseKeyEnum.toolResponse]: {},
      [DispatchNodeResponseKeyEnum.newVariables]: {},
      runtimeNodeResponseSummary: summarizeRuntimeNodeResponses(undefined, [
        {
          id: 'pluginOutputResponse',
          nodeId: 'pluginOutput',
          moduleName: 'Output',
          moduleType: FlowNodeTypeEnum.pluginOutput,
          pluginOutput: { result: 'ok' }
        }
      ])
    });
    const nodeResponseSink = { publish: vi.fn() } as any;

    const result = await dispatchRunPlugin({
      node: {
        nodeId: 'toolNode',
        name: 'Tool',
        avatar: '',
        flowNodeType: FlowNodeTypeEnum.pluginModule,
        pluginId: 'commercial-system-workflow',
        inputs: [],
        outputs: []
      },
      runningAppInfo: {
        id: 'app',
        name: 'app',
        teamId: 'team',
        tmbId: 'member'
      },
      query: [{ text: { content: '' } }],
      params: {},
      histories: [],
      timezone: 'Asia/Shanghai',
      uid: 'user',
      chatId: 'chat',
      responseChatItemId: 'response',
      variableState: await createVariableState(),
      nodeResponseSink,
      usagePush: vi.fn(),
      runtimeNodes: [],
      runtimeNodesMap: new Map(),
      runtimeEdges: []
    } as any);

    expect(runWorkflowMock).toHaveBeenCalledTimes(1);
    const childWorkflowProps = runWorkflowMock.mock.calls[0][0];
    expect(childWorkflowProps.nodeResponseSink).toBeUndefined();
    expect(childWorkflowProps.chatConfig.variables).toHaveLength(1);
    expect(childWorkflowProps.variableState.get('counter')).toBe(0);
    expect(result[DispatchNodeResponseKeyEnum.nodeResponse]).toMatchObject({
      moduleLogo: 'system-avatar',
      childResponseCount: 1
    });
    expect(result.data?.[NodeOutputKeyEnum.errorText]).toBeUndefined();
  });
});
