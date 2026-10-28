import { describe, expect, it, vi } from 'vitest';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type {
  ChatCompletionChunk,
  ChatCompletionTool,
  CompletionFinishReason,
  CompletionUsage,
  StreamResponseType
} from '@fastgpt/global/core/ai/llm/type';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { createStreamResponse } from '@fastgpt/service/core/ai/llm/request/response/stream';
import { createAgentLoopCoreEventStream } from '@fastgpt/service/core/workflow/dispatch/ai/agentLoopCore/adapter/eventStream/createEventStream';

type StreamParams = Parameters<typeof createStreamResponse>[0];
type SDKDelta = ChatCompletionChunk['choices'][number]['delta'];
type ToolDelta = Omit<NonNullable<SDKDelta['tool_calls']>[number], 'index' | 'id'> & {
  index?: number | null;
  id?: string | null;
};
type Delta = Omit<SDKDelta, 'tool_calls'> & {
  reasoning_content?: string;
  tool_calls?: ToolDelta[];
};
// 兼容供应商可能省略 choices、delta、index 的传输边界，不放宽生产类型。
type Chunk = {
  choices?: { delta?: Delta; finish_reason?: CompletionFinishReason }[];
  usage?: CompletionUsage;
  error?: unknown;
};

const usage: CompletionUsage = { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 };
const tool = (name: string): ChatCompletionTool => ({
  type: 'function',
  function: { name, parameters: { type: 'object' } }
});
const createBody = (overrides: Partial<StreamParams['body']> = {}): StreamParams['body'] => ({
  model: {
    modelId: '68ad85a7463006c963799a64',
    type: ModelTypeEnum.llm,
    scope: ModelScopeEnum.system,
    provider: 'openai',
    model: 'gpt-4o',
    name: 'GPT-4o',
    config: { maxContext: 128000, maxResponse: 4096, quoteMaxToken: 60000, reasoning: false }
  },
  messages: [],
  stream: true,
  ...overrides
});
const chunk = (delta: Delta = {}, finishReason: CompletionFinishReason = null): Chunk => ({
  choices: [{ delta, finish_reason: finishReason }]
});

/** 只模拟上游异步传输和关闭句柄；正文、工具协议、usage 和错误均交给真实解析器处理。 */
const createStream = (
  chunks: Chunk[],
  { error, withController = true }: { error?: unknown; withController?: boolean } = {}
) => {
  const abort = vi.fn();
  async function* generate() {
    for (const part of chunks) yield part;
    if (error !== undefined) throw error;
  }
  // SDK Stream 还带 HTTP 专用方法，测试只实现本函数实际消费的异步迭代和 controller。
  const response = Object.assign(
    generate(),
    withController ? { controller: { abort } } : {}
  ) as unknown as StreamResponseType;
  return { response, abort };
};
const createCallbacks = () => ({
  onStreaming: vi.fn<NonNullable<StreamParams['onStreaming']>>(),
  onReasoning: vi.fn<NonNullable<StreamParams['onReasoning']>>(),
  onToolCall: vi.fn<NonNullable<StreamParams['onToolCall']>>(),
  onToolParam: vi.fn<NonNullable<StreamParams['onToolParam']>>()
});
const textOf = (callback: ReturnType<typeof createCallbacks>['onStreaming']) =>
  callback.mock.calls.map(([event]) => event.text).join('');

describe('createStreamResponse', () => {
  const nativeBody = createBody({ tools: [tool('search')] });
  const promptBody = createBody({ tools: [tool('search')], toolCallMode: 'prompt' });
  const modes = [
    { mode: 'text', body: createBody(), prefix: '' },
    { mode: 'toolChoice', body: nativeBody, prefix: '' },
    { mode: 'prompt', body: promptBody, prefix: '0: ' }
  ];

  it.each([
    { label: 'no tools', tools: undefined },
    { label: 'an empty tool list', tools: [] },
    { label: 'native tools', tools: [tool('search')] }
  ])('should separate reasoning, text and usage with $label', async ({ tools }) => {
    const callbacks = createCallbacks();
    const { response } = createStream([
      chunk({ reasoning_content: 'Thinking...' }),
      chunk({ content: ' Hello' }),
      chunk({ content: ' world' }, 'stop'),
      { choices: [], usage }
    ]);
    const result = await createStreamResponse({
      body: createBody({ tools }),
      response,
      ...callbacks
    });

    expect(result).toMatchObject({
      answerText: 'Hello world',
      reasoningText: 'Thinking...',
      finish_reason: 'stop',
      usage,
      error: undefined
    });
    expect(callbacks.onStreaming.mock.calls).toEqual([[{ text: 'Hello' }], [{ text: ' world' }]]);
    expect(callbacks.onReasoning).toHaveBeenCalledExactlyOnceWith({ text: 'Thinking...' });
    expect(callbacks.onToolCall).not.toHaveBeenCalled();
  });

  it.each([true, false])('should respect model reasoning=%s for think tags', async (reasoning) => {
    const body = createBody();
    body.model.config.reasoning = reasoning;
    const callbacks = createCallbacks();
    const { response } = createStream([
      chunk({ content: '<think>' }),
      chunk({ content: 'thinking' }),
      chunk({ content: '</think>' }),
      chunk({ content: ' answer' }, 'stop')
    ]);
    const result = await createStreamResponse({ body, response, ...callbacks });
    const answer = reasoning ? 'answer' : '<think>thinking</think> answer';

    expect(result.answerText).toBe(answer);
    expect(result.reasoningText).toBe(reasoning ? 'thinking' : '');
    expect(textOf(callbacks.onStreaming)).toBe(answer);
    expect(textOf(callbacks.onReasoning)).toBe(result.reasoningText);
  });

  it.each(modes)(
    'should handle an empty $mode stream without synthetic output',
    async ({ body }) => {
      const callbacks = createCallbacks();
      const { response } = createStream([]);
      const result = await createStreamResponse({ body, response, ...callbacks });

      expect(result).toMatchObject({
        answerText: '',
        reasoningText: '',
        finish_reason: null,
        error: undefined
      });
      for (const callback of Object.values(callbacks)) expect(callback).not.toHaveBeenCalled();
      expect(result.toolCalls ?? []).toEqual([]);
    }
  );

  it.each(modes)('should allow omitted callbacks in $mode', async ({ body, prefix }) => {
    const { response } = createStream([
      chunk({ reasoning_content: 'thinking' }),
      chunk({ content: `${prefix}hello` }),
      chunk({ content: ' world' }, 'stop')
    ]);
    const result = await createStreamResponse({ body, response });
    expect(result).toMatchObject({
      answerText: 'hello world',
      reasoningText: 'thinking',
      finish_reason: 'stop'
    });
  });

  it.each(modes)('should filter citation-only deltas in $mode', async ({ body, prefix }) => {
    const callbacks = createCallbacks();
    const { response } = createStream([
      chunk({ content: `${prefix}visible` }),
      chunk({ content: '[0123456789abcdef01234567](CITE)' }),
      chunk({}, 'stop')
    ]);
    const result = await createStreamResponse({
      body: { ...body, retainDatasetCite: false },
      response,
      ...callbacks
    });
    expect(textOf(callbacks.onStreaming)).toBe('visible');
    expect(result.answerText).toContain('visible');
    expect(result.finish_reason).toBe('stop');
  });

  describe('native tool calls', () => {
    it.each([
      ['functions.search', 'search', '', '{}'],
      ['search', 'search', ' \t', '{}'],
      ['functions_search', 'functions_search', '{}', '{}'],
      ['functions', 'functions', '{}', '{}'],
      ['search', 'search', '{"q":', '{"q":']
    ])(
      'should preserve %s as %s and arguments %j as %j',
      async (rawName, name, args, finalArgs) => {
        const callbacks = createCallbacks();
        const { response } = createStream([
          chunk(
            {
              tool_calls: [{ index: 0, id: 'call_1', function: { name: rawName, arguments: args } }]
            },
            'tool_calls'
          )
        ]);
        const result = await createStreamResponse({
          body: createBody({ tools: [tool(name)] }),
          response,
          ...callbacks
        });

        expect(callbacks.onToolCall).toHaveBeenCalledExactlyOnceWith({
          call: { id: 'call_1', type: 'function', function: { name, arguments: args } }
        });
        expect(callbacks.onToolParam).not.toHaveBeenCalled();
        expect(result.toolCalls).toEqual([
          { id: 'call_1', type: 'function', function: { name, arguments: finalArgs } }
        ]);
        expect(result.finish_reason).toBe('tool_calls');
      }
    );

    it('should isolate interleaved calls and buffer arguments until a complete name arrives', async () => {
      const callbacks = createCallbacks();
      const workflowStreamResponse = vi.fn();
      const eventStream = createAgentLoopCoreEventStream({
        workflowStreamResponse,
        getToolInfo: (name) => (['tool_a', 'tool_b'].includes(name) ? { name } : undefined)
      });
      callbacks.onToolCall.mockImplementation(({ call }) => eventStream.streamToolCall(call));
      callbacks.onToolParam.mockImplementation(({ call, argsDelta }) =>
        eventStream.streamToolParams({ callId: call.id, argsDelta })
      );
      const { response } = createStream([
        chunk({
          tool_calls: [
            { index: 1, id: 'call_b', function: { arguments: '{"b"' } },
            { index: 0, function: { arguments: '{"a"' } }
          ]
        }),
        chunk({
          tool_calls: [{ index: 0, id: 'call_a', function: { name: 'tool_a', arguments: ':1' } }]
        }),
        chunk({
          tool_calls: [{ index: 1, function: { name: 'functions.tool_b', arguments: ':2' } }]
        }),
        chunk(
          {
            tool_calls: [
              { index: 1, function: { arguments: '}' } },
              { index: 0, function: { arguments: '}' } }
            ]
          },
          'tool_calls'
        )
      ]);
      const result = await createStreamResponse({
        body: createBody({ tools: [tool('tool_a'), tool('tool_b')], toolCallMode: 'toolChoice' }),
        response,
        ...callbacks
      });

      expect(callbacks.onToolCall.mock.calls.map(([{ call }]) => call.function.name)).toEqual([
        'tool_a',
        'tool_b'
      ]);
      expect(callbacks.onToolParam.mock.calls.map(([{ call }]) => call.function.name)).toEqual([
        'tool_b',
        'tool_a'
      ]);
      // 真实适配器按初始参数建卡片，再追加增量；同一块参数不能通过两个事件重复下发。
      expect(
        workflowStreamResponse.mock.calls.map(([event]) => [
          event.event,
          event.id,
          event.data.tool.params
        ])
      ).toEqual([
        [SseResponseEventEnum.toolCall, 'call_a', '{"a":1'],
        [SseResponseEventEnum.toolCall, 'call_b', '{"b":2'],
        [SseResponseEventEnum.toolParams, 'call_b', '}'],
        [SseResponseEventEnum.toolParams, 'call_a', '}']
      ]);
      expect(result.toolCalls).toEqual([
        { id: 'call_a', type: 'function', function: { name: 'tool_a', arguments: '{"a":1}' } },
        { id: 'call_b', type: 'function', function: { name: 'tool_b', arguments: '{"b":2}' } }
      ]);
    });

    it('should ignore repeated complete names and keep prefix-related tools distinct', async () => {
      const callbacks = createCallbacks();
      const { response } = createStream([
        chunk({
          tool_calls: [
            { index: 0, id: 'call_1', function: { name: 'get_file', arguments: '{"id":' } }
          ]
        }),
        chunk({
          tool_calls: [
            { index: 0, id: '', function: { name: 'functions.get_file', arguments: '1' } }
          ]
        }),
        chunk(
          { tool_calls: [{ index: 0, id: null, function: { name: 'get_file', arguments: '}' } }] },
          'tool_calls'
        )
      ]);
      const result = await createStreamResponse({
        body: createBody({ tools: [tool('get_file'), tool('get_file_content')] }),
        response,
        ...callbacks
      });

      expect(result.error).toBeUndefined();
      expect(result.toolCalls).toEqual([
        { id: 'call_1', type: 'function', function: { name: 'get_file', arguments: '{"id":1}' } }
      ]);
      expect(callbacks.onToolCall).toHaveBeenCalledTimes(1);
      expect(callbacks.onToolParam.mock.calls.map(([event]) => event.argsDelta)).toEqual([
        '1',
        '}'
      ]);
    });

    it.each([false, true])(
      'should keep event and final ids stable when an id arrives after start=%s',
      async (afterStart) => {
        const callbacks = createCallbacks();
        const { response } = createStream([
          chunk({
            tool_calls: [
              { index: 0, function: { ...(afterStart && { name: 'search' }), arguments: '{"q":' } }
            ]
          }),
          chunk({
            tool_calls: [{ index: 0, id: 'real_id', function: { name: 'search', arguments: '1' } }]
          }),
          chunk({ tool_calls: [{ index: 0, function: { arguments: '}' } }] }, 'tool_calls')
        ]);
        const result = await createStreamResponse({ body: nativeBody, response, ...callbacks });
        const startedId = callbacks.onToolCall.mock.calls[0][0].call.id;
        expect(startedId).toEqual(
          afterStart ? expect.stringMatching(/^[a-zA-Z0-9]{6}$/) : 'real_id'
        );
        expect(callbacks.onToolCall).toHaveBeenCalledTimes(1);
        expect(
          callbacks.onToolParam.mock.calls.every(([event]) => event.call.id === startedId)
        ).toBe(true);
        expect(result.toolCalls).toEqual([
          { id: startedId, type: 'function', function: { name: 'search', arguments: '{"q":1}' } }
        ]);
      }
    );

    it('should route parallel calls without index by stable upstream ids', async () => {
      const callbacks = createCallbacks();
      const { response } = createStream([
        chunk({ tool_calls: [{ id: 'a', function: { name: 'tool_a', arguments: '{"a":' } }] }),
        chunk({ tool_calls: [{ id: 'b', function: { name: 'tool_b', arguments: '{"b":' } }] }),
        chunk(
          {
            tool_calls: [
              { id: 'b', function: { arguments: '2}' } },
              { id: 'a', function: { arguments: '1}' } }
            ]
          },
          'tool_calls'
        )
      ]);
      const result = await createStreamResponse({
        body: createBody({ tools: [tool('tool_a'), tool('tool_b')] }),
        response,
        ...callbacks
      });
      expect(result.error).toBeUndefined();
      expect(result.toolCalls).toEqual([
        { id: 'a', type: 'function', function: { name: 'tool_a', arguments: '{"a":1}' } },
        { id: 'b', type: 'function', function: { name: 'tool_b', arguments: '{"b":2}' } }
      ]);
      expect(
        callbacks.onToolParam.mock.calls.map(([event]) => [event.call.id, event.argsDelta])
      ).toEqual([
        ['b', '2}'],
        ['a', '1}']
      ]);
    });

    it('should keep the started event id when a late upstream id has a conflicting tool name', async () => {
      const callbacks = createCallbacks();
      const { response } = createStream([
        chunk({ tool_calls: [{ index: 0, function: { name: 'search', arguments: '{"q":' } }] }),
        chunk({ tool_calls: [{ index: 0, id: 'real_id', function: { arguments: '1' } }] }),
        chunk(
          {
            tool_calls: [{ index: 0, id: 'real_id', function: { name: 'other', arguments: '}' } }]
          },
          'tool_calls'
        )
      ]);
      const result = await createStreamResponse({ body: nativeBody, response, ...callbacks });
      const startedId = callbacks.onToolCall.mock.calls[0][0].call.id;
      expect(callbacks.onToolCall).toHaveBeenCalledTimes(1);
      expect(callbacks.onToolParam.mock.calls[0][0].call.id).toBe(startedId);
      expect(result.toolCalls).toEqual([]);
      expect(result.error.cause).toMatchObject({ id: 'real_id', function: { name: 'other' } });
    });

    it.each([
      {
        label: 'changed name',
        calls: [{ index: 0, id: 'a', function: { name: 'search', arguments: '{' } }],
        conflict: { index: 0, function: { name: 'search_content', arguments: '}' } },
        message: 'tool name changed'
      },
      {
        label: 'name fragments',
        calls: [{ index: 0, id: 'a', function: { name: 'sea' } }],
        conflict: { index: 0, function: { name: 'rch' } },
        message: 'tool name changed'
      }
    ])(
      'should reject $label without further tool events and still read usage',
      async ({ calls, conflict, message }) => {
        const callbacks = createCallbacks();
        const { response } = createStream([
          chunk({ tool_calls: calls }),
          chunk({ tool_calls: [conflict] }),
          chunk(
            {
              tool_calls: [{ index: 0, function: { arguments: 'discarded' } }],
              content: 'partial answer'
            },
            'tool_calls'
          ),
          { choices: [], usage }
        ]);
        const result = await createStreamResponse({
          body: createBody({ tools: [tool('search'), tool('search_content')] }),
          response,
          ...callbacks
        });
        expect(result).toMatchObject({
          finish_reason: 'tool_calls',
          toolCalls: [],
          answerText: 'partial answer',
          usage
        });
        expect(result.error).toBeInstanceOf(Error);
        expect(result.error).toMatchObject({
          message: expect.stringContaining(message),
          cause: conflict
        });
        expect(callbacks.onToolParam).not.toHaveBeenCalled();
        expect(callbacks.onToolCall).toHaveBeenCalledTimes(
          calls.filter((call) => call.function?.name === 'search').length
        );
      }
    );

    it.each([
      {
        label: 'the same index with different ids',
        first: { index: 0, id: 'a' },
        second: { index: 0, id: 'b' }
      },
      {
        label: 'the same id with different indexes',
        first: { index: 0, id: 'a' },
        second: { index: 1, id: 'a' }
      },
      {
        label: 'an indexed call followed by an unindexed call with the same id',
        first: { index: 0, id: 'a' },
        second: { id: 'a' }
      },
      {
        label: 'an unindexed call followed by an indexed call with the same id',
        first: { id: 'a' },
        second: { index: 0, id: 'a' }
      },
      {
        label: 'an anonymous call followed by an id without an index',
        first: {},
        second: { id: 'a' }
      }
    ])('should keep $label separate', async ({ first, second }) => {
      const callbacks = createCallbacks();
      const { response } = createStream([
        chunk({
          tool_calls: [{ ...first, function: { name: 'search', arguments: '{"first":1}' } }]
        }),
        chunk(
          {
            tool_calls: [
              { ...second, function: { name: 'search_content', arguments: '{"second":2}' } }
            ]
          },
          'tool_calls'
        )
      ]);
      const result = await createStreamResponse({
        body: createBody({ tools: [tool('search'), tool('search_content')] }),
        response,
        ...callbacks
      });

      expect(result.error).toBeUndefined();
      expect(result.toolCalls).toHaveLength(2);
      expect(result.toolCalls?.map((call) => call.function)).toEqual(
        expect.arrayContaining([
          { name: 'search', arguments: '{"first":1}' },
          { name: 'search_content', arguments: '{"second":2}' }
        ])
      );
      expect(callbacks.onToolCall).toHaveBeenCalledTimes(2);
      expect(callbacks.onToolParam).not.toHaveBeenCalled();
    });

    it('should route id-less deltas to the latest call sharing the same index', async () => {
      const callbacks = createCallbacks();
      const { response } = createStream([
        chunk({
          tool_calls: [{ index: 0, id: 'a', function: { name: 'search', arguments: '{"q":' } }]
        }),
        chunk({ tool_calls: [{ index: 0, function: { arguments: '1}' } }] }),
        chunk({
          tool_calls: [
            { index: 0, id: 'b', function: { name: 'search_content', arguments: '{"u":' } }
          ]
        }),
        chunk({ tool_calls: [{ index: 0, function: { arguments: '2}' } }] }, 'tool_calls')
      ]);
      const result = await createStreamResponse({
        body: createBody({ tools: [tool('search'), tool('search_content')] }),
        response,
        ...callbacks
      });

      expect(result.error).toBeUndefined();
      expect(result.toolCalls).toEqual([
        { id: 'a', type: 'function', function: { name: 'search', arguments: '{"q":1}' } },
        { id: 'b', type: 'function', function: { name: 'search_content', arguments: '{"u":2}' } }
      ]);
      expect(
        callbacks.onToolParam.mock.calls.map(([event]) => [event.call.id, event.argsDelta])
      ).toEqual([
        ['a', '1}'],
        ['b', '2}']
      ]);
    });

    it('should ignore empty frames and unknown, incomplete or missing tool names', async () => {
      const callbacks = createCallbacks();
      const { response } = createStream([
        {},
        { choices: [] },
        { choices: [{}] },
        chunk({ tool_calls: [] }),
        chunk({
          tool_calls: [
            { index: 0, function: { name: 'missing_tool', arguments: '{}' } },
            { index: 1, function: { name: 'sea', arguments: '{}' } },
            { index: 2, function: { name: '', arguments: '{}' } },
            { index: 3 }
          ]
        }),
        chunk({}, 'stop')
      ]);
      const result = await createStreamResponse({ body: nativeBody, response, ...callbacks });
      expect(result).toMatchObject({
        toolCalls: [],
        answerText: '',
        error: undefined,
        finish_reason: 'stop'
      });
      expect(callbacks.onToolCall).not.toHaveBeenCalled();
      expect(callbacks.onToolParam).not.toHaveBeenCalled();
    });

    it.each([
      { label: 'unknown tool', name: 'missing_tool' },
      { label: 'incomplete tool name', name: 'sea' },
      { label: 'prefix without a tool name', name: 'functions.' },
      { label: 'no tool deltas', name: undefined }
    ])('should retain tool_calls ending with $label for entry validation', async ({ name }) => {
      const callbacks = createCallbacks();
      const { response } = createStream([
        chunk({ reasoning_content: 'thinking', content: 'partial answer' }),
        chunk(
          {
            tool_calls:
              name === undefined
                ? []
                : [
                    {
                      index: 0,
                      id: 'call_invalid',
                      type: 'function',
                      function: { name, arguments: '{"q":1}' }
                    }
                  ]
          },
          'tool_calls'
        ),
        { choices: [], usage }
      ]);
      const result = await createStreamResponse({ body: nativeBody, response, ...callbacks });

      expect(result).toMatchObject({
        finish_reason: 'tool_calls',
        toolCalls: [],
        usage,
        answerText: 'partial answer',
        reasoningText: 'thinking'
      });
      expect(result.error).toBeUndefined();
      expect(callbacks.onToolCall).not.toHaveBeenCalled();
      expect(callbacks.onToolParam).not.toHaveBeenCalled();
    });

    it('should keep valid calls when tool_calls also contains an unknown tool', async () => {
      const callbacks = createCallbacks();
      const { response } = createStream([
        chunk(
          {
            tool_calls: [
              { index: 0, id: 'call_invalid', function: { name: 'missing_tool', arguments: '{}' } },
              { index: 1, id: 'call_valid', function: { name: 'search', arguments: '{}' } }
            ]
          },
          'tool_calls'
        )
      ]);
      const result = await createStreamResponse({ body: nativeBody, response, ...callbacks });
      const call = {
        id: 'call_valid',
        type: 'function',
        function: { name: 'search', arguments: '{}' }
      };
      expect(result).toMatchObject({
        finish_reason: 'tool_calls',
        error: undefined,
        toolCalls: [call]
      });
      expect(callbacks.onToolCall).toHaveBeenCalledExactlyOnceWith({ call });
    });

    it.each(
      [
        { kind: 'Error instance', error: new Error('upstream disconnected') },
        { kind: 'API object', error: { message: 'upstream disconnected', code: 'provider_error' } },
        { kind: 'API string', error: 'upstream disconnected' }
      ].flatMap((scenario) => [false, true].map((conflict) => ({ ...scenario, conflict })))
    )(
      'should preserve $kind after invalid tools with protocol conflict=$conflict',
      async ({ error, conflict }) => {
        const { response } = createStream(
          [
            chunk({
              content: 'partial answer',
              tool_calls: [{ index: 0, function: { name: 'unknown', arguments: '{}' } }]
            }),
            ...(conflict
              ? [chunk({ tool_calls: [{ index: 0, function: { name: 'conflicting_name' } }] })]
              : []),
            chunk({}, 'tool_calls'),
            { choices: [], usage }
          ],
          { error }
        );
        const result = await createStreamResponse({ body: nativeBody, response });

        expect(result.error).toBe(error);
        expect(result.toolCalls).toEqual([]);
        expect(result.answerText).toBe('partial answer');
        expect(result.usage).toEqual(usage);
      }
    );

    it.each([
      { index: undefined, id: undefined },
      { index: null, id: '' }
    ])(
      'should not guess anonymous argument ownership for index=$index and id=$id',
      async ({ index, id }) => {
        const callbacks = createCallbacks();
        const { response } = createStream([
          chunk({ tool_calls: [{ index, id, function: { arguments: '{"q":' } }] }),
          chunk({ tool_calls: [{ index, id, function: { name: 'search', arguments: '{}' } }] }),
          chunk({ tool_calls: [{ index, id, function: { arguments: '1}' } }] }, 'tool_calls')
        ]);
        const result = await createStreamResponse({ body: nativeBody, response, ...callbacks });
        expect(result.toolCalls).toEqual([
          {
            id: expect.any(String),
            type: 'function',
            function: { name: 'search', arguments: '{}' }
          }
        ]);
        expect(result.toolCalls?.[0].id).toHaveLength(6);
        expect(callbacks.onToolCall).toHaveBeenCalledExactlyOnceWith({
          call: result.toolCalls?.[0]
        });
        expect(callbacks.onToolParam).not.toHaveBeenCalled();
      }
    );
  });

  describe('prompt tool protocol', () => {
    it.each([
      { label: 'split ASCII prefix', parts: ['0', ':', ' hello', ' world'], callbacks: true },
      { label: 'split full-width prefix', parts: ['0', '：', ' hello', ' world'], callbacks: true },
      { label: 'missing prefix', parts: ['hello', ' world'], callbacks: true },
      { label: 'missing prefix without callbacks', parts: ['hello', ' world'], callbacks: false }
    ])('should stream an answer with $label', async ({ parts, callbacks: observe }) => {
      const callbacks = createCallbacks();
      const { response } = createStream([
        ...parts.map((content) => chunk({ content })),
        chunk({}, 'stop')
      ]);
      const result = await createStreamResponse({
        body: promptBody,
        response,
        ...(observe ? callbacks : {})
      });
      expect(result).toMatchObject({
        answerText: 'hello world',
        toolCalls: undefined,
        finish_reason: 'stop'
      });
      if (observe) expect(textOf(callbacks.onStreaming)).toBe('hello world');
    });

    it.each([
      { prefix: '1:', callbacks: true },
      { prefix: '1：', callbacks: false }
    ])(
      'should suppress $prefix protocol text and emit the complete tool call',
      async ({ prefix, callbacks: observe }) => {
        const callbacks = createCallbacks();
        const { response } = createStream([
          chunk({ content: prefix }),
          chunk({ content: '{"name":"search","arguments":{"q":"fastgpt"}}' }),
          chunk({}, 'stop')
        ]);
        const result = await createStreamResponse({
          body: promptBody,
          response,
          ...(observe ? callbacks : {})
        });
        expect(result.toolCalls).toEqual([
          {
            id: expect.any(String),
            type: 'function',
            function: { name: 'search', arguments: '{"q":"fastgpt"}' }
          }
        ]);
        expect(result.answerText).toBe('');
        expect(callbacks.onStreaming).not.toHaveBeenCalled();
        if (observe)
          expect(callbacks.onToolCall).toHaveBeenCalledExactlyOnceWith({
            call: result.toolCalls?.[0]
          });
      }
    );

    it.each([true, false])(
      'should return malformed protocol as a visible error with callbacks=%s',
      async (observe) => {
        const callbacks = createCallbacks();
        const { response } = createStream([chunk({ content: '1: {invalid' }, 'stop')]);
        const result = await createStreamResponse({
          body: promptBody,
          response,
          ...(observe ? callbacks : {})
        });
        expect(result.answerText).toBe('Tool call error: 1: {invalid');
        expect(result.toolCalls).toBeUndefined();
        if (observe)
          expect(callbacks.onStreaming).toHaveBeenCalledExactlyOnceWith({
            text: result.answerText
          });
      }
    );
  });

  describe('stream lifecycle', () => {
    it.each(modes)(
      'should retain parsed output and usage when a consumer callback throws in $mode',
      async ({ body, prefix }) => {
        const error = new Error('consumer callback failed');
        const callbacks = createCallbacks();
        callbacks.onStreaming.mockImplementation(() => {
          throw error;
        });
        const { response } = createStream([
          { ...chunk({ content: `${prefix}hello` }), usage },
          chunk({ content: 'must not be read' }, 'stop')
        ]);
        const result = await createStreamResponse({ body, response, ...callbacks });

        expect(result.error).toBe(error);
        expect(result.answerText).toBe('hello');
        expect(result.usage).toEqual(usage);
        expect(callbacks.onStreaming).toHaveBeenCalledExactlyOnceWith({ text: 'hello' });
      }
    );

    it.each(['abort', 'error'] as const)(
      'should retain unfinished tool arguments on %s without synthesizing parameters',
      async (termination) => {
        const callbacks = createCallbacks();
        let stopping = false;
        callbacks.onToolCall.mockImplementation(() => {
          stopping = true;
        });
        const call = {
          id: 'call_1',
          type: 'function' as const,
          function: { name: 'search', arguments: '{"q":' }
        };
        const error = new Error('upstream disconnected during tool arguments');
        const { response, abort } = createStream(
          [{ ...chunk({ tool_calls: [{ index: 0, ...call }] }), usage }, chunk({})],
          { error }
        );
        const result = await createStreamResponse({
          body: nativeBody,
          response,
          isAborted: termination === 'abort' ? () => stopping : undefined,
          ...callbacks
        });

        expect(result.toolCalls).toEqual([call]);
        expect(result.usage).toEqual(usage);
        expect(result.finish_reason).toBe(termination === 'abort' ? 'close' : null);
        expect(result.error).toBe(termination === 'abort' ? undefined : error);
        expect(abort).toHaveBeenCalledTimes(termination === 'abort' ? 1 : 0);
        expect(callbacks.onToolCall).toHaveBeenCalledExactlyOnceWith({ call });
        expect(callbacks.onToolParam).not.toHaveBeenCalled();
      }
    );

    it.each(
      modes.flatMap((mode) => [
        { ...mode, stage: 'before the first chunk', withController: false, stopImmediately: true },
        { ...mode, stage: 'after partial output', withController: true, stopImmediately: false }
      ])
    )(
      'should close $mode $stage without an error',
      async ({ body, prefix, withController, stopImmediately }) => {
        const callbacks = createCallbacks();
        let stopping = stopImmediately;
        callbacks.onStreaming.mockImplementation(() => {
          stopping = true;
        });
        const { response, abort } = createStream(
          [
            chunk({ content: `${prefix}hello` }),
            chunk({ content: 'discarded' }),
            chunk({}, 'stop')
          ],
          { withController, error: new Error('must not read past cancellation') }
        );
        const result = await createStreamResponse({
          body,
          response,
          isAborted: () => stopping,
          ...callbacks
        });

        expect(result).toMatchObject({
          answerText: stopImmediately ? '' : 'hello',
          finish_reason: 'close',
          error: undefined
        });
        expect(abort).toHaveBeenCalledTimes(withController ? 1 : 0);
        expect(callbacks.onStreaming.mock.calls).toEqual(
          stopImmediately ? [] : [[{ text: 'hello' }]]
        );
      }
    );

    it.each(
      modes.flatMap((mode) => [
        { ...mode, wrapped: false },
        { ...mode, wrapped: true }
      ])
    )(
      'should preserve partial $mode output and usage on wrapped=$wrapped upstream errors',
      async ({ body, prefix, wrapped }) => {
        const callbacks = createCallbacks();
        const error = new Error('upstream disconnected');
        const { response, abort } = createStream(
          [
            chunk({ reasoning_content: 'thinking' }),
            chunk({ content: `${prefix}hello` }),
            { choices: [], usage }
          ],
          { error: wrapped ? { error } : error }
        );
        const result = await createStreamResponse({ body, response, ...callbacks });

        expect(result).toMatchObject({
          answerText: 'hello',
          reasoningText: 'thinking',
          usage,
          finish_reason: null
        });
        expect(result.error).toBe(error);
        expect(textOf(callbacks.onStreaming)).toBe('hello');
        expect(abort).not.toHaveBeenCalled();
      }
    );
  });
});
