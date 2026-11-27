import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultQAModels } from '@fastgpt/global/core/ai/constants';

const { providerRunMock } = vi.hoisted(() => ({
  providerRunMock: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/llm/agentLoop/provider/fastAgent', () => ({
  fastAgentProvider: {
    name: 'fastAgent',
    run: providerRunMock
  }
}));

import { runAgentLoop } from '@fastgpt/service/core/ai/llm/agentLoop/interface/run';

describe('runAgentLoop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses pushed usages as the read-only result without repeating billing callbacks', async () => {
    const llmUsage = {
      moduleName: 'agent_call',
      inputTokens: 10,
      outputTokens: 2,
      totalPoints: 1
    };
    const toolUsage = {
      moduleName: 'tool',
      inputTokens: 3,
      outputTokens: 1,
      totalPoints: 0.5
    };
    const usagePush = vi.fn();
    providerRunMock.mockImplementation(async ({ runtime }) => {
      runtime.usagePush([llmUsage]);
      runtime.usagePush([toolUsage]);
      return {
        status: 'done',
        completeMessages: [],
        assistantMessages: [],
        requestIds: ['req_1'],
        finishReason: 'stop',
        usages: [
          {
            moduleName: 'provider_aggregate',
            inputTokens: 13,
            outputTokens: 3,
            totalPoints: 1.5
          }
        ]
      };
    });

    const result = await runAgentLoop({
      input: { messages: [] },
      runtime: {
        teamId: 'team_1',
        llmParams: { model: defaultQAModels[0] },
        toolCatalog: { runtimeTools: [] },
        executeTool: vi.fn(),
        usagePush
      }
    });

    expect(usagePush).toHaveBeenNthCalledWith(1, [llmUsage]);
    expect(usagePush).toHaveBeenNthCalledWith(2, [toolUsage]);
    expect(usagePush).toHaveBeenCalledTimes(2);
    expect(result.usages).toEqual([llmUsage, toolUsage]);
  });

  it('keeps provider result usages when the provider emitted no usage callback', async () => {
    const providerUsage = {
      moduleName: 'legacy_provider',
      inputTokens: 1,
      outputTokens: 0,
      totalPoints: 0.1
    };
    providerRunMock.mockResolvedValue({
      status: 'done',
      completeMessages: [],
      assistantMessages: [],
      requestIds: [],
      finishReason: 'stop',
      usages: [providerUsage]
    });

    const result = await runAgentLoop({
      input: { messages: [] },
      runtime: {
        teamId: 'team_1',
        llmParams: { model: defaultQAModels[0] },
        toolCatalog: { runtimeTools: [] },
        executeTool: vi.fn()
      }
    });

    expect(result.usages).toEqual([providerUsage]);
  });

  it('normalizes an unexpected fastAgent rejection', async () => {
    providerRunMock.mockRejectedValue(new Error('provider crashed'));

    const result = await runAgentLoop({
      input: {
        messages: [{ role: 'user', content: 'hello' }]
      },
      runtime: {
        teamId: 'team_1',
        llmParams: { model: defaultQAModels[0] },
        toolCatalog: { runtimeTools: [] },
        executeTool: vi.fn()
      }
    });

    expect(result).toMatchObject({
      status: 'error',
      error: expect.objectContaining({ message: 'provider crashed' }),
      completeMessages: [{ role: 'user', content: 'hello' }],
      assistantMessages: [],
      requestIds: [],
      finishReason: 'error',
      usages: []
    });
  });
});
