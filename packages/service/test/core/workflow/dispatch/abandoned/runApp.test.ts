import { describe, expect, it, vi } from 'vitest';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { VariableInputEnum } from '@fastgpt/global/core/workflow/constants';
import { WorkflowVariableState } from '../../../../../core/workflow/dispatch/utils/variables';
import { summarizeRuntimeNodeResponses } from '../../../../../core/workflow/dispatch/utils';

const runWorkflowMock = vi.fn();
const authAppByTmbIdMock = vi.fn();
const getUserChatInfoMock = vi.fn();
const getAppVersionByIdMock = vi.fn();

vi.mock('../../../../../core/workflow/dispatch/index', () => ({
  runWorkflow: (args: any) => runWorkflowMock(args)
}));

vi.mock('../../../../../support/permission/app/auth', () => ({
  authAppByTmbId: (...args: any[]) => authAppByTmbIdMock(...args)
}));

vi.mock('../../../../../support/user/team/utils', () => ({
  getUserChatInfo: (...args: any[]) => getUserChatInfoMock(...args)
}));

vi.mock('../../../../../core/app/version/controller', () => ({
  getAppVersionById: (...args: any[]) => getAppVersionByIdMock(...args),
  getAppPublishedWorkflowMap: vi.fn(async () => new Map())
}));

import { dispatchAppRequest } from '../../../../../core/workflow/dispatch/abandoned/runApp';

const createParentVariableState = () =>
  WorkflowVariableState.create({
    timezone: 'Asia/Shanghai',
    runningAppInfo: {
      id: 'parent-app',
      teamId: 'team',
      tmbId: 'parent-tmb',
      name: 'parent'
    },
    uid: 'uid',
    chatId: 'chat',
    variablesConfig: [
      {
        key: 'shared',
        type: VariableInputEnum.input,
        valueType: WorkflowIOValueTypeEnum.string
      } as any
    ],
    inputVariables: {
      shared: 'parent-value'
    }
  });

describe('abandoned dispatchAppRequest', () => {
  it('should run child app with an isolated variable state', async () => {
    const parentVariableState = await createParentVariableState();
    const usagePush = vi.fn();
    let childInitialValue: unknown;

    authAppByTmbIdMock.mockResolvedValue({
      app: {
        _id: 'child-app',
        name: 'child',
        avatar: '',
        teamId: 'team',
        tmbId: 'child-tmb',
        modules: [],
        edges: []
      }
    });
    getUserChatInfoMock.mockResolvedValue({
      externalProvider: {
        externalWorkflowVariables: {}
      }
    });
    getAppVersionByIdMock.mockResolvedValue({
      versionId: '',
      versionName: 'child',
      nodes: [],
      edges: [],
      chatConfig: {
        variables: [
          {
            key: 'shared',
            type: VariableInputEnum.input,
            valueType: WorkflowIOValueTypeEnum.string
          }
        ]
      },
      resources: []
    });
    runWorkflowMock.mockImplementation(async (args: any) => {
      childInitialValue = args.variableState.get('shared');
      await args.variableState.set('shared', 'child-value');
      return {
        flowResponses: [],
        flowUsages: [
          {
            moduleName: 'child model',
            totalPoints: 5
          }
        ],
        assistantResponses: [],
        system_memories: [],
        runtimeNodeResponseSummary: summarizeRuntimeNodeResponses(undefined, [
          {
            id: 'child-root',
            moduleType: FlowNodeTypeEnum.chatNode,
            totalPoints: 2,
            childTotalPoints: 3,
            childResponseCount: 1
          } as any
        ])
      };
    });

    const result = await dispatchAppRequest({
      runningAppInfo: {
        id: 'parent-app',
        teamId: 'team',
        tmbId: 'parent-tmb',
        name: 'parent'
      },
      runningUserInfo: {
        tmbId: 'parent-tmb',
        teamId: 'team'
      },
      workflowStreamResponse: vi.fn(),
      histories: [],
      query: [],
      variableState: parentVariableState,
      params: {
        [NodeInputKeyEnum.userChatInput]: 'hello',
        app: {
          id: 'child-app'
        }
      },
      timezone: 'Asia/Shanghai',
      uid: 'uid',
      chatId: 'chat',
      responseChatItemId: 'response',
      usagePush,
      chatConfig: {
        variables: []
      }
    } as any);

    const childVariableState = runWorkflowMock.mock.calls[0][0].variableState;

    expect(childVariableState).not.toBe(parentVariableState);
    expect(childInitialValue).toBe('parent-value');
    expect(childVariableState.get('shared')).toBe('child-value');
    expect(parentVariableState.get('shared')).toBe('parent-value');
    expect(usagePush).toHaveBeenCalledWith([
      {
        moduleName: 'child',
        totalPoints: 5
      }
    ]);
    expect(result.responseData?.totalPoints).toBe(5);
  });
});
