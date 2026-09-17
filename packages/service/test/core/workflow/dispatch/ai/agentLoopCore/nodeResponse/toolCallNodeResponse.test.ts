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
        toolDetail: [{ moduleName: 'Tool' } as any],
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
        toolDetail: [{ moduleName: 'Tool' }],
        finishReason: 'stop',
        llmRequestIds: ['req_1']
      })
    );
    expect(
      createAgentLoopCoreToolCallNodeResponse({
        totalPoints: 3,
        toolCallInputTokens: 10,
        toolCallOutputTokens: 5,
        modelName: 'GPT-5',
        query: 'hello',
        completeMessages: [],
        finishReason: 'stop',
        requestIds: []
      })
    ).not.toHaveProperty('childTotalPoints');
  });
});
