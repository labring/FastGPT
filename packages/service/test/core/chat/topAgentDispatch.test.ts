import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AGENT_SANDBOX_TOOLSET_ID } from '@fastgpt/global/core/ai/sandbox/tools';
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

vi.mock('@fastgpt/service/core/app/tool/controller', () => ({
  getSystemToolsWithInstalled: vi.fn(async () => []),
  getMyTools: vi.fn(async () => [])
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
        enableSandboxEnabled: true
      })
    });
  });
});
