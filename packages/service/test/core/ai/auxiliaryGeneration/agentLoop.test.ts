import { beforeEach, describe, expect, it, vi } from 'vitest';

const { runUnifiedAgentLoopMock } = vi.hoisted(() => ({
  runUnifiedAgentLoopMock: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/llm/agentLoop', () => ({
  runUnifiedAgentLoop: runUnifiedAgentLoopMock,
  createUpdatePlanTool: () => ({
    type: 'function',
    function: {
      name: 'update_plan',
      description: 'Update plan',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  }),
  createAskAgentTool: () => ({
    type: 'function',
    function: {
      name: 'ask_agent',
      description: 'Ask user',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  })
}));

import { runAuxiliaryGenerationAgentLoop } from '@fastgpt/service/core/ai/auxiliaryGeneration';

describe('runAuxiliaryGenerationAgentLoop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runUnifiedAgentLoopMock.mockResolvedValue({
      status: 'done',
      answerText: 'done',
      completeMessages: [],
      assistantMessages: [],
      requestIds: []
    });
  });

  it('throws config error when runtime tools are provided without executeTool', async () => {
    await expect(
      runAuxiliaryGenerationAgentLoop({
        teamId: 'team-id',
        model: 'gpt-4o',
        systemPrompt: '',
        messages: [],
        toolCatalog: {
          runtimeTools: [
            {
              type: 'function',
              function: {
                name: 'read_file',
                description: 'Read file',
                parameters: {
                  type: 'object',
                  properties: {}
                }
              }
            }
          ]
        } as any
      })
    ).rejects.toThrow('Auxiliary generation runtime tools require executeTool');
  });

  it('forwards one tool catalog with BYOK and pending ask context', async () => {
    const pendingMainContext = {
      messages: [],
      askToolCallId: 'call_ask'
    };
    const userKey = {
      baseUrl: 'https://provider.example/v1',
      key: 'provider-key'
    } as any;
    const executeTool = vi.fn();
    const toolCatalog = {
      runtimeTools: [
        {
          type: 'function',
          function: {
            name: 'read_file',
            description: 'Read file',
            parameters: { type: 'object', properties: {} }
          }
        }
      ],
      updatePlanTool: {
        type: 'function',
        function: {
          name: 'update_plan',
          description: 'Update plan',
          parameters: { type: 'object', properties: {} }
        }
      },
      askTool: {
        type: 'function',
        function: {
          name: 'ask_agent',
          description: 'Ask user',
          parameters: { type: 'object', properties: {} }
        }
      }
    } as any;

    await runAuxiliaryGenerationAgentLoop({
      teamId: 'team-id',
      userKey,
      model: 'gpt-4o',
      systemPrompt: 'system',
      messages: [],
      toolCatalog,
      executeTool,
      pendingMainContext,
      userAnswer: 'answer'
    });

    expect(runUnifiedAgentLoopMock).toHaveBeenCalledWith(
      expect.objectContaining({
        runtime: expect.objectContaining({
          userKey,
          toolCatalog,
          executeTool
        }),
        input: expect.objectContaining({
          systemPrompt: 'system',
          pendingMainContext,
          userAnswer: 'answer'
        })
      })
    );
  });

  it('suppresses fallback answer deltas while retaining reasoning deltas', async () => {
    const streamWriter = vi.fn();

    await runAuxiliaryGenerationAgentLoop({
      teamId: 'team-id',
      model: 'gpt-4o',
      systemPrompt: '',
      messages: [],
      streamWriter,
      streamAnswerDelta: false
    });

    const [{ runtime }] = runUnifiedAgentLoopMock.mock.calls[0];
    runtime.emitEvent({ type: 'answer_delta', text: 'hello' });
    runtime.emitEvent({ type: 'reasoning_delta', text: 'thinking' });

    expect(JSON.stringify(streamWriter.mock.calls)).not.toContain('hello');
    expect(JSON.stringify(streamWriter.mock.calls)).toContain('thinking');
  });
});
