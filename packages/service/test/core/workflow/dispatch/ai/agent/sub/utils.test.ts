import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  dispatchApp: vi.fn(),
  dispatchPlugin: vi.fn(),
  dispatchTool: vi.fn(),
  getAgentRuntimeTools: vi.fn(),
  getSystemToolDetail: vi.fn()
}));

vi.mock('@fastgpt/service/core/workflow/dispatch/ai/agent/sub/app', () => ({
  dispatchApp: mocks.dispatchApp,
  dispatchPlugin: mocks.dispatchPlugin
}));

vi.mock('@fastgpt/service/core/workflow/dispatch/ai/agent/sub/tool', () => ({
  dispatchTool: mocks.dispatchTool
}));

vi.mock('@fastgpt/service/core/workflow/dispatch/ai/agent/sub/tool/utils', () => ({
  getAgentRuntimeTools: mocks.getAgentRuntimeTools
}));

vi.mock('@fastgpt/service/core/app/tool/systemTool/systemTool.repo', () => ({
  SystemToolRepo: {
    getInstance: () => ({
      getSystemToolDetail: mocks.getSystemToolDetail
    })
  }
}));

import { getExecuteTool } from '@fastgpt/service/core/workflow/dispatch/ai/agent/sub/utils';

const childAssistantMessages = [{ role: 'assistant' as const, content: 'child result' }];

const createContext = (toolType: 'workflow' | 'toolWorkflow') => ({
  getSubAppInfo: () => ({
    name: 'Child tool',
    avatar: 'avatar',
    toolDescription: 'Child tool description'
  }),
  getSubApp: () => ({
    type: toolType,
    id: 'child-app',
    name: 'Child tool',
    avatar: 'avatar',
    version: 'version-1',
    params: {},
    agentGeneratedInputKeys: []
  }),
  checkIsStopping: vi.fn(() => false),
  runningUserInfo: {
    teamId: 'team-1',
    tmbId: 'member-1'
  },
  runningAppInfo: {
    sourceType: 'app',
    sourceId: 'parent-app',
    teamId: 'team-1',
    tmbId: 'owner-1',
    name: 'Parent app'
  },
  chatId: 'chat-1',
  responseChatItemId: 'response-1',
  uid: 'user-1',
  variableState: {},
  externalProvider: {},
  lang: 'en',
  requestOrigin: undefined,
  mode: 'chat',
  timezone: 'UTC',
  retainDatasetCite: true,
  maxRunTimes: 20,
  workflowDispatchDeep: 0,
  params: {},
  stream: false,
  completionTools: [],
  nodeResponseSink: undefined,
  streamResponseFn: undefined
});

describe('getExecuteTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.dispatchApp.mockResolvedValue({
      response: 'workflow response',
      assistantMessages: childAssistantMessages,
      usages: []
    });
    mocks.dispatchPlugin.mockResolvedValue({
      response: 'plugin response',
      assistantMessages: childAssistantMessages,
      usages: []
    });
  });

  it.each([
    ['workflow', mocks.dispatchApp],
    ['toolWorkflow', mocks.dispatchPlugin]
  ] as const)('preserves assistantMessages from a %s sub app', async (toolType, dispatchMock) => {
    const executeTool = getExecuteTool(createContext(toolType) as any);

    const result = await executeTool({
      callId: 'call-1',
      toolId: 'child-app',
      args: '{}'
    });

    expect(result.assistantMessages).toEqual(childAssistantMessages);
    expect(dispatchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        app: expect.objectContaining({ id: 'child-app' })
      })
    );
  });
});
