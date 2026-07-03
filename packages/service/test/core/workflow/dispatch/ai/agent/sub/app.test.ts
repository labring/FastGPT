import { describe, expect, it, vi, beforeEach } from 'vitest';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import {
  VariableInputEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import { WorkflowVariableState } from '@fastgpt/service/core/workflow/dispatch/utils/variables';
import { summarizeRuntimeNodeResponses } from '@fastgpt/service/core/workflow/dispatch/utils';

const mocks = vi.hoisted(() => ({
  runWorkflow: vi.fn(),
  authAppByTmbId: vi.fn(),
  getAppVersionById: vi.fn(),
  serverGetWorkflowToolRunUserQuery: vi.fn()
}));

vi.mock('@fastgpt/service/core/workflow/dispatch', () => ({
  runWorkflow: (args: any) => mocks.runWorkflow(args)
}));

vi.mock('@fastgpt/service/support/permission/app/auth', () => ({
  authAppByTmbId: mocks.authAppByTmbId
}));

vi.mock('@fastgpt/service/core/app/version/controller', () => ({
  getAppVersionById: mocks.getAppVersionById
}));

vi.mock('@fastgpt/service/support/user/team/utils', () => ({
  getUserChatInfo: vi.fn().mockResolvedValue({ externalProvider: undefined })
}));

vi.mock('@fastgpt/service/core/app/tool/workflowTool/utils', () => ({
  serverGetWorkflowToolRunUserQuery: (args: any) => mocks.serverGetWorkflowToolRunUserQuery(args)
}));

import { dispatchPlugin } from '@fastgpt/service/core/workflow/dispatch/ai/agent/sub/app';

const createVariableState = () =>
  WorkflowVariableState.create({
    timezone: 'Asia/Shanghai',
    runningAppInfo: {
      sourceType: 'app',
      sourceId: 'parent-app',
      teamId: 'team',
      tmbId: 'member',
      name: 'parent'
    },
    uid: 'user',
    chatId: 'chat',
    responseChatItemId: 'response',
    histories: [],
    variablesConfig: []
  });

describe('agent sub app dispatchPlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.serverGetWorkflowToolRunUserQuery.mockReturnValue({ value: [] });
    mocks.runWorkflow.mockResolvedValue({
      flowUsages: [],
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
  });

  it('initializes workflow tool variables from child chatConfig', async () => {
    mocks.authAppByTmbId.mockResolvedValue({
      app: {
        _id: 'child-app',
        name: 'Child Workflow Tool',
        teamId: 'child-team',
        tmbId: 'child-member'
      }
    });
    mocks.getAppVersionById.mockResolvedValue({
      nodes: [
        {
          nodeId: 'pluginInput',
          name: 'Input',
          flowNodeType: FlowNodeTypeEnum.pluginInput,
          inputs: [
            {
              key: 'query',
              defaultValue: 'default query',
              renderTypeList: []
            }
          ],
          outputs: []
        },
        {
          nodeId: 'pluginOutput',
          name: 'Output',
          flowNodeType: FlowNodeTypeEnum.pluginOutput,
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
      }
    });

    await dispatchPlugin({
      app: {
        id: 'child-app',
        name: 'Child Workflow Tool'
      },
      runningAppInfo: {
        sourceType: 'app',
        sourceId: 'parent-app',
        teamId: 'team',
        tmbId: 'member',
        name: 'parent'
      },
      runningUserInfo: {
        teamId: 'team',
        tmbId: 'member'
      },
      customAppVariables: {
        query: 'hello'
      },
      userChatInput: '',
      timezone: 'Asia/Shanghai',
      uid: 'user',
      chatId: 'chat',
      responseChatItemId: 'response',
      histories: [],
      variableState: await createVariableState(),
      checkIsStopping: vi.fn(() => false),
      maxRunTimes: 20,
      workflowDispatchDeep: 0
    } as any);

    expect(mocks.runWorkflow).toHaveBeenCalledTimes(1);
    expect(mocks.runWorkflow.mock.calls[0][0].variableState.get('counter')).toBe(0);
    expect(mocks.serverGetWorkflowToolRunUserQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: expect.objectContaining({
          counter: 0,
          query: 'hello'
        })
      })
    );
  });
});
