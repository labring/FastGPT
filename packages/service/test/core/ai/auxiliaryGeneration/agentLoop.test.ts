import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuxiliaryGenerationEventEnum } from '@fastgpt/global/core/ai/auxiliaryGeneration/constants';

const { runAgentLoopMock } = vi.hoisted(() => ({
  runAgentLoopMock: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/llm/agentLoop/interface', async (importOriginal) => ({
  ...(await importOriginal()),
  runAgentLoop: runAgentLoopMock
}));

import { runAuxiliaryGenerationAgentLoop } from '@fastgpt/service/core/ai/auxiliaryGeneration/agentLoop';

describe('runAuxiliaryGenerationAgentLoop', () => {
  beforeEach(() => {
    runAgentLoopMock.mockReset();
  });

  it('uses ask without plan and preserves pause state', async () => {
    const streamWriter = vi.fn();
    const executeTool = vi.fn();
    const providerState = { pendingMainContext: { askToolCallId: 'ask_1' } };
    const nextProviderState = { pendingMainContext: { askToolCallId: 'ask_2' } };
    runAgentLoopMock.mockImplementation(async ({ runtime }) => {
      runtime.emitEvent({ type: 'reasoning_delta', text: '分析中' });
      runtime.emitEvent({ type: 'answer_delta', text: '处理中' });
      return {
        status: 'paused',
        pause: {
          type: 'ask',
          askId: 'ask_2',
          ask: {
            reason: '需要选择',
            blockerType: 'user_choice',
            questions: [
              {
                question: '选择范围？',
                options: [
                  { summary: '小', value: '小范围' },
                  { summary: '大', value: '大范围' }
                ]
              }
            ]
          }
        },
        providerState: nextProviderState,
        completeMessages: [],
        assistantMessages: [
          { role: 'assistant', reasoning_content: '分析中' },
          { role: 'assistant', content: '处理中' }
        ],
        requestIds: [],
        finishReason: 'tool_calls',
        usages: []
      };
    });

    const result = await runAuxiliaryGenerationAgentLoop({
      teamId: 'team_1',
      model: 'gpt-4o',
      systemPrompt: 'helper prompt',
      messages: [{ role: 'user', content: '创建客服 Agent' }],
      providerState,
      userAnswer: JSON.stringify({ answers: ['小范围'] }),
      runtimeTools: [
        {
          type: 'function',
          function: {
            name: 'generate_config',
            description: 'Generate config',
            parameters: { type: 'object', properties: {} }
          }
        }
      ],
      executeTool,
      streamWriter
    });

    expect(runAgentLoopMock).toHaveBeenCalledWith(
      expect.objectContaining({
        runtime: expect.objectContaining({
          llmParams: expect.objectContaining({
            forceMediaToBase64: true
          }),
          systemTools: {
            ask: { enabled: true }
          },
          toolCatalog: expect.objectContaining({
            runtimeTools: expect.arrayContaining([
              expect.objectContaining({
                function: expect.objectContaining({ name: 'generate_config' })
              })
            ])
          }),
          executeTool
        }),
        input: {
          systemPrompt: 'helper prompt',
          messages: [{ role: 'user', content: '创建客服 Agent' }],
          providerState,
          userAnswer: JSON.stringify({ answers: ['小范围'] })
        }
      })
    );
    expect(runAgentLoopMock.mock.calls[0][0].runtime.systemTools.plan).toBeUndefined();
    expect(result).toEqual(
      expect.objectContaining({
        status: 'paused',
        pause: expect.objectContaining({ askId: 'ask_2' }),
        providerState: nextProviderState,
        answerText: '处理中',
        reasoningText: '分析中'
      })
    );
    expect(streamWriter).toHaveBeenCalledWith(
      expect.objectContaining({ event: AuxiliaryGenerationEventEnum.answer })
    );
  });
});
