import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall
} from '@fastgpt/global/core/ai/llm/type';
import { runAgentLoopApplication } from '@fastgpt/service/core/ai/llm/agentLoop/application/run';
import type { AgentLoopEvent } from '@fastgpt/service/core/ai/llm/agentLoop/domain/event';
import type { AgentLoopRuntime } from '@fastgpt/service/core/ai/llm/agentLoop/domain/runtime';
import type { AgentLoopSystemTools } from '@fastgpt/service/core/ai/llm/agentLoop/domain/tool';
import type { SandboxClient } from '@fastgpt/service/core/ai/sandbox/application/runtime/client';
import { describe, expect, it, vi } from 'vitest';

describe('runAgentLoopApplication tool visibility', () => {
  const publicCall: ChatCompletionMessageToolCall = {
    id: 'public',
    type: 'function',
    function: { name: 'sandbox_read_file', arguments: '{"path":"/workspace/research.md"}' }
  };
  const internalCall: ChatCompletionMessageToolCall = {
    ...publicCall,
    id: 'internal',
    function: { ...publicCall.function, arguments: '{"path":"/transaction/workflow.json"}' }
  };
  const visibility: NonNullable<AgentLoopSystemTools['sandbox']>['visibility'] = ({ args }) =>
    args.includes('/transaction/') ? 'internal' : 'public';
  const sandboxClient = {} as SandboxClient;
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
  /** 使用真实公共入口和内存 provider，检查外部事件与 provider 原始上下文的边界。 */
  const run = async ({
    events = [],
    messages = [],
    systemTools = { sandbox: { enabled: true, client: sandboxClient, visibility } },
    onEvent,
    reject = false,
    withEmitter = true
  }: {
    events?: AgentLoopEvent[];
    messages?: ChatCompletionMessageParam[];
    systemTools?: AgentLoopSystemTools;
    onEvent?: (index: number, forwarded: AgentLoopEvent[]) => void;
    reject?: boolean;
    withEmitter?: boolean;
  } = {}) => {
    const forwarded: AgentLoopEvent[] = [];
    const providerState = { messages };
    const result = await runAgentLoopApplication({
      input: { messages, providerState },
      runtime: {
        teamId: 'team',
        llmParams: { model: {} as AgentLoopRuntime['llmParams']['model'] },
        systemTools,
        toolCatalog: { runtimeTools: [] },
        executeTool: async () => ({ response: '', assistantMessages: [], usages: [] }),
        emitEvent: withEmitter
          ? (event) => {
              forwarded.push(event);
            }
          : undefined
      },
      provider: {
        name: 'fastAgent',
        run: async ({ input, runtime }) => {
          expect(input.messages).toBe(messages);
          expect(input.providerState).toBe(providerState);
          for (const [index, event] of events.entries()) {
            runtime.emitEvent?.(event);
            onEvent?.(index, forwarded);
          }
          if (reject) throw new Error('provider failed');
          return {
            status: 'done',
            completeMessages: messages,
            assistantMessages: messages,
            requestIds: [],
            finishReason: 'stop',
            usages: [],
            providerState
          };
        }
      }
    });
    expect(providerState.messages).toBe(messages);
    expect(result.providerState).toBe(providerState);
    return { result, forwarded };
  };

  it.each([
    {},
    { sandbox: { enabled: true, client: sandboxClient } },
    { sandbox: { enabled: true, client: sandboxClient, visibility: 'public' as const } },
    { sandbox: { enabled: false, client: sandboxClient, visibility: 'internal' as const } }
  ])('preserves default public tools and disabled configurations: %j', async (systemTools) => {
    const events: AgentLoopEvent[] = [
      { type: 'tool_call', call: internalCall },
      toolEnd(internalCall)
    ];
    const messages: ChatCompletionMessageParam[] = [
      { role: 'assistant', tool_calls: [internalCall] }
    ];
    const { result, forwarded } = await run({ events, messages, systemTools });
    expect(forwarded).toEqual(events);
    expect(result.completeMessages).toBe(messages);
    expect(result.assistantMessages).toBe(messages);
  });

  it('preserves unrelated events and tools outside the configured system tools', async () => {
    const call = {
      ...internalCall,
      function: { ...internalCall.function, name: 'workflow_cli_query' }
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
    expect((await run({ events })).forwarded).toEqual(events);
  });

  it.each(['request', 'start'] as const)(
    'buffers dynamic calls until complete parameters arrive at the %s boundary',
    async (boundary) => {
      const policy = vi.fn(visibility);
      const events: AgentLoopEvent[] = [
        {
          type: 'tool_call',
          call: { ...publicCall, function: { ...publicCall.function, arguments: '' } }
        },
        { type: 'tool_params', callId: publicCall.id, argsDelta: publicCall.function.arguments },
        ...(boundary === 'request' ? [requestEnd([publicCall])] : []),
        { type: 'tool_run_start', call: publicCall },
        toolEnd(publicCall)
      ];
      const { forwarded } = await run({
        events,
        systemTools: { sandbox: { enabled: true, client: sandboxClient, visibility: policy } },
        onEvent: (index, forwarded) => {
          if (index < 2) expect(forwarded).toEqual([]);
        }
      });
      expect(forwarded).toEqual(events);
      expect(policy).toHaveBeenCalledExactlyOnceWith({
        toolName: publicCall.function.name,
        args: publicCall.function.arguments
      });
    }
  );

  it('hides interleaved internal calls and responses while preserving public events and context', async () => {
    const events: AgentLoopEvent[] = [
      {
        type: 'tool_call',
        call: { ...internalCall, function: { ...internalCall.function, arguments: '' } }
      },
      {
        type: 'tool_call',
        call: { ...publicCall, function: { ...publicCall.function, arguments: '' } }
      },
      { type: 'tool_params', callId: internalCall.id, argsDelta: internalCall.function.arguments },
      { type: 'tool_params', callId: publicCall.id, argsDelta: publicCall.function.arguments },
      requestEnd([internalCall, publicCall]),
      { type: 'tool_run_start', call: internalCall },
      toolEnd(internalCall),
      { type: 'tool_params', callId: internalCall.id, argsDelta: 'late chunk' },
      { type: 'tool_run_start', call: publicCall },
      toolEnd(publicCall)
    ];
    const messages: ChatCompletionMessageParam[] = [
      { role: 'user', content: 'Build a workflow' },
      { role: 'assistant', content: null, tool_calls: [internalCall, publicCall] },
      { role: 'tool', tool_call_id: internalCall.id, content: 'Internal access denied' },
      { role: 'tool', tool_call_id: publicCall.id, content: 'Research result' },
      { role: 'assistant', content: 'Visible answer' },
      { role: 'assistant', tool_calls: [] }
    ];
    const original = structuredClone({ messages, events });
    const { result, forwarded } = await run({ events, messages });
    expect(forwarded).toEqual([
      events[1],
      events[3],
      { ...events[4], toolCalls: [publicCall] },
      events[8],
      events[9]
    ]);
    const expectedMessages = [
      messages[0],
      { ...messages[1], tool_calls: [publicCall] },
      ...messages.slice(3)
    ];
    expect(result.completeMessages).toEqual(expectedMessages);
    expect(result.assistantMessages).toEqual(expectedMessages);
    expect({ messages, events }).toEqual(original);
  });

  it.each([
    { boundary: 'start', call: publicCall, visible: true },
    { boundary: 'end', call: publicCall, visible: true },
    { boundary: 'start', call: internalCall, visible: false },
    { boundary: 'end', call: internalCall, visible: false }
  ])(
    'handles a $visible call with only its $boundary boundary',
    async ({ boundary, call, visible }) => {
      const event: AgentLoopEvent =
        boundary === 'start' ? { type: 'tool_run_start', call } : toolEnd(call);
      const messages: ChatCompletionMessageParam[] = [
        { role: 'tool', tool_call_id: call.id, content: 'result' }
      ];
      const { result, forwarded } = await run({ events: [event], messages });
      expect(forwarded).toEqual(visible ? [event] : []);
      expect(result.completeMessages).toEqual(visible ? messages : []);
    }
  );

  it.each([
    { output: { content: 'Visible answer' }, visible: true },
    { output: { content: '' }, visible: true },
    { output: { reasoning_content: 'Visible reasoning' }, visible: true },
    { output: { interactive: { type: 'agentPlanAskQuery' as const } }, visible: true },
    { output: { audio: { id: 'audio-1' } }, visible: true },
    { output: { function_call: { name: 'legacy', arguments: '{}' } }, visible: true },
    { output: { refusal: 'Cannot answer' }, visible: true },
    { output: { content: null }, visible: false },
    { output: {}, visible: false }
  ])('retains other assistant output when hiding tool calls: %j', async ({ output, visible }) => {
    const message: ChatCompletionMessageParam = {
      role: 'assistant',
      tool_calls: [internalCall],
      ...output
    };
    // 无事件的恢复路径也应清理对外消息，providerState 中的原始调用仍保留。
    const { result } = await run({ messages: [message] });
    expect(result.completeMessages).toEqual(visible ? [{ role: 'assistant', ...output }] : []);
  });

  it.each(['sandbox', 'readFile', 'datasetSearch'] as const)(
    'supports static internal visibility on %s without changing other tool groups',
    async (kind) => {
      const systemTools: AgentLoopSystemTools = {
        sandbox: { enabled: true, client: sandboxClient },
        readFile: {
          enabled: true,
          maxFileAmount: 1,
          execute: async () => ({ response: '', usages: [] })
        },
        datasetSearch: { enabled: true, execute: async () => ({ response: '', usages: [] }) }
      };
      systemTools[kind]!.visibility = 'internal';
      const names = {
        sandbox: 'sandbox_read_file',
        readFile: 'read_files',
        datasetSearch: 'dataset_search'
      };
      const calls = Object.values(names).map((name) => ({
        ...publicCall,
        id: name,
        function: { ...publicCall.function, name }
      }));
      const events: AgentLoopEvent[] = calls.flatMap((call) => [
        { type: 'tool_call', call },
        { type: 'tool_params', callId: call.id, argsDelta: call.function.arguments },
        { type: 'tool_run_start', call },
        toolEnd(call)
      ]);
      const { forwarded } = await run({ systemTools, events });
      expect(forwarded).toEqual(
        events.filter((event) =>
          event.type === 'tool_params'
            ? event.callId !== names[kind]
            : 'call' in event && event.call.function.name !== names[kind]
        )
      );
    }
  );

  it('keeps filtering the error fallback and supports calls without an event subscriber', async () => {
    const messages: ChatCompletionMessageParam[] = [
      { role: 'assistant', tool_calls: [internalCall] },
      { role: 'tool', tool_call_id: internalCall.id, content: 'denied' }
    ];
    const { result, forwarded } = await run({
      messages,
      events: [requestEnd([internalCall]), toolEnd(internalCall)],
      reject: true,
      withEmitter: false
    });
    expect(result.status).toBe('error');
    expect(result.completeMessages).toEqual([]);
    expect(forwarded).toEqual([]);
    expect(result.providerState).toEqual({ messages });
  });
});
