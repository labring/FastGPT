import { describe, expect, it, vi } from 'vitest';
import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall
} from '@fastgpt/global/core/ai/llm/type';
import type { AgentLoopEvent } from '@fastgpt/service/core/ai/llm/agentLoop/domain/event';
import {
  createAgentLoopCoreToolEventFilter,
  type AgentLoopCoreToolEventFilterPolicy
} from '@fastgpt/service/core/workflow/dispatch/ai/agentLoopCore/adapter/toolEventFilter';

const publicCall: ChatCompletionMessageToolCall = {
  id: 'public',
  type: 'function',
  function: {
    name: 'sandbox_read_file',
    arguments: '{"path":"/workspace/research.md"}'
  }
};
const privateCall: ChatCompletionMessageToolCall = {
  ...publicCall,
  id: 'private',
  function: { ...publicCall.function, arguments: '{"path":"/workspace/transaction/workflow.json"}' }
};
const policy: AgentLoopCoreToolEventFilterPolicy = {
  shouldBuffer: (call) => call.function.name.startsWith('sandbox_'),
  shouldDiscard: (call) => call.function.arguments.includes('/transaction/')
};
const requestEnd = (
  toolCalls?: ChatCompletionMessageToolCall[]
): Extract<AgentLoopEvent, { type: 'llm_request_end' }> => ({
  type: 'llm_request_end',
  requestIndex: 1,
  requestId: 'request-1',
  modelName: 'test-model',
  finishReason: 'tool_calls',
  seconds: 1,
  toolCalls
});
const toolEnd = (
  call: ChatCompletionMessageToolCall
): Extract<AgentLoopEvent, { type: 'tool_run_end' }> => ({
  type: 'tool_run_end',
  call,
  rawResponse: 'tool result',
  response: 'tool result',
  seconds: 1
});

describe('createAgentLoopCoreToolEventFilter', () => {
  it('passes events and transcript through unchanged without a policy', () => {
    const emitEvent = vi.fn();
    const filter = createAgentLoopCoreToolEventFilter({ emitEvent });
    const event = requestEnd([privateCall]);
    const messages: ChatCompletionMessageParam[] = [
      { role: 'assistant', tool_calls: [privateCall] }
    ];

    filter.emitEvent(event);

    expect(emitEvent).toHaveBeenCalledExactlyOnceWith(event);
    expect(filter.filterMessages(messages)).toBe(messages);
  });

  it('preserves unrelated events and tools outside the buffering policy', () => {
    const emitEvent = vi.fn();
    const filter = createAgentLoopCoreToolEventFilter({ policy, emitEvent });
    const call = {
      ...privateCall,
      function: { ...privateCall.function, name: 'workflow_cli_query' }
    };
    const events: AgentLoopEvent[] = [
      { type: 'answer_delta', text: 'Visible answer' },
      requestEnd(),
      requestEnd([]),
      requestEnd([call]),
      { type: 'tool_call', call },
      { type: 'tool_params', callId: call.id, argsDelta: call.function.arguments },
      { type: 'tool_run_start', call },
      toolEnd(call)
    ];

    events.forEach(filter.emitEvent);

    expect(emitEvent.mock.calls.map(([event]) => event)).toEqual(events);
    const messages: ChatCompletionMessageParam[] = [{ role: 'assistant', tool_calls: [call] }];
    expect(filter.filterMessages(messages)).toBe(messages);
  });

  it('buffers streamed parameters until a public tool starts, then forwards events in order', () => {
    const emitEvent = vi.fn();
    const filter = createAgentLoopCoreToolEventFilter({ policy, emitEvent });
    const events: AgentLoopEvent[] = [
      {
        type: 'tool_call',
        call: { ...publicCall, function: { ...publicCall.function, arguments: '' } }
      },
      { type: 'tool_params', callId: publicCall.id, argsDelta: publicCall.function.arguments },
      { type: 'tool_run_start', call: publicCall },
      toolEnd(publicCall)
    ];

    events.slice(0, 2).forEach(filter.emitEvent);
    expect(emitEvent).not.toHaveBeenCalled();
    events.slice(2).forEach(filter.emitEvent);

    expect(emitEvent.mock.calls.map(([event]) => event)).toEqual(events);
  });

  it('hides private calls and their responses while preserving public calls and original messages', () => {
    const emitEvent = vi.fn();
    const filter = createAgentLoopCoreToolEventFilter({ policy, emitEvent });
    const request = requestEnd([privateCall, publicCall]);
    filter.emitEvent(request);
    filter.emitEvent({
      type: 'tool_call',
      call: { ...privateCall, function: { ...privateCall.function, arguments: '' } }
    });
    filter.emitEvent({
      type: 'tool_params',
      callId: privateCall.id,
      argsDelta: privateCall.function.arguments
    });
    filter.emitEvent({ type: 'tool_run_start', call: privateCall });
    filter.emitEvent({ type: 'tool_params', callId: privateCall.id, argsDelta: 'late chunk' });
    // 重复到达的执行边界也不能重新暴露内部调用。
    filter.emitEvent({ type: 'tool_run_start', call: privateCall });
    filter.emitEvent(toolEnd(privateCall));

    const messages: ChatCompletionMessageParam[] = [
      { role: 'user', content: 'Build a workflow' },
      { role: 'assistant', content: null, tool_calls: [privateCall, publicCall] },
      { role: 'tool', tool_call_id: privateCall.id, content: 'Internal access denied' },
      { role: 'tool', tool_call_id: publicCall.id, content: 'Research result' },
      { role: 'assistant', content: 'Visible answer' },
      { role: 'assistant', tool_calls: [] }
    ];
    const originalMessages = structuredClone(messages);

    expect(emitEvent.mock.calls.map(([event]) => event)).toEqual([
      { ...request, toolCalls: [publicCall] }
    ]);
    expect(filter.filterMessages(messages)).toEqual([
      messages[0],
      { ...messages[1], tool_calls: [publicCall] },
      messages[3],
      messages[4],
      messages[5]
    ]);
    expect(messages).toEqual(originalMessages);
    expect(request.toolCalls).toEqual([privateCall, publicCall]);
  });

  it.each([
    { boundary: 'start', call: publicCall, visible: true },
    { boundary: 'end', call: publicCall, visible: true },
    { boundary: 'start', call: privateCall, visible: false },
    { boundary: 'end', call: privateCall, visible: false }
  ])('handles a $visible call with only its $boundary boundary', ({ boundary, call, visible }) => {
    const emitEvent = vi.fn();
    const filter = createAgentLoopCoreToolEventFilter({ policy, emitEvent });
    const event: AgentLoopEvent =
      boundary === 'start' ? { type: 'tool_run_start', call } : toolEnd(call);

    filter.emitEvent(event);

    expect(emitEvent.mock.calls.map(([event]) => event)).toEqual(visible ? [event] : []);
    const messages: ChatCompletionMessageParam[] = [
      { role: 'tool', tool_call_id: call.id, content: 'Tool result' }
    ];
    expect(filter.filterMessages(messages)).toEqual(visible ? messages : []);
  });

  it.each([
    { name: 'text', output: { content: 'Visible answer' }, visible: true },
    { name: 'explicit empty text', output: { content: '' }, visible: true },
    { name: 'reasoning', output: { reasoning_content: 'Visible reasoning' }, visible: true },
    { name: 'interactive', output: { interactive: { type: 'agentPlanAskQuery' } }, visible: true },
    { name: 'audio', output: { audio: { id: 'audio-1' } }, visible: true },
    {
      name: 'legacy function call',
      output: { function_call: { name: 'legacy', arguments: '{}' } },
      visible: true
    },
    { name: 'refusal', output: { refusal: 'Cannot answer' }, visible: true },
    { name: 'null content', output: { content: null }, visible: false },
    { name: 'no other output', output: {}, visible: false }
  ])('preserves $name when removing the only tool call', ({ output, visible }) => {
    const filter = createAgentLoopCoreToolEventFilter({ policy, emitEvent: vi.fn() });
    filter.emitEvent(requestEnd([privateCall]));
    const message: ChatCompletionMessageParam = {
      role: 'assistant',
      tool_calls: [privateCall],
      ...output
    };

    expect(filter.filterMessages([message])).toEqual(
      visible ? [{ role: 'assistant', ...output }] : []
    );
  });
});
