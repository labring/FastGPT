import { createAgentLoopCoreAssistantEventCollector } from '@fastgpt/service/core/workflow/dispatch/ai/agentLoopCore/adapter/assistantResponses/eventCollector';
import { describe, expect, it } from 'vitest';
import { WORKFLOW_BUILDER_PREVIEW_TOOL_NAME } from '@fastgpt/global/core/workflow/builder/constants';
import { AIChatItemValueSchema } from '@fastgpt/global/core/chat/type';

const call = (id: string, name = 'search', args = '{}') => ({
  id,
  type: 'function' as const,
  function: { name, arguments: args }
});
const end = (requestId: string, toolCalls: ReturnType<typeof call>[] = []) => ({
  type: 'llm_request_end' as const,
  requestId,
  requestIndex: 1,
  modelName: 'Model',
  finishReason: 'stop' as const,
  toolCalls,
  seconds: 0
});
const plan = {
  planId: 'plan',
  name: 'Work',
  steps: [{ id: 'step', name: 'Build', status: 'in_progress' as const }]
};

describe('createAgentLoopCoreAssistantEventCollector', () => {
  it.each([true, false])(
    'persists boolean visibility for reasoning responses: %s',
    (showReasoning) => {
      const collector = createAgentLoopCoreAssistantEventCollector({ showReasoning });
      collector.emitEvent({
        ...end('reasoning', [call('hidden')]),
        reasoningText: 'Reasoning stays visible unless explicitly hidden'
      });
      collector.emitEvent({
        type: 'tool_run_end',
        call: call('hidden'),
        response: 'Internal result',
        hideInUI: true,
        seconds: 0
      });
      const [value] = collector.assistantResponses;
      // Mixed 字段中的 undefined 在 Mongo 写入时可能变成 null，必须保存明确的布尔值。
      expect(value.hideInUI).toBe(!showReasoning);
      expect(AIChatItemValueSchema.safeParse(value).success).toBe(true);
    }
  );

  it.each([undefined, 'missing-arguments'])(
    'ignores Ask events without original call data: %s',
    (id) => {
      const collector = createAgentLoopCoreAssistantEventCollector();
      collector.emitEvent({
        type: 'tool_interactive',
        call: {
          id: id,
          type: 'function',
          function: {
            name: 'ask_user',
            arguments: JSON.stringify({
              reason: 'Legacy input',
              blockerType: 'user_choice',
              questions: []
            })
          }
        },
        interactive: {
          type: 'agentAsk',
          params: {
            toolCallId: id,
            arguments: JSON.stringify({
              reason: 'Legacy input',
              blockerType: 'user_choice',
              questions: []
            })
          }
        }
      });
      expect(collector.assistantResponses).toEqual([]);
    }
  );

  it('keeps text, reasoning and streamed tools in one response with final parameters and original call order', () => {
    const collector = createAgentLoopCoreAssistantEventCollector({
      showReasoning: false,
      getToolInfo: (name) => ({ name, avatar: 'icon' })
    });
    collector.emitEvent({
      type: 'llm_request_start',
      responseId: 'response',
      requestIndex: 1,
      modelName: 'Model'
    });
    collector.emitEvent({ type: 'reasoning_delta', text: 'Think' });
    collector.emitEvent({ type: 'answer_delta', text: 'Search' });
    collector.emitEvent({ type: 'tool_call', call: call('a') });
    collector.emitEvent({ type: 'tool_params', callId: 'a', argsDelta: 'partial' });
    collector.emitEvent({
      ...end('request', [call('a'), call('b')]),
      responseId: 'response',
      answerText: 'Search',
      reasoningText: 'Think'
    });
    collector.emitEvent({ type: 'tool_run_end', call: call('b'), response: 'B', seconds: 0 });
    collector.emitEvent({ type: 'tool_run_end', call: call('a'), response: 'A', seconds: 0 });
    collector.emitEvent({ ...end('request'), responseId: 'response', answerText: 'duplicate' });
    expect(collector.assistantResponses).toEqual([
      {
        modelResponseId: 'response',
        hideInUI: false,
        hideReason: true,
        text: { content: 'Search' },
        reasoning: { content: 'Think' },
        toolCallIds: ['a', 'b'],
        tools: [
          expect.objectContaining({ id: 'a', params: '{}', response: 'A' }),
          expect.objectContaining({ id: 'b', response: 'B' })
        ]
      }
    ]);
  });

  it.each([true, false])(
    'persists plan tools and only successful state snapshots: %s',
    (success) => {
      const collector = createAgentLoopCoreAssistantEventCollector({
        metaEventNames: { setPlanToolName: 'custom_set_plan' }
      });
      const base = {
        type: 'plan_operation' as const,
        operation: 'set_plan' as const,
        id: 'plan-call',
        params: '{}',
        message: 'plan result'
      };
      collector.emitEvent(success ? { ...base, success: true, plan } : { ...base, success: false });
      expect(collector.assistantResponses[0]).toMatchObject({
        tools: [{ functionName: 'custom_set_plan', response: 'plan result', hideInUI: true }],
        ...(success ? { plan } : { hideInUI: true })
      });
      if (!success) expect(collector.assistantResponses[0]).not.toHaveProperty('plan');
    }
  );

  it('marks child display separately, ignores duplicate end events and starts a new parent response', () => {
    const collector = createAgentLoopCoreAssistantEventCollector();
    collector.emitEvent({ ...end('first', [call('parent')]), answerText: 'Before' });
    collector.emitEvent({
      type: 'tool_run_end',
      call: call('parent'),
      response: 'Parent context',
      assistantResponses: [{ text: { content: 'Child display' } }],
      seconds: 0
    });
    collector.emitEvent({
      type: 'tool_run_end',
      call: call('parent'),
      response: 'Duplicate',
      assistantResponses: [{ text: { content: 'Duplicate child' } }],
      seconds: 0
    });
    collector.emitEvent({ ...end('second'), answerText: 'After' });
    expect(collector.assistantResponses).toMatchObject([
      { text: { content: 'Before' }, tools: [{ response: 'Parent context' }] },
      { displayOnly: true, text: { content: 'Child display' } },
      { text: { content: 'After' } }
    ]);
    expect(collector.assistantResponses[0].modelResponseId).not.toBe(
      collector.assistantResponses[2].modelResponseId
    );
  });

  it('persists failures without hiding details from model context', () => {
    const collector = createAgentLoopCoreAssistantEventCollector({ showReasoning: false });
    collector.emitEvent({ type: 'reasoning_delta', text: 'Private reasoning' });
    collector.emitEvent({
      type: 'tool_run_end',
      call: call('invalid', 'ask_user', 'invalid JSON'),
      response: 'Invalid arguments',
      hideInUI: true,
      seconds: 0
    });
    expect(collector.assistantResponses[0]).toMatchObject({
      hideInUI: true,
      tools: [{ params: 'invalid JSON', response: 'Invalid arguments', hideInUI: true }]
    });
    expect(collector.assistantResponses[0].tools?.[0]).not.toHaveProperty('hideDetails');
  });

  it('keeps activity-only records separate from complete model tool context', () => {
    const collector = createAgentLoopCoreAssistantEventCollector();
    collector.emitEvent({ type: 'tool_params', callId: 'unknown', argsDelta: 'ignored' });
    collector.emitEvent({
      type: 'tool_activity',
      callId: 'activity',
      toolName: 'read_file',
      status: 'running'
    });
    collector.emitEvent({
      type: 'tool_activity',
      callId: 'activity',
      toolName: 'read_file',
      status: 'done'
    });
    expect(collector.assistantResponses).toMatchObject([
      { tools: [{ id: 'activity', hideDetails: true, params: '', response: '' }] }
    ]);
  });

  it.each([false, true])(
    'stores raw Ask arguments once, with explicit event params: %s',
    (explicitParams) => {
      const collector = createAgentLoopCoreAssistantEventCollector();
      const ask = {
        reason: 'Need input',
        blockerType: 'ambiguous_goal',
        questions: [
          {
            question: 'Which?',
            options: [
              { summary: 'A', value: 'A' },
              { summary: 'B', value: 'B' }
            ]
          }
        ]
      } as const;
      const argumentsText = JSON.stringify(ask, null, 2);
      const originalCall = call('ask', 'ask_user');
      originalCall.function.arguments = argumentsText;
      collector.emitEvent(end('ask-response', [originalCall]));
      collector.emitEvent({
        type: 'tool_interactive',
        call: {
          id: 'ask',
          type: 'function',
          function: { name: 'ask_user', arguments: argumentsText }
        },
        interactive: { type: 'agentAsk', params: { toolCallId: 'ask', arguments: argumentsText } }
      });
      collector.emitEvent({
        type: 'tool_run_end',
        call: call('ask', 'ask_user'),
        response: 'Waiting',
        seconds: 0
      });
      expect(collector.assistantResponses).toHaveLength(1);
      expect(collector.assistantResponses[0]).toMatchObject({
        interactive: { type: 'agentAsk', params: { toolCallId: 'ask', arguments: argumentsText } }
      });
      expect(collector.assistantResponses[0]).not.toHaveProperty('tools');
      expect(collector.assistantResponses[0]).not.toHaveProperty('agentAsk');
    }
  );

  it('deduplicates checkpoints and separates the next response from compressed history', () => {
    const collector = createAgentLoopCoreAssistantEventCollector();
    collector.emitEvent({ type: 'answer_delta', text: 'Before' });
    const checkpoint = {
      type: 'after_message_compress' as const,
      modelName: 'Model',
      requestIds: ['compress'],
      seconds: 0,
      contextCheckpoint: 'Summary'
    };
    collector.emitEvent(checkpoint);
    collector.emitEvent(checkpoint);
    collector.emitEvent({ type: 'answer_delta', text: 'After' });
    expect(collector.assistantResponses).toMatchObject([
      { text: { content: 'Before' } },
      { contextCheckpoint: 'Summary', hideInUI: true },
      { text: { content: 'After' } }
    ]);
  });
});
