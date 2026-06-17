import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AGENT_SANDBOX_TOOLSET_ID } from '@fastgpt/global/core/ai/sandbox/tools';
import { SubAppIds } from '@fastgpt/global/core/workflow/node/agent/constants';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';

const { createLLMResponseMock } = vi.hoisted(() => ({
  createLLMResponseMock: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/llm/request', () => ({
  createLLMResponse: createLLMResponseMock
}));

vi.mock('@fastgpt/service/core/ai/model', () => ({
  getDefaultHelperBotModel: vi.fn(() => ({
    model: 'helper-model'
  }))
}));

vi.mock('@fastgpt/service/core/app/tool/workflowTool', () => ({
  getUserAvaliableWorkflowTools: vi.fn(async () => [])
}));

vi.mock('@fastgpt/service/core/app/tool/systemTool/systemTool.repo', () => ({
  SystemToolRepo: {
    getInstance: vi.fn(() => ({
      getSystemToolList: vi.fn(async () => [])
    }))
  }
}));

vi.mock('@fastgpt/service/core/dataset/schema', () => ({
  MongoDataset: {
    find: vi.fn(() => ({
      select: vi.fn(() => ({
        sort: vi.fn(() => ({
          lean: vi.fn(async () => [])
        }))
      })),
      lean: vi.fn(async () => [])
    }))
  }
}));

vi.mock('@fastgpt/service/support/permission/schema', () => ({
  MongoResourcePermission: {
    find: vi.fn(() => ({
      lean: vi.fn(async () => [])
    }))
  }
}));

vi.mock('@fastgpt/service/support/permission/memberGroup/controllers', () => ({
  getGroupsByTmbId: vi.fn(async () => [])
}));

vi.mock('@fastgpt/service/support/permission/org/controllers', () => ({
  getOrgIdSetWithParentByTmbId: vi.fn(async () => new Set())
}));

import { dispatchTopAgent } from '@fastgpt/service/core/chat/HelperBot/dispatch/topAgent';

describe('dispatchTopAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockGenerationResponse = ({
    description,
    expectedTools
  }: {
    description: string;
    expectedTools: Array<{ id: string; type: 'tool' | 'knowledge' }>;
  }) => {
    createLLMResponseMock.mockResolvedValue({
      answerText: JSON.stringify({
        phase: 'generation',
        reasoning: 'generate agent config',
        task_analysis: {
          goal: 'build helper agent',
          role: 'assistant',
          key_features: 'use selected resources'
        },
        execution_plan: {
          total_steps: 1,
          steps: [
            {
              id: 'step_1',
              title: 'Use resource',
              description,
              expectedTools
            }
          ]
        },
        resources: {
          system_features: {
            file_upload: {
              enabled: false
            },
            sandbox: {
              enabled: false
            }
          }
        }
      }),
      reasoningText: '',
      usage: {
        inputTokens: 10,
        outputTokens: 5
      }
    });
  };

  const dispatchAndGetTopAgentConfig = async () => {
    const workflowResponseWrite = vi.fn();

    await dispatchTopAgent({
      query: 'build an agent with selected resources',
      files: [],
      data: {},
      histories: [],
      workflowResponseWrite,
      user: {
        teamId: 'team_1',
        tmbId: 'tmb_1',
        userId: 'user_1',
        isRoot: false,
        lang: 'zh-CN'
      }
    });

    const configEvent = workflowResponseWrite.mock.calls.find(
      ([payload]) => payload.event === SseResponseEventEnum.topAgentConfig
    );

    expect(configEvent).toBeDefined();
    return configEvent![0].data;
  };

  it('enables sandbox when generated plan selects the agent sandbox toolset', async () => {
    createLLMResponseMock.mockResolvedValue({
      answerText: JSON.stringify({
        phase: 'generation',
        reasoning: 'need sandbox',
        task_analysis: {
          goal: 'run code',
          role: 'coding assistant',
          key_features: 'execute shell commands'
        },
        execution_plan: {
          total_steps: 1,
          steps: [
            {
              id: 'step_1',
              title: 'Execute command',
              description: `Use @${AGENT_SANDBOX_TOOLSET_ID} to inspect files`,
              expectedTools: [
                {
                  id: AGENT_SANDBOX_TOOLSET_ID,
                  type: 'tool'
                }
              ]
            }
          ]
        },
        resources: {
          system_features: {
            file_upload: {
              enabled: false
            },
            sandbox: {
              enabled: false
            }
          }
        }
      }),
      reasoningText: '',
      usage: {
        inputTokens: 10,
        outputTokens: 5
      }
    });

    const workflowResponseWrite = vi.fn();

    await dispatchTopAgent({
      query: 'build an agent that can run commands',
      files: [],
      data: {},
      histories: [],
      workflowResponseWrite,
      user: {
        teamId: 'team_1',
        tmbId: 'tmb_1',
        userId: 'user_1',
        isRoot: false,
        lang: 'zh-CN'
      }
    });

    expect(workflowResponseWrite).toHaveBeenCalledWith({
      event: SseResponseEventEnum.topAgentConfig,
      data: expect.objectContaining({
        tools: [AGENT_SANDBOX_TOOLSET_ID],
        systemPrompt: expect.stringContaining(`{{@${AGENT_SANDBOX_TOOLSET_ID}@}}`),
        enableSandboxEnabled: true
      })
    });
  });

  it('renders bracketed tool references in generated step descriptions', async () => {
    const toolId = 'custom/search_tool';
    mockGenerationResponse({
      description: `使用 @[${toolId}] 搜索信息`,
      expectedTools: [
        {
          id: toolId,
          type: 'tool'
        }
      ]
    });

    const config = await dispatchAndGetTopAgentConfig();

    expect(config).toEqual(
      expect.objectContaining({
        tools: [toolId],
        systemPrompt: expect.stringContaining(`{{@${toolId}@}}`)
      })
    );
  });

  it('renders plain tool references in generated step descriptions', async () => {
    const toolId = 'custom/search_tool';
    mockGenerationResponse({
      description: `使用 @${toolId} 搜索信息`,
      expectedTools: [
        {
          id: toolId,
          type: 'tool'
        }
      ]
    });

    const config = await dispatchAndGetTopAgentConfig();

    expect(config).toEqual(
      expect.objectContaining({
        tools: [toolId],
        systemPrompt: expect.stringContaining(`{{@${toolId}@}}`)
      })
    );
  });

  it('renders knowledge references as dataset search skill labels', async () => {
    const datasetId = '507f1f77bcf86cd799439011';
    mockGenerationResponse({
      description: `使用 @[${datasetId}] 查询知识库`,
      expectedTools: [
        {
          id: datasetId,
          type: 'knowledge'
        }
      ]
    });

    const config = await dispatchAndGetTopAgentConfig();

    expect(config).toEqual(
      expect.objectContaining({
        systemPrompt: expect.stringContaining(`{{@${SubAppIds.datasetSearch}@}}`)
      })
    );
  });

  it('does not render system features as skill labels in generated step descriptions', async () => {
    mockGenerationResponse({
      description: `通过 @file_upload 接收文件，并使用 @${SubAppIds.readFiles} 读取内容，不要使用 @sandbox`,
      expectedTools: [
        {
          id: SubAppIds.readFiles,
          type: 'tool'
        }
      ]
    });

    const config = await dispatchAndGetTopAgentConfig();

    expect(config).toEqual(
      expect.objectContaining({
        tools: [SubAppIds.readFiles],
        systemPrompt: expect.stringContaining(`{{@${SubAppIds.readFiles}@}}`)
      })
    );
    expect(config.systemPrompt).toContain('通过 file_upload 接收文件');
    expect(config.systemPrompt).toContain('不要使用 sandbox');
    expect(config.systemPrompt).not.toContain('{{@file_upload@}}');
    expect(config.systemPrompt).not.toContain('{{@sandbox@}}');
  });
});
