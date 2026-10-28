import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  pluginNodes2InputSchema,
  workflow2InputSchema,
  getMcpServerTools,
  callMcpServerTool
} from '@/service/support/mcp/utils';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { MongoMcpKey } from '@fastgpt/service/support/mcp/schema';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { authAppByTmbId } from '@fastgpt/service/support/permission/app/auth';
import { getAppLatestVersion } from '@fastgpt/service/core/app/version/controller';
import { dispatchWorkFlow } from '@fastgpt/service/core/workflow/dispatch';
import { preChatRound } from '@fastgpt/service/core/chat/utils/prepare';
import { finalizeChatRound } from '@fastgpt/service/core/chat/saveChat';

vi.mock('@fastgpt/service/support/mcp/schema', () => ({
  MongoMcpKey: {
    findOne: vi.fn().mockReturnValue({
      lean: vi.fn()
    })
  }
}));

vi.mock('@fastgpt/service/core/app/schema', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/core/app/schema')>();

  return {
    ...actual,
    MongoApp: {
      find: vi.fn().mockReturnValue({
        lean: vi.fn()
      })
    }
  };
});

vi.mock('@fastgpt/service/support/permission/app/auth', () => ({
  authAppByTmbId: vi.fn()
}));

vi.mock('@fastgpt/service/core/app/version/controller', () => ({
  getAppLatestVersion: vi.fn()
}));

vi.mock('@fastgpt/service/support/user/team/utils', () => ({
  getUserChatInfo: vi.fn(),
  getRunningUserInfoByTmbId: vi.fn(),
  getUserIdByTmbId: vi.fn()
}));

vi.mock('@fastgpt/service/core/workflow/dispatch', () => ({
  dispatchWorkFlow: vi.fn()
}));

vi.mock('@fastgpt/service/support/wallet/sub/utils', () => ({
  getTeamPlanStatus: vi.fn(async () => ({ standard: { maxUploadFileCount: 20 } })),
  // 频率限制读取团队 QPM 配置；返回 undefined 表示使用系统默认值。
  teamQPM: { getTeamQPMLimit: vi.fn(async () => undefined) }
}));

vi.mock('@fastgpt/service/core/chat/saveChat', () => ({
  finalizeChatRound: vi.fn(),
  failChatRound: vi.fn()
}));

vi.mock('@fastgpt/service/core/chat/utils/prepare', () => ({
  preChatRound: vi.fn()
}));

const profilingMocks = vi.hoisted(() => ({
  markProfileError: vi.fn()
}));

vi.mock('@fastgpt/service/common/profiling', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/common/profiling')>();

  return {
    ...actual,
    markProfileError: profilingMocks.markProfileError
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('pluginNodes2InputSchema', () => {
  it('should generate input schema from plugin nodes', () => {
    const nodes = [
      {
        flowNodeType: FlowNodeTypeEnum.pluginInput,
        inputs: [
          {
            key: 'testKey',
            valueType: 'string',
            description: 'test description',
            required: true,
            enum: 'a\nb\nc'
          }
        ]
      }
    ];

    const schema = pluginNodes2InputSchema(nodes);

    expect(schema).toEqual({
      type: 'object',
      properties: {
        testKey: {
          type: 'string',
          description: 'test description',
          enum: ['a', 'b', 'c']
        }
      },
      required: ['testKey']
    });
  });

  it('should handle empty plugin input nodes', () => {
    const nodes = [
      {
        flowNodeType: FlowNodeTypeEnum.pluginInput,
        inputs: []
      }
    ];

    const schema = pluginNodes2InputSchema(nodes);

    expect(schema).toEqual({
      type: 'object',
      properties: {},
      required: []
    });
  });
});

describe('workflow2InputSchema', () => {
  it('should generate input schema with file config', () => {
    const chatConfig = {
      fileSelectConfig: {
        canSelectFile: true,
        canSelectImg: true
      },
      variables: [
        {
          key: 'var1',
          valueType: 'string',
          description: 'test var',
          required: true,
          enums: [{ value: 'a' }, { value: 'b' }]
        }
      ]
    };

    const schema = workflow2InputSchema(chatConfig);

    expect(schema).toEqual({
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: 'Question from user'
        },
        fileUrlList: {
          type: 'array',
          items: {
            type: 'string'
          },
          description: 'File linkage'
        },
        var1: {
          type: 'string',
          description: 'test var',
          enum: ['a', 'b']
        }
      },
      required: ['question', 'var1']
    });
  });
});

describe('getMcpServerTools', () => {
  it('should return tools list', async () => {
    const mockMcp = {
      tmbId: 'test-tmb',
      apps: [
        {
          appId: 'test-app',
          toolName: 'test-tool',
          description: 'test description'
        }
      ]
    };

    vi.mocked(MongoMcpKey.findOne).mockReturnValue({
      lean: () => mockMcp
    });

    vi.mocked(MongoApp.find).mockReturnValue({
      lean: () => [
        {
          _id: 'test-app',
          name: 'Test App',
          type: AppTypeEnum.workflowTool
        }
      ]
    });

    vi.mocked(authAppByTmbId).mockResolvedValue(undefined);

    vi.mocked(getAppLatestVersion).mockResolvedValue({
      nodes: [
        {
          flowNodeType: FlowNodeTypeEnum.pluginInput,
          inputs: []
        }
      ],
      edges: [],
      chatConfig: {}
    });

    const tools = await getMcpServerTools('test-key');

    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('test-tool');
  });

  it('should use MCP key bindings as runtime tool snapshot', async () => {
    const mockMcp = {
      tmbId: 'test-tmb',
      apps: [
        {
          appId: 'test-app',
          toolName: 'test-tool',
          description: 'test description'
        }
      ]
    };

    vi.mocked(MongoMcpKey.findOne).mockReturnValue({
      lean: () => mockMcp
    });

    vi.mocked(MongoApp.find).mockReturnValue({
      lean: () => [
        {
          _id: 'test-app',
          name: 'Test App',
          type: AppTypeEnum.workflowTool
        }
      ]
    });

    vi.mocked(authAppByTmbId).mockRejectedValue(new Error('unAuthApp'));

    vi.mocked(getAppLatestVersion).mockResolvedValue({
      nodes: [
        {
          flowNodeType: FlowNodeTypeEnum.pluginInput,
          inputs: []
        }
      ],
      edges: [],
      chatConfig: {}
    });

    const tools = await getMcpServerTools('test-key');

    expect(authAppByTmbId).not.toHaveBeenCalled();
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('test-tool');
  });

  it('should reject if key not found', async () => {
    vi.mocked(MongoMcpKey.findOne).mockReturnValue({
      lean: () => null
    });

    await expect(getMcpServerTools('invalid-key')).rejects.toBe(CommonErrEnum.invalidResource);
  });
});

describe('callMcpServerTool profiling', () => {
  const setupToolCall = (workflowRuntimeSummary: Record<string, unknown>) => {
    vi.mocked(MongoMcpKey.findOne).mockReturnValue({
      lean: () => ({
        teamId: 'test-team',
        tmbId: 'test-tmb',
        authProxy: false,
        apps: [{ appId: 'test-app', toolName: 'test-tool', description: 'desc' }]
      })
    });

    vi.mocked(MongoApp.find).mockReturnValue({
      lean: () => [
        {
          _id: 'test-app',
          name: 'Test App',
          type: AppTypeEnum.workflow,
          teamId: 'test-team',
          tmbId: 'test-tmb'
        }
      ]
    });

    vi.mocked(authAppByTmbId).mockResolvedValue(undefined as any);
    vi.mocked(getAppLatestVersion).mockResolvedValue({
      versionId: 'v1',
      nodes: [
        {
          nodeId: 'start',
          name: 'start',
          flowNodeType: FlowNodeTypeEnum.workflowStart,
          inputs: [],
          outputs: []
        }
      ],
      edges: [],
      chatConfig: {},
      resources: []
    } as any);
    vi.mocked(preChatRound).mockResolvedValue({
      chatId: 'chat-1',
      responseChatItemId: 'resp-1',
      shouldPersistChatRound: true,
      shouldFinalizePreparedRound: true
    } as any);
    vi.mocked(finalizeChatRound).mockResolvedValue(undefined as any);
    vi.mocked(dispatchWorkFlow).mockResolvedValue({
      assistantResponses: [],
      newVariables: {},
      durationSeconds: 1,
      system_memories: {},
      workflowRuntimeSummary
    } as any);
  };

  it('marks the profile as failed when the root workflow reports an error', async () => {
    setupToolCall({ hasError: true, errorText: 'node failed' });

    await callMcpServerTool({
      key: 'test-key',
      toolName: 'test-tool',
      inputs: { question: 'hi' }
    } as any);

    expect(profilingMocks.markProfileError).toHaveBeenCalledWith('node failed');
  });

  it('does not mark failures for a successful workflow', async () => {
    setupToolCall({ hasError: false });

    await callMcpServerTool({
      key: 'test-key',
      toolName: 'test-tool',
      inputs: { question: 'hi' }
    } as any);

    expect(profilingMocks.markProfileError).not.toHaveBeenCalled();
  });
});
