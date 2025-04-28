import { describe, expect, it, vi } from 'vitest';
import { getMcpServerTools, callMcpServerTool } from '@/service/support/mcp/utils';
import { MongoMcpKey } from '@fastgpt/service/support/mcp/schema';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { authAppByTmbId } from '@fastgpt/service/support/permission/app/auth';
import { getAppLatestVersion } from '@fastgpt/service/core/app/version/controller';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { getUserChatInfoAndAuthTeamPoints } from '@fastgpt/service/support/permission/auth/team';
import { dispatchWorkFlow } from '@fastgpt/service/core/workflow/dispatch';
import { saveChat } from '@fastgpt/service/core/chat/saveChat';
import { createChatUsage } from '@fastgpt/service/support/wallet/usage/controller';

vi.mock('@fastgpt/service/support/mcp/schema', () => ({
  MongoMcpKey: {
    findOne: vi.fn().mockReturnValue({
      lean: vi.fn()
    })
  }
}));

vi.mock('@fastgpt/service/core/app/schema', () => ({
  MongoApp: {
    find: vi.fn().mockReturnValue({
      lean: vi.fn()
    })
  }
}));

vi.mock('@fastgpt/service/support/permission/app/auth', () => ({
  authAppByTmbId: vi.fn()
}));

vi.mock('@fastgpt/service/core/app/version/controller', () => ({
  getAppLatestVersion: vi.fn()
}));

vi.mock('@fastgpt/service/support/permission/auth/team', () => ({
  getUserChatInfoAndAuthTeamPoints: vi.fn()
}));

vi.mock('@fastgpt/service/core/workflow/dispatch', () => ({
  dispatchWorkFlow: vi.fn()
}));

vi.mock('@fastgpt/service/core/chat/saveChat', () => ({
  saveChat: vi.fn()
}));

vi.mock('@fastgpt/service/support/wallet/usage/controller', () => ({
  createChatUsage: vi.fn()
}));

describe('getMcpServerTools', () => {
  it('should return tools for valid key', async () => {
    const mockMcp = {
      tmbId: 'test-tmb-id',
      apps: [
        {
          appId: 'app1',
          toolName: 'Tool 1',
          description: 'Test tool 1'
        }
      ]
    };

    const mockApp = {
      _id: 'app1',
      name: 'Test App'
    };

    const mockVersion = {
      nodes: [
        {
          flowNodeType: FlowNodeTypeEnum.pluginInput,
          inputs: []
        }
      ],
      chatConfig: {}
    };

    vi.mocked(MongoMcpKey.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue(mockMcp)
    });

    vi.mocked(MongoApp.find).mockReturnValue({
      lean: vi.fn().mockResolvedValue([mockApp])
    });

    vi.mocked(authAppByTmbId).mockResolvedValue(undefined);
    vi.mocked(getAppLatestVersion).mockResolvedValue(mockVersion);

    const tools = await getMcpServerTools('test-key');

    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('Tool 1');
  });

  it('should reject for invalid key', async () => {
    vi.mocked(MongoMcpKey.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue(null)
    });

    await expect(getMcpServerTools('invalid-key')).rejects.toThrow();
  });
});

describe('callMcpServerTool', () => {
  it('should call plugin tool and return response', async () => {
    const mockMcp = {
      apps: [
        {
          appId: 'app1',
          toolName: 'Tool 1'
        }
      ]
    };

    const mockApp = {
      _id: 'app1',
      type: AppTypeEnum.plugin,
      teamId: 'team1',
      tmbId: 'tmb1',
      name: 'Test App'
    };

    const mockVersion = {
      nodes: [],
      edges: [],
      chatConfig: {}
    };

    const mockDispatchResponse = {
      flowUsages: [],
      assistantResponses: [],
      newVariables: {},
      flowResponses: [
        {
          moduleType: FlowNodeTypeEnum.pluginOutput,
          pluginOutput: { result: 'test output' }
        }
      ],
      durationSeconds: 1
    };

    vi.mocked(MongoMcpKey.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue(mockMcp)
    });

    vi.mocked(MongoApp.find).mockReturnValue({
      lean: vi.fn().mockResolvedValue([mockApp])
    });

    vi.mocked(getUserChatInfoAndAuthTeamPoints).mockResolvedValue({
      timezone: 'UTC',
      externalProvider: {}
    });
    vi.mocked(getAppLatestVersion).mockResolvedValue(mockVersion);
    vi.mocked(dispatchWorkFlow).mockResolvedValue(mockDispatchResponse);
    vi.mocked(saveChat).mockResolvedValue(undefined);
    vi.mocked(createChatUsage).mockResolvedValue(undefined);

    const response = await callMcpServerTool({
      key: 'test-key',
      toolName: 'Tool 1',
      inputs: {}
    });

    expect(response).toBe('{"result":"test output"}');
  });

  it('should call workflow tool and return response', async () => {
    const mockMcp = {
      apps: [
        {
          appId: 'app1',
          toolName: 'Tool 1'
        }
      ]
    };

    const mockApp = {
      _id: 'app1',
      type: AppTypeEnum.workflow,
      teamId: 'team1',
      tmbId: 'tmb1',
      name: 'Test App'
    };

    const mockVersion = {
      nodes: [],
      edges: [],
      chatConfig: {}
    };

    const mockDispatchResponse = {
      flowUsages: [],
      assistantResponses: [
        {
          text: {
            content: 'test response'
          }
        }
      ],
      newVariables: {},
      flowResponses: [],
      durationSeconds: 1
    };

    vi.mocked(MongoMcpKey.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue(mockMcp)
    });

    vi.mocked(MongoApp.find).mockReturnValue({
      lean: vi.fn().mockResolvedValue([mockApp])
    });

    vi.mocked(getUserChatInfoAndAuthTeamPoints).mockResolvedValue({
      timezone: 'UTC',
      externalProvider: {}
    });
    vi.mocked(getAppLatestVersion).mockResolvedValue(mockVersion);
    vi.mocked(dispatchWorkFlow).mockResolvedValue(mockDispatchResponse);
    vi.mocked(saveChat).mockResolvedValue(undefined);
    vi.mocked(createChatUsage).mockResolvedValue(undefined);

    const response = await callMcpServerTool({
      key: 'test-key',
      toolName: 'Tool 1',
      inputs: {
        question: 'test question'
      }
    });

    expect(response).toBe('test response');
  });

  it('should reject for invalid key', async () => {
    vi.mocked(MongoMcpKey.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue(null)
    });

    await expect(
      callMcpServerTool({
        key: 'invalid-key',
        toolName: 'Tool 1',
        inputs: {}
      })
    ).rejects.toThrow();
  });

  it('should reject for invalid tool name', async () => {
    const mockMcp = {
      apps: [
        {
          appId: 'app1',
          toolName: 'Tool 1'
        }
      ]
    };

    vi.mocked(MongoMcpKey.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue(mockMcp)
    });

    vi.mocked(MongoApp.find).mockReturnValue({
      lean: vi.fn().mockResolvedValue([])
    });

    await expect(
      callMcpServerTool({
        key: 'test-key',
        toolName: 'Invalid Tool',
        inputs: {}
      })
    ).rejects.toThrow();
  });
});
