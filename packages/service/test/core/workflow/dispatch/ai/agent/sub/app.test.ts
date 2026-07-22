import { describe, expect, it, vi, beforeEach } from 'vitest';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import {
  VariableInputEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import { WorkflowVariableState } from '@fastgpt/service/core/workflow/dispatch/utils/variables';
import { summarizeRuntimeNodeResponses } from '@fastgpt/service/core/workflow/dispatch/utils';
import { ChatFileTypeEnum, ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { prepareWorkflowFileContext } from '@fastgpt/service/core/workflow/utils/fileContext';
import {
  getWorkflowFileContext,
  runWithContext
} from '@fastgpt/service/core/workflow/utils/context';

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

import {
  dispatchApp,
  dispatchPlugin
} from '@fastgpt/service/core/workflow/dispatch/ai/agent/sub/app';

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

  it('inherits child workflow tool default file variables from the parent context', async () => {
    const defaultKey = 'chat/app/parent-app/user/chat/default.pdf';
    const defaultUrl = 'https://files.example.com/default';
    const defaultFile = {
      key: defaultKey,
      name: 'default.pdf',
      type: ChatFileTypeEnum.file
    };
    const { fileContext, fileRegistrar } = await prepareWorkflowFileContext({
      query: [{ file: { ...defaultFile, url: '' } }],
      histories: [],
      scope: {
        sourceType: ChatSourceTypeEnum.app,
        sourceId: 'parent-app',
        uid: 'user',
        chatId: 'chat'
      },
      maxFileAmount: 20,
      getPreviewUrl: vi.fn().mockResolvedValue(defaultUrl)
    });
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
          inputs: [],
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
            key: 'defaultFiles',
            label: 'defaultFiles',
            type: VariableInputEnum.file,
            valueType: WorkflowIOValueTypeEnum.arrayString,
            defaultValue: [defaultFile],
            description: ''
          }
        ]
      }
    });
    mocks.runWorkflow.mockImplementationOnce(async (props) => {
      expect(getWorkflowFileContext()?.resolve(defaultUrl)?.source).toEqual({
        type: 'chatObject',
        objectKey: defaultKey
      });
      expect(props.variableState.get('defaultFiles')).toEqual([defaultUrl]);
      return {
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
      };
    });
    const variableState = await createVariableState();

    await runWithContext(
      {
        mcpClientMemory: {},
        fileContext,
        fileRegistrar
      },
      () =>
        dispatchPlugin({
          app: { id: 'child-app', name: 'Child Workflow Tool' },
          runningAppInfo: {
            sourceType: 'app',
            sourceId: 'parent-app',
            teamId: 'team',
            tmbId: 'member',
            name: 'parent'
          },
          runningUserInfo: { teamId: 'team', tmbId: 'member' },
          customAppVariables: {},
          userChatInput: '',
          timezone: 'Asia/Shanghai',
          uid: 'user',
          chatId: 'chat',
          responseChatItemId: 'response',
          histories: [],
          variableState,
          checkIsStopping: vi.fn(() => false),
          maxRunTimes: 20,
          workflowDispatchDeep: 0
        } as any)
    );
  });

  it('returns plugin child interactive state and forwards lastInteractive on resume', async () => {
    const previousInteractive = {
      type: 'userSelect',
      entryNodeIds: ['select_1']
    };
    const nextInteractive = {
      type: 'userInput',
      entryNodeIds: ['input_2']
    };
    mocks.authAppByTmbId.mockResolvedValue({
      app: {
        _id: 'child-plugin',
        name: 'Child Plugin',
        teamId: 'child-team',
        tmbId: 'child-member'
      }
    });
    mocks.getAppVersionById.mockResolvedValue({
      nodes: [],
      edges: [],
      chatConfig: { variables: [] }
    });
    mocks.runWorkflow.mockResolvedValue({
      assistantResponses: [{ text: { content: 'waiting for plugin input' } }],
      flowUsages: [],
      runtimeNodeResponseSummary: undefined,
      workflowInteractiveResponse: nextInteractive
    });

    const result = await dispatchPlugin({
      app: {
        id: 'child-plugin',
        name: 'Child Plugin'
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
      customAppVariables: {},
      userChatInput: '',
      timezone: 'Asia/Shanghai',
      uid: 'user',
      chatId: 'chat',
      responseChatItemId: 'response',
      variableState: await createVariableState(),
      checkIsStopping: vi.fn(() => false),
      maxRunTimes: 20,
      workflowDispatchDeep: 0,
      lastInteractive: previousInteractive
    } as any);

    expect(mocks.runWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        lastInteractive: previousInteractive
      })
    );
    expect(result).toMatchObject({
      response: 'waiting for plugin input',
      interactive: nextInteractive,
      assistantMessages: [
        expect.objectContaining({
          role: 'assistant',
          content: 'waiting for plugin input'
        })
      ]
    });
  });
});

describe('agent sub app dispatchApp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authAppByTmbId.mockResolvedValue({
      app: {
        _id: 'child-app',
        name: 'Child App',
        teamId: 'child-team',
        tmbId: 'child-member'
      }
    });
    mocks.getAppVersionById.mockResolvedValue({
      nodes: [],
      edges: [],
      chatConfig: {
        variables: []
      }
    });
  });

  it('returns child assistant messages and interactive state to the agent-loop tool provider', async () => {
    const previousInteractive = {
      type: 'userSelect',
      entryNodeIds: ['select_1']
    };
    const nextInteractive = {
      type: 'userInput',
      entryNodeIds: ['input_2']
    };
    mocks.runWorkflow.mockResolvedValue({
      assistantResponses: [
        { text: { content: 'child answer' } },
        {
          tools: [
            {
              id: 'call_nested',
              toolName: 'Nested tool',
              toolAvatar: '',
              functionName: 'nested_tool',
              params: '{}',
              response: 'nested result'
            }
          ]
        }
      ],
      flowUsages: [],
      runtimeNodeResponseSummary: undefined,
      workflowInteractiveResponse: nextInteractive
    });

    const result = await dispatchApp({
      app: {
        id: 'child-app',
        name: 'Child App'
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
      customAppVariables: {},
      userChatInput: 'hello',
      timezone: 'Asia/Shanghai',
      uid: 'user',
      chatId: 'chat',
      responseChatItemId: 'response',
      variableState: await createVariableState(),
      checkIsStopping: vi.fn(() => false),
      maxRunTimes: 20,
      workflowDispatchDeep: 0,
      lastInteractive: previousInteractive
    } as any);

    expect(mocks.runWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        lastInteractive: previousInteractive
      })
    );
    expect(result.response).toBe('child answer');
    expect(result.assistantMessages).toEqual([
      expect.objectContaining({
        role: 'assistant',
        content: 'child answer',
        tool_calls: [expect.objectContaining({ id: 'call_nested' })]
      }),
      {
        role: 'tool',
        tool_call_id: 'call_nested',
        content: 'nested result'
      }
    ]);
    expect(result.interactive).toBe(nextInteractive);
  });
});
