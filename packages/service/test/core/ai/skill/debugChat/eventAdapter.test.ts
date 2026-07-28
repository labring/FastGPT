import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { createSkillDebugEventAdapter } from '@fastgpt/service/core/ai/skill/debugChat/eventAdapter';
import { describe, expect, it, vi } from 'vitest';

describe('Skill Debug Agent Loop event adapter', () => {
  it('streams visible tools and builds ChatBox transcript plus node responses', () => {
    const streamWriter = vi.fn();
    const adapter = createSkillDebugEventAdapter({ streamWriter, lang: 'en' });
    const call = {
      id: 'call-1',
      type: 'function' as const,
      function: {
        name: 'sandbox_read_file',
        arguments: '{"path":"/workspace/SKILL.md"}'
      }
    };

    adapter.emitEvent({ type: 'answer_delta', text: 'working' });
    adapter.emitEvent({ type: 'tool_call', call });
    adapter.emitEvent({ type: 'tool_params', callId: call.id, argsDelta: call.function.arguments });
    adapter.emitEvent({
      type: 'tool_run_end',
      call,
      rawResponse: 'skill content',
      response: 'skill content',
      seconds: 0.2,
      usages: []
    });
    adapter.emitEvent({
      type: 'llm_request_end',
      requestIndex: 0,
      modelName: 'gpt-5',
      requestId: 'request-1',
      finishReason: 'stop',
      answerText: 'done',
      seconds: 0.5,
      usages: [
        {
          moduleName: 'Agent',
          model: 'gpt-5',
          inputTokens: 10,
          outputTokens: 2,
          totalPoints: 1
        }
      ]
    });

    const responses = adapter.buildAssistantResponses([
      { role: 'assistant', content: 'done', tool_calls: [call] },
      { role: 'tool', tool_call_id: call.id, content: 'skill content' }
    ]);

    expect(streamWriter).toHaveBeenCalledWith(
      expect.objectContaining({ event: SseResponseEventEnum.answer })
    );
    expect(streamWriter).toHaveBeenCalledWith(
      expect.objectContaining({ event: SseResponseEventEnum.toolCall, id: call.id })
    );
    expect(streamWriter).toHaveBeenCalledWith(
      expect.objectContaining({ event: SseResponseEventEnum.toolResponse, id: call.id })
    );
    expect(responses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: { content: 'done' } }),
        expect.objectContaining({
          tools: [
            expect.objectContaining({
              id: call.id,
              functionName: 'sandbox_read_file',
              response: 'skill content'
            })
          ]
        })
      ])
    );
    expect(adapter.nodeResponses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: call.id,
          moduleType: FlowNodeTypeEnum.tool,
          toolId: 'sandbox_read_file'
        }),
        expect.objectContaining({
          model: 'gpt-5',
          llmRequestIds: ['request-1'],
          totalPoints: 1
        })
      ])
    );
  });

  it('persists plan and ask metadata without exposing control tools as tool cards', () => {
    const streamWriter = vi.fn();
    const adapter = createSkillDebugEventAdapter({ streamWriter, lang: 'en' });
    const plan = {
      planId: 'plan-1',
      name: 'Edit skill',
      steps: [{ id: 'step-1', name: 'Inspect', status: 'in_progress' as const }]
    };

    adapter.emitEvent({ type: 'plan_status', status: 'generating' });
    adapter.emitEvent({
      type: 'plan_operation',
      operation: 'set_plan',
      success: true,
      id: 'plan-call',
      params: '{}',
      message: 'Plan created',
      seconds: 0,
      plan
    });
    adapter.emitEvent({
      type: 'ask_start',
      id: 'ask-call',
      params: '{}',
      seconds: 0,
      ask: {
        reason: 'Need a choice',
        blockerType: 'user_choice',
        questions: [
          {
            question: 'Choose one',
            options: [
              { summary: 'A', value: 'A' },
              { summary: 'B', value: 'B' }
            ]
          }
        ]
      }
    });

    const responses = adapter.buildAssistantResponses([
      {
        role: 'assistant',
        tool_calls: [
          {
            id: 'ask-call',
            type: 'function',
            function: { name: 'ask_user', arguments: '{}' }
          }
        ]
      }
    ]);

    expect(responses).toEqual(
      expect.arrayContaining([
        { plan },
        expect.objectContaining({
          agentPlanUpdate: expect.objectContaining({ id: 'plan-call' })
        }),
        expect.objectContaining({
          agentAsk: expect.objectContaining({ askId: 'ask-call', functionName: 'ask_user' })
        })
      ])
    );
    expect(JSON.stringify(responses)).not.toContain('"tools"');
    expect(streamWriter).toHaveBeenCalledWith(
      expect.objectContaining({ event: SseResponseEventEnum.planStatus })
    );
  });
});
