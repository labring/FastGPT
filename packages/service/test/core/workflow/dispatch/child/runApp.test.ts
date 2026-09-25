import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { ChatRoleEnum, ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { WorkflowVariableState } from '../../../../../core/workflow/dispatch/utils/variables';
import { createNodeSummary } from '../../../../../core/workflow/dispatch/utils/summary';

const mocks = vi.hoisted(() => ({
  runWorkflow: vi.fn(),
  loadChildWorkflowWithResource: vi.fn(),
  getUserChatInfo: vi.fn()
}));

vi.mock('../../../../../core/workflow/dispatch/index', () => ({
  runWorkflow: (args: any) => mocks.runWorkflow(args)
}));

vi.mock('../../../../../core/workflow/utils/resource', () => ({
  loadChildWorkflowWithResource: (args: any) => mocks.loadChildWorkflowWithResource(args)
}));

vi.mock('../../../../../support/user/team/utils', () => ({
  getUserChatInfo: (args: any) => mocks.getUserChatInfo(args)
}));

import { dispatchRunAppNode } from '../../../../../core/workflow/dispatch/child/runApp';

const createParentVariableState = () =>
  WorkflowVariableState.create({
    timezone: 'Asia/Shanghai',
    runningAppInfo: {
      id: 'parent-app',
      teamId: 'parent-team',
      tmbId: 'parent-owner-tmb',
      name: 'parent-app'
    },
    uid: 'caller-uid',
    chatId: 'chat-1',
    variablesConfig: [],
    inputVariables: {}
  });

describe('dispatchRunAppNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserChatInfo.mockResolvedValue({ externalProvider: undefined });
    mocks.loadChildWorkflowWithResource.mockResolvedValue({
      appData: {
        _id: 'child-app-id',
        name: 'Child App',
        avatar: 'child-avatar',
        teamId: 'child-team-id',
        tmbId: 'child-owner-tmb'
      },
      childVersion: {
        nodes: [],
        edges: [],
        chatConfig: { variables: [] },
        resources: []
      },
      resourceContext: {}
    });
    mocks.runWorkflow.mockResolvedValue({
      flowUsages: [{ moduleName: 'Child App', totalPoints: 10 }],
      assistantResponses: [{ type: 'text', text: { content: 'child output' } }],
      runTimes: 1,
      workflowInteractiveResponse: undefined,
      system_memories: [],
      customFeedbacks: [],
      workflowRuntimeSummary: {
        responseIds: [],
        finishedNodeIds: [],
        childResponseCount: 1
      }
    });
  });

  it('should pass runningUserInfo from caller down to child workflow instead of replacing with child owner', async () => {
    const parentVariableState = await createParentVariableState();
    const usagePush = vi.fn();

    const callerUserInfo = {
      username: 'caller-user',
      teamName: 'Caller Team',
      memberName: 'Caller Member',
      contact: '',
      teamId: 'caller-team-id',
      tmbId: 'caller-tmb-id'
    };

    const props: any = {
      runningAppInfo: {
        id: 'parent-app',
        teamId: 'parent-team-id',
        tmbId: 'parent-owner-tmb',
        name: 'Parent App'
      },
      runningUserInfo: callerUserInfo,
      histories: [],
      query: [{ type: 'text', text: { content: 'hello' } }],
      node: {
        pluginId: 'child-app-id',
        version: 'v1'
      },
      params: {
        userChatInput: 'hello to child'
      },
      variableState: parentVariableState,
      timezone: 'Asia/Shanghai',
      uid: 'caller-uid',
      chatId: 'chat-1',
      responseChatItemId: 'resp-1',
      usagePush,
      nodeSummary: createNodeSummary()
    };

    const result = await dispatchRunAppNode(props);
    // 验证资源加载时使用当前运行用户身份
    expect(mocks.loadChildWorkflowWithResource).toHaveBeenCalledWith({
      appId: 'child-app-id',
      versionId: 'v1',
      tmbId: 'caller-tmb-id',
      type: 'agent'
    });

    // 验证派发子工作流时透传当前运行用户身份
    expect(mocks.runWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        runningUserInfo: callerUserInfo,
        runningAppInfo: expect.objectContaining({
          sourceType: ChatSourceTypeEnum.app,
          sourceId: 'child-app-id',
          teamId: 'child-team-id',
          tmbId: 'child-owner-tmb',
          isChildApp: true
        })
      })
    );

    expect(result.data?.[NodeOutputKeyEnum.answerText]).toBe('child output');
    expect(usagePush).toHaveBeenCalledWith([
      {
        moduleName: 'Child App',
        totalPoints: 10
      }
    ]);
  });

  it('keeps streaming and child assistant responses when a child app contains ToolCall output', async () => {
    const workflowStreamResponse = vi.fn();
    const childAssistantResponses = [
      { text: { content: 'direct child answer' } },
      {
        tools: [
          {
            id: 'call_nested',
            toolName: 'Nested search',
            toolAvatar: 'nested-avatar',
            functionName: 'nested_search',
            params: '{"q":"nested"}',
            response: 'nested result'
          }
        ]
      }
    ];
    mocks.runWorkflow.mockImplementationOnce(async (args: any) => {
      expect(args.stream).toBe(true);
      expect(args.workflowStreamResponse).toBe(workflowStreamResponse);
      args.workflowStreamResponse?.({ event: 'toolResponse', data: 'nested tool delta' });
      return {
        flowUsages: [{ moduleName: 'Child App', totalPoints: 10 }],
        assistantResponses: childAssistantResponses,
        runTimes: 1,
        workflowInteractiveResponse: undefined,
        system_memories: [],
        customFeedbacks: [],
        workflowRuntimeSummary: {
          responseIds: [],
          finishedNodeIds: [],
          childResponseCount: 1
        }
      };
    });

    const parentVariableState = await createParentVariableState();
    const result = await dispatchRunAppNode({
      runningAppInfo: {
        id: 'parent-app',
        teamId: 'parent-team',
        tmbId: 'parent-owner-tmb',
        name: 'Parent App'
      },
      runningUserInfo: {
        username: 'caller-user',
        teamName: 'Caller Team',
        memberName: 'Caller Member',
        contact: '',
        teamId: 'caller-team-id',
        tmbId: 'caller-tmb-id'
      },
      histories: [],
      query: [{ type: 'text', text: { content: 'hello' } }],
      node: { pluginId: 'child-app-id', version: 'v1' },
      params: { userChatInput: 'hello to child' },
      variableState: parentVariableState,
      timezone: 'Asia/Shanghai',
      uid: 'caller-uid',
      chatId: 'chat-1',
      responseChatItemId: 'resp-1',
      stream: true,
      workflowStreamResponse,
      usagePush: vi.fn(),
      nodeSummary: createNodeSummary()
    } as any);

    expect(result.assistantResponses).toEqual(childAssistantResponses);
    expect(result.data?.[NodeOutputKeyEnum.answerText]).toBe('direct child answer');
    expect(workflowStreamResponse).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'toolResponse', data: 'nested tool delta' })
    );
    expect(mocks.runWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        stream: true,
        workflowStreamResponse,
        runningAppInfo: expect.objectContaining({ isChildApp: true })
      })
    );
  });

  it('only disables child streaming when forbidStream is explicitly enabled', async () => {
    const workflowStreamResponse = vi.fn();
    const parentVariableState = await createParentVariableState();

    await dispatchRunAppNode({
      runningAppInfo: {
        id: 'parent-app',
        teamId: 'parent-team',
        tmbId: 'parent-owner-tmb',
        name: 'Parent App'
      },
      runningUserInfo: { teamId: 'caller-team-id', tmbId: 'caller-tmb-id' },
      histories: [],
      query: [{ type: 'text', text: { content: 'hello' } }],
      node: { pluginId: 'child-app-id', version: 'v1' },
      params: { userChatInput: 'hello to child', system_forbid_stream: true },
      variableState: parentVariableState,
      timezone: 'Asia/Shanghai',
      uid: 'caller-uid',
      chatId: 'chat-1',
      responseChatItemId: 'resp-1',
      stream: true,
      workflowStreamResponse,
      usagePush: vi.fn(),
      nodeSummary: createNodeSummary()
    } as any);

    expect(mocks.runWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        stream: false,
        workflowStreamResponse: undefined
      })
    );
    expect(workflowStreamResponse).not.toHaveBeenCalled();
  });

  it('should return error when input is empty', async () => {
    const parentVariableState = await createParentVariableState();
    const props: any = {
      runningAppInfo: { id: 'app', teamId: 't', tmbId: 'owner', name: 'App' },
      runningUserInfo: { tmbId: 'caller' },
      histories: [],
      query: [],
      node: { pluginId: 'child-app-id', version: 'v1' },
      params: { userChatInput: '' },
      variableState: parentVariableState,
      usagePush: vi.fn()
    };

    const result = await dispatchRunAppNode(props);
    expect(result.error?.[NodeOutputKeyEnum.errorText]).toBe('Input is empty');
    expect(mocks.runWorkflow).not.toHaveBeenCalled();
  });
});
