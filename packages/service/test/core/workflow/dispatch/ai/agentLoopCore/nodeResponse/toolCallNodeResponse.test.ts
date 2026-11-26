import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import { createAgentLoopCoreToolCallNodeResponse } from '@fastgpt/service/core/workflow/dispatch/ai/agentLoopCore/adapter/nodeResponse/toolCallNodeResponse';
import { describe, expect, it } from 'vitest';

describe('createAgentLoopCoreToolCallNodeResponse', () => {
  it('builds ToolCall node response with history preview and tool summary fields', () => {
    expect(
      createAgentLoopCoreToolCallNodeResponse({
        totalPoints: 3,
        toolCallInputTokens: 10,
        toolCallOutputTokens: 5,
        modelName: 'GPT-5',
        query: 'hello',
        completeMessages: [
          {
            role: ChatCompletionRequestMessageRoleEnum.User,
            content: 'history'
          }
        ],
        useVision: false,
        finishReason: 'stop',
        requestIds: ['req_1']
      })
    ).toEqual(
      expect.objectContaining({
        totalPoints: 3,
        toolCallInputTokens: 10,
        toolCallOutputTokens: 5,
        model: 'GPT-5',
        query: 'hello',
        finishReason: 'stop',
        llmRequestIds: ['req_1']
      })
    );
    expect(
      createAgentLoopCoreToolCallNodeResponse({
        totalPoints: 3,
        toolCallInputTokens: 10,
        toolCallOutputTokens: 5,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        modelName: 'GPT-5',
        query: 'hello',
        completeMessages: [],
        finishReason: 'stop',
        requestIds: []
      })
    ).not.toHaveProperty('childTotalPoints');

    const withCache = createAgentLoopCoreToolCallNodeResponse({
      totalPoints: 3,
      toolCallInputTokens: 100,
      toolCallOutputTokens: 20,
      cacheReadTokens: 60,
      cacheCreationTokens: 15,
      modelName: 'GPT-5',
      query: 'hello',
      completeMessages: [],
      finishReason: 'stop',
      requestIds: ['req_cache']
    });
    expect(withCache).toEqual(
      expect.objectContaining({
        cacheReadTokens: 60,
        cacheCreationTokens: 15
      })
    );

    const withoutCache = createAgentLoopCoreToolCallNodeResponse({
      totalPoints: 3,
      toolCallInputTokens: 100,
      toolCallOutputTokens: 20,
      cacheReadTokens: 0,
      cacheCreationTokens: undefined,
      modelName: 'GPT-5',
      query: 'hello',
      completeMessages: [],
      finishReason: 'stop',
      requestIds: []
    });
    expect(withoutCache).not.toHaveProperty('cacheReadTokens');
    expect(withoutCache).not.toHaveProperty('cacheCreationTokens');
  });
});
