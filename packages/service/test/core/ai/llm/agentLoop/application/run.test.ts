import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall
} from '@fastgpt/global/core/ai/llm/type';
import { runAgentLoopApplication } from '@fastgpt/service/core/ai/llm/agentLoop/application/run';
import type { AgentLoopEvent } from '@fastgpt/service/core/ai/llm/agentLoop/domain/event';
import type { AgentLoopRuntime } from '@fastgpt/service/core/ai/llm/agentLoop/domain/runtime';
import type { AgentLoopSystemTools } from '@fastgpt/service/core/ai/llm/agentLoop/domain/tool';
import type { SandboxClient } from '@fastgpt/service/core/ai/sandbox/application/runtime/client';
import { resolveSandboxRuntimePath } from '@fastgpt/service/core/ai/sandbox/utils';
import { describe, expect, it } from 'vitest';

describe('runAgentLoopApplication tool visibility', () => {
  const publicCall: ChatCompletionMessageToolCall = {
    id: 'public',
    type: 'function',
    function: { name: 'sandbox_read_file', arguments: '{"path":"/workspace/research.md"}' }
  };
  const internalCall: ChatCompletionMessageToolCall = {
    ...publicCall,
    id: 'internal',
    function: { ...publicCall.function, arguments: '{"path":"/root/.fastgpt/runtime/state.json"}' }
  };
  const sandboxClient = {
    resolveRuntimePath: (path, options) =>
      resolveSandboxRuntimePath(
        path,
        { workspaceRoot: '/workspace', sessionWorkDirectory: '/workspace' },
        options
      )
  } as SandboxClient;
  const skillDirectory = '/root/.fastgpt/skills/workflow-builder';
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
    response: 'tool result',
    seconds: 1
  });
  const activity = (
    call: ChatCompletionMessageToolCall,
    status: 'running' | 'done'
  ): Extract<AgentLoopEvent, { type: 'tool_activity' }> => ({
    type: 'tool_activity',
    callId: call.id,
    toolName: call.function.name,
    status
  });
  /** 使用真实公共入口和内存 provider，检查外部事件与 provider 原始上下文的边界。 */
  const run = async ({
    events = [],
    messages = [],
    systemTools = {
      sandbox: {
        enabled: true,
        client: sandboxClient,
        internalReadDirectories: ['/root/.fastgpt']
      }
    },
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
    {
      sandbox: {
        enabled: false,
        client: sandboxClient,
        internalReadDirectories: ['/root/.fastgpt']
      }
    }
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
    'buffers configured file reads until complete parameters arrive at the %s boundary',
    async (boundary) => {
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
        onEvent: (index, forwarded) => {
          if (index < 2) expect(forwarded).toEqual([]);
        }
      });
      expect(forwarded).toEqual(events);
    }
  );

  it('publishes only activity for internal tools while preserving public events and model context', async () => {
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
      {
        ...toolEnd(internalCall),
        errorMessage: 'secret execution error',
        metadata: { secret: 'private metadata' },
        assistantMessages: [{ role: 'assistant', content: 'private assistant message' }],
        assistantResponses: [{ text: { content: 'private child response' } }],
        toolResponseCompress: {
          response: 'private compressed result',
          modelName: 'model',
          usage: { moduleName: 'compress', totalPoints: 1 },
          requestIds: [],
          seconds: 1
        }
      },
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
      activity(internalCall, 'running'),
      events[1],
      events[3],
      { ...events[4], toolCalls: [publicCall] },
      activity(internalCall, 'done'),
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
    { args: JSON.stringify({ path: `${skillDirectory}/SKILL.md` }), hidden: true },
    { args: JSON.stringify({ path: `${skillDirectory}/references/cli-basics.md` }), hidden: true },
    { args: JSON.stringify({ path: `${skillDirectory}/scripts/build.py` }), hidden: true },
    { args: JSON.stringify({ path: `${skillDirectory}/assets/template.json` }), hidden: true },
    { args: JSON.stringify({ path: '/root/.fastgpt/runtime/state.json' }), hidden: true },
    { args: JSON.stringify({ path: '/root/.fastgpt/config.json' }), hidden: true },
    {
      args: `{ path: '${skillDirectory}/references/cli-basics.md', }`,
      hidden: true
    },
    {
      args: JSON.stringify({ path: `${skillDirectory}//references/./cli-basics.md` }),
      hidden: true
    },
    { args: JSON.stringify({ path: 'skills/report/references/guide.md' }), hidden: false },
    {
      args: JSON.stringify({ path: `${skillDirectory}-extra/references/guide.md` }),
      hidden: true
    },
    { args: JSON.stringify({ path: '/root/.fastgpt-extra/config.json' }), hidden: false },
    { args: JSON.stringify({ path: '/root/.fastgpt2/config.json' }), hidden: false },
    { args: JSON.stringify({ path: '/workspace/skills/report/SKILL.md' }), hidden: false },
    {
      args: JSON.stringify({
        path: '/workspace/.fastgpt/workflow-builder/transaction/workflow.json'
      }),
      hidden: false
    },
    { args: JSON.stringify({ path: '/workspace/fastgpt-workflow/workflow.json' }), hidden: false },
    { args: JSON.stringify({ path: '/workspace/SKILL.md' }), hidden: false },
    { args: '{', hidden: false },
    { args: 'null', hidden: false },
    { args: '{"path":1}', hidden: false },
    { args: '{"path":"../outside.md"}', hidden: false },
    {
      args: JSON.stringify({ path: `${skillDirectory}/references/cli-basics.md` }),
      toolName: 'sandbox_write_file',
      hidden: false
    },
    {
      args: JSON.stringify({ command: 'cat /root/.fastgpt/runtime/state.json' }),
      toolName: 'sandbox_shell',
      hidden: false
    },
    {
      args: JSON.stringify({ path: '/root/.fastgpt', pattern: 'state' }),
      toolName: 'sandbox_grep',
      hidden: false
    },
    {
      args: JSON.stringify({ path: `${skillDirectory}/references/cli-basics.md` }),
      enabled: false,
      hidden: false
    }
  ])(
    'applies internal read directories to the complete call without changing model context: %j',
    async ({ args, hidden, toolName = 'sandbox_read_file', enabled = true }) => {
      const call: ChatCompletionMessageToolCall = {
        ...publicCall,
        function: { name: toolName, arguments: args }
      };
      const events: AgentLoopEvent[] = [
        { type: 'tool_call', call: { ...call, function: { ...call.function, arguments: '' } } },
        { type: 'tool_params', callId: call.id, argsDelta: args },
        requestEnd([call]),
        { type: 'tool_run_start', call },
        toolEnd(call)
      ];
      const messages: ChatCompletionMessageParam[] = [
        { role: 'assistant', tool_calls: [call] },
        { role: 'tool', tool_call_id: call.id, content: 'Skill reference body' },
        { role: 'assistant', content: 'Visible answer' }
      ];
      const { result, forwarded } = await run({
        events,
        messages,
        systemTools: {
          sandbox: {
            enabled,
            client: sandboxClient,
            internalReadDirectories: ['/root/.fastgpt/']
          }
        },
        onEvent: (index, forwarded) => {
          if (enabled && toolName === 'sandbox_read_file' && index < 2) {
            expect(forwarded).toEqual([]);
          }
        }
      });
      expect(result.status).toBe('done');
      expect(forwarded).toEqual(
        hidden ? [activity(call, 'running'), requestEnd([]), activity(call, 'done')] : events
      );
      expect(result.completeMessages).toEqual(hidden ? [messages[2]] : messages);
      expect(result.assistantMessages).toEqual(hidden ? [messages[2]] : messages);
      expect(result.providerState).toEqual({ messages });
    }
  );

  it('filters internal Skill reference reads from a restored non-streaming transcript', async () => {
    const call = {
      ...internalCall,
      function: {
        name: 'sandbox_read_file',
        arguments: JSON.stringify({ path: `${skillDirectory}/references/cli-basics.md` })
      }
    };
    const messages: ChatCompletionMessageParam[] = [
      { role: 'assistant', tool_calls: [call] },
      { role: 'tool', tool_call_id: call.id, content: 'Skill reference body' }
    ];
    const { result } = await run({
      messages,
      systemTools: {
        sandbox: {
          enabled: true,
          client: sandboxClient,
          internalReadDirectories: ['/root/.fastgpt']
        }
      }
    });
    expect(result.completeMessages).toEqual([]);
    expect(result.assistantMessages).toEqual([]);
    expect(result.providerState).toEqual({ messages });
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
      expect(forwarded).toEqual(
        visible ? [event] : [activity(call, boundary === 'start' ? 'running' : 'done')]
      );
      expect(result.completeMessages).toEqual(visible ? messages : []);
    }
  );

  it.each([
    { output: { content: 'Visible answer' }, visible: true },
    { output: { content: '' }, visible: true },
    { output: { reasoning_content: 'Visible reasoning' }, visible: true },
    {
      output: {
        interactive: {
          type: 'agentAsk',
          params: {
            description: '',
            submitted: false,
            questions: [{ question: '', options: [], answer: '' }]
          }
        }
      },
      visible: true
    },
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

  it.each([
    'sandbox_read_file',
    'sandbox_shell',
    'sandbox_grep',
    'read_files',
    'dataset_search',
    'workflow_cli_query'
  ])(
    'returns the complete %s call and result when no directory policy is configured',
    async (name) => {
      const systemTools: AgentLoopSystemTools = {
        sandbox: { enabled: true, client: sandboxClient },
        readFile: {
          enabled: true,
          maxFileAmount: 1,
          execute: async () => ({ response: '', usages: [] })
        },
        datasetSearch: { enabled: true, execute: async () => ({ response: '', usages: [] }) }
      };
      const call: ChatCompletionMessageToolCall = {
        ...internalCall,
        id: name,
        function: { ...internalCall.function, name }
      };
      const events: AgentLoopEvent[] = [
        { type: 'tool_call', call },
        { type: 'tool_params', callId: call.id, argsDelta: call.function.arguments },
        { type: 'tool_run_start', call },
        toolEnd(call)
      ];
      const messages: ChatCompletionMessageParam[] = [
        { role: 'assistant', tool_calls: [call] },
        { role: 'tool', tool_call_id: call.id, content: 'Complete tool response' }
      ];
      const { forwarded, result } = await run({ systemTools, events, messages });
      expect(forwarded).toEqual(events);
      expect(result.completeMessages).toBe(messages);
      expect(result.assistantMessages).toBe(messages);
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
