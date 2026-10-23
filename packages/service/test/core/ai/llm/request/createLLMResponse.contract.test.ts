import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { setImmediate } from 'node:timers/promises';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { LLMModelDataType } from '@fastgpt/global/core/ai/model/schema';
import type {
  ChatCompletionMessageToolCall,
  CompletionFinishReason,
  CompletionUsage
} from '@fastgpt/global/core/ai/llm/type';
import type { LLMRequestRecordSchemaType } from '@fastgpt/global/openapi/core/ai/api';

// 只替换客户端目的地和 tokenizer worker；请求、SDK、解析器、记录和 loop 均运行真实实现。
vi.mock('@fastgpt/service/core/ai/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/ai/config')>()),
  getAIApi: vi.fn()
}));
vi.mock('@fastgpt/service/common/string/tiktoken/index', () => ({
  countGptMessagesTokens: vi.fn(async () => 100),
  countPromptTokens: vi.fn(async () => 5)
}));

import { getAIApi } from '@fastgpt/service/core/ai/config';
import { createLLMResponse } from '@fastgpt/service/core/ai/llm/request/createLLMResponse';
import { runAgentLoop } from '@fastgpt/service/core/ai/llm/agentLoop/provider/fastAgent/loop/base';
import { MongoLLMRequestRecord } from '@fastgpt/service/core/ai/record/schema';
import * as recordController from '@fastgpt/service/core/ai/record/controller';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { formatModelChars2Points } from '@fastgpt/service/support/wallet/usage/utils';

const teamId = '507f1f77bcf86cd799439011';
const message = 'Run the contract test search.';
const fixedError = 'LLM tool call error: no valid tool calls matched the requested tools.';
const usage = { prompt_tokens: 17, completion_tokens: 4, total_tokens: 21 };
const model: LLMModelDataType = {
  modelId: '68ad85a7463006c963799a05',
  type: ModelTypeEnum.llm,
  scope: ModelScopeEnum.system,
  provider: 'openai',
  model: 'local-tool-call-simulator',
  name: 'Local simulator',
  isActive: true,
  inputPrice: 1,
  outputPrice: 2,
  config: {
    maxContext: 128000,
    maxResponse: 4096,
    quoteMaxToken: 60000,
    functionCall: true,
    toolChoice: true,
    reasoning: true
  }
};
const tools = [
  { type: 'function' as const, function: { name: 'search', parameters: { type: 'object' } } }
];
const call = (name: string): ChatCompletionMessageToolCall => ({
  id: 'call_simulated',
  type: 'function',
  function: { name, arguments: '{"q":"FastGPT"}' }
});
type ToolDelta = {
  index?: number | null;
  id?: string | null;
  type?: 'function';
  function?: { name?: string; arguments?: string };
};
type Delta = {
  role?: string;
  content?: string | null;
  reasoning_content?: string;
  tool_calls?: ToolDelta[] | null;
};
type Chunk = {
  choices?: { index?: number; delta?: Delta; finish_reason?: CompletionFinishReason }[];
  usage?: CompletionUsage;
};
const chunk = (delta: Delta = {}, finish_reason: CompletionFinishReason = null): Chunk => ({
  choices: [{ index: 0, delta, finish_reason }]
});
const usageChunk: Chunk = { choices: [], usage };
type Round = {
  toolCalls?: ChatCompletionMessageToolCall[] | null;
  text?: string;
  reasoning?: string;
  finish?: 'tool_calls' | 'length' | 'stop';
  upstreamError?: boolean;
  chunks?: Chunk[];
  wireMode?: 'fragmented' | 'bytewise' | 'coalesced';
  omitDone?: boolean;
  malformedTail?: boolean;
  disconnect?: Promise<void>;
};
type Request = { stream?: boolean; model?: string; tools?: unknown[]; messages?: unknown[] };
let server: Server;
let baseUrl: string;
let rounds: Round[];
let received: Request[];
let saveRecord: MockInstance<typeof recordController.saveLLMRequestRecord>;

/** 等待本例真实的异步写入，避免固定轮询时限和清库操作与后台 Mongo 写入竞争。 */
const waitForRecordWrites = () => Promise.all(saveRecord.mock.results.map(({ value }) => value));

/** 每个用例独立分配 loopback 端口和响应队列，模拟真实 JSON/SSE 传输而不访问外部模型。 */
beforeEach(async () => {
  saveRecord = vi.spyOn(recordController, 'saveLLMRequestRecord');
  rounds = [];
  received = [];
  server = createServer(async (req, res) => {
    let rawBody = '';
    for await (const bytes of req) rawBody += bytes.toString();
    const request: Request = JSON.parse(rawBody);
    received.push(request);
    const round = rounds.shift();
    if (!round) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({ error: { message: 'Unexpected extra request', code: 'EXTRA_REQUEST' } })
      );
      return;
    }
    const error = { message: 'upstream simulated failure', code: 'UPSTREAM_SIMULATED' };
    const finish = round.finish ?? 'tool_calls';
    const output = {
      role: 'assistant',
      content: round.text ?? null,
      ...(round.reasoning && { reasoning_content: round.reasoning }),
      ...(round.toolCalls !== undefined && { tool_calls: round.toolCalls })
    };
    const metadata = { id: 'chatcmpl-local', created: 1, model: model.model };
    if (!request.stream) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          ...metadata,
          object: 'chat.completion',
          choices: [{ index: 0, message: output, finish_reason: finish }],
          usage,
          ...(round.upstreamError && { error })
        })
      );
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
    const frames = [
      ...(round.chunks ?? [
        chunk({
          ...output,
          ...(round.toolCalls !== undefined && {
            tool_calls: round.toolCalls?.map((tool, index) => ({ ...tool, index })) ?? null
          })
        }),
        chunk({}, finish),
        usageChunk
      ]),
      ...(round.upstreamError ? [{ error }] : [])
    ];
    const bytewise = round.wireMode === 'bytewise';
    const newline = bytewise ? '\r\n' : '\n';
    const encodedFrames = frames.map((frame) => {
      const json = JSON.stringify(
        { ...metadata, object: 'chat.completion.chunk', ...frame },
        null,
        bytewise ? 2 : undefined
      );
      // bytewise 同时覆盖 CRLF、多行 data、心跳和 UTF-8 跨字节边界的解码。
      return `${bytewise ? `: heartbeat${newline}` : ''}${json
        .split('\n')
        .map((line) => `data: ${line}`)
        .join(newline)}${newline}${newline}`;
    });
    if (round.malformedTail) encodedFrames.push(`data: {invalid json${newline}${newline}`);
    const done = round.omitDone ? '' : `data: [DONE]${newline}${newline}`;
    if (round.wireMode === 'coalesced' && !round.disconnect) {
      res.end(encodedFrames.join('') + done);
      return;
    }
    for (const encoded of encodedFrames) {
      const bytes = Buffer.from(encoded);
      for (let offset = 0; offset < bytes.length; ) {
        if (res.destroyed) return;
        const end = bytewise ? offset + 1 : offset === 0 ? 19 : bytes.length;
        res.write(bytes.subarray(offset, end));
        offset = end;
        await setImmediate();
      }
    }
    if (round.disconnect) {
      // 等待测试确认客户端已消费前面的帧，避免连接过早断开而退化成建连失败。
      await round.disconnect;
      res.destroy();
      return;
    }
    res.end(done);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Local simulator did not bind TCP');
  baseUrl = `http://127.0.0.1:${address.port}/v1`;
  const actual = await vi.importActual<typeof import('@fastgpt/service/core/ai/config')>(
    '@fastgpt/service/core/ai/config'
  );
  const client = actual.getAIApi({ userKey: { key: 'local-test-key', baseUrl }, timeout: 5000 });
  vi.mocked(getAIApi).mockReturnValue({
    ...client,
    requestMeta: { usedUserOpenAIKey: false, baseUrl }
  });
});

afterEach(async () => {
  try {
    if (server?.listening) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      });
    }
  } finally {
    await waitForRecordWrites();
    vi.restoreAllMocks();
  }
});

/** 等待真实写入后回读 Mongo，校验实际记录内容而非仅校验 save 的调用参数。 */
const readRecord = async (requestId?: string) => {
  await waitForRecordWrites();
  const record: LLMRequestRecordSchemaType | null = await MongoLLMRequestRecord.findOne({
    teamId,
    ...(requestId && { requestId })
  }).lean();
  expect(record).not.toBeNull();
  return record!;
};
const body = (stream: boolean) => ({
  model,
  messages: [{ role: 'user' as const, content: message }],
  tools,
  stream,
  toolCallMode: 'toolChoice' as const
});

describe('createLLMResponse HTTP/SSE contract', () => {
  const scenarios: Array<Round & { label: string; valid?: boolean }> = [
    { label: 'tool_calls omitted' },
    { label: 'explicit empty tool_calls', toolCalls: [] },
    { label: 'null tool_calls', toolCalls: null },
    { label: 'text without tools', text: 'Partial answer.' },
    { label: 'reasoning without tools', toolCalls: [], reasoning: 'Partial reasoning.' },
    { label: 'unknown tool filtered out', toolCalls: [call('unknown')] },
    { label: 'nameless tool filtered out', toolCalls: [call('')] },
    { label: 'text plus unknown tool', text: 'Partial answer.', toolCalls: [call('unknown')] },
    { label: 'valid prefixed tool control', toolCalls: [call('functions.search')], valid: true },
    { label: 'normal stop text control', text: 'Normal answer.', finish: 'stop', valid: true },
    { label: 'upstream error priority', text: 'Partial answer.', upstreamError: true }
  ];
  it.each(
    scenarios.flatMap((scenario) => [true, false].map((stream) => ({ ...scenario, stream })))
  )('$label, stream=$stream', async (scenario) => {
    rounds.push(scenario);
    const log = vi
      .spyOn(getLogger(LogCategories.MODULE.AI.LLM), 'error')
      .mockImplementation(() => {});
    const onStreaming = vi.fn();
    const onToolCall = vi.fn();
    const result = await createLLMResponse({
      teamId,
      throwError: false,
      maxRetries: 0,
      body: body(scenario.stream),
      onStreaming,
      onToolCall
    });
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ model: model.model, stream: scenario.stream, tools });
    expect(result.answerText).toBe(scenario.text ?? '');
    expect(result.reasoningText).toBe(scenario.reasoning ?? '');
    expect(result.responseEmptyTip).toBeUndefined();
    expect(result.usage).toMatchObject({ inputTokens: 17, outputTokens: 4 });
    expect(onStreaming.mock.calls.map(([event]) => event.text).join('')).toBe(scenario.text ?? '');
    const toolErrorLogs = log.mock.calls.filter(
      ([message]) => String(message) === 'LLM tool calls missing'
    );
    const record = await readRecord(result.requestId);
    if (scenario.valid) {
      expect(result.error).toBeUndefined();
      expect(result.finish_reason).toBe(scenario.finish ?? 'tool_calls');
      if (scenario.toolCalls?.length) {
        expect(result.toolCalls?.[0].function.name).toBe('search');
        expect(onToolCall).toHaveBeenCalledTimes(1);
      } else {
        expect(result.toolCalls ?? []).toEqual([]);
        expect(onToolCall).not.toHaveBeenCalled();
      }
      expect(toolErrorLogs).toEqual([]);
    } else if (scenario.upstreamError) {
      expect(result.error).toMatchObject({
        message: 'upstream simulated failure',
        code: 'UPSTREAM_SIMULATED'
      });
      expect(result.finish_reason).toBe('error');
      expect(toolErrorLogs).toEqual([]);
      expect(record.response.error).toMatchObject({
        message: 'upstream simulated failure',
        code: 'UPSTREAM_SIMULATED'
      });
    } else {
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error.message).toBe(fixedError);
      expect(result.toolCalls ?? []).toEqual([]);
      expect(result.assistantMessage).not.toHaveProperty('tool_calls');
      expect(result.finish_reason).toBe('tool_calls');
      expect(onToolCall).not.toHaveBeenCalled();
      expect(toolErrorLogs).toEqual([
        [
          'LLM tool calls missing',
          { requestBody: expect.objectContaining({ tools }), message: fixedError }
        ]
      ]);
      expect(record.response).toMatchObject({
        finish_reason: 'tool_calls',
        usage: { inputTokens: 17, outputTokens: 4 }
      });
      expect(record.response.error).toBeUndefined();
      expect(record.response.answerText).toBe(scenario.text);
      expect(record.response.reasoningText).toBe(scenario.reasoning);
      expect(record.response).not.toHaveProperty('toolCalls');
    }
  });

  it.each(
    [true, false].flatMap((stream) => [true, false].map((priorTool) => ({ stream, priorTool })))
  )(
    'continuation uses prior results: stream=$stream, priorTool=$priorTool',
    async ({ stream, priorTool }) => {
      rounds.push(
        {
          finish: 'length',
          ...(priorTool ? { toolCalls: [call('search')] } : { text: 'Prior answer.' })
        },
        { toolCalls: [] }
      );
      const result = await createLLMResponse({
        teamId,
        throwError: false,
        maxContinuations: 2,
        body: body(stream)
      });
      expect(received).toHaveLength(2);
      expect(result.usage).toMatchObject({ inputTokens: 34, outputTokens: 8 });
      expect(result.responseEmptyTip).toBeUndefined();
      expect(result.finish_reason).toBe('tool_calls');
      if (priorTool) {
        expect(result.error).toBeUndefined();
        expect(result.toolCalls).toHaveLength(1);
      } else {
        expect(result.error.message).toBe(fixedError);
        expect(result.answerText).toBe('Prior answer.');
      }
      await readRecord(result.requestId);
    }
  );

  it.each([true, false])('default throws the fixed error: stream=%s', async (stream) => {
    rounds.push({ toolCalls: [] });
    await expect(createLLMResponse({ teamId, body: body(stream) })).rejects.toThrow(fixedError);
    const record = await readRecord();
    expect(record.response.finish_reason).toBe('tool_calls');
    expect(record.response.error).toBeUndefined();
    expect(saveRecord).toHaveBeenCalledTimes(1);
    expect(received).toHaveLength(1);
  });

  it.each([true, false])(
    'real agent loop retains error-round usage: userKey=%s',
    async (usedUserOpenAIKey) => {
      rounds.push({ toolCalls: [call('search')] }, { text: 'Partial answer.', toolCalls: [] });
      const client = getAIApi();
      vi.mocked(getAIApi).mockReturnValue({
        ...client,
        requestMeta: { usedUserOpenAIKey, baseUrl }
      });
      const onLLMRequestEnd = vi.fn();
      const onRunTool = vi.fn(async () => ({
        response: 'Search result.',
        assistantMessages: [],
        usages: []
      }));
      const result = await runAgentLoop({
        teamId,
        maxRunAgentTimes: 5,
        body: body(true),
        isAborted: () => false,
        onRunTool,
        onRunInteractiveTool: vi.fn(),
        onLLMRequestEnd
      });
      expect(received).toHaveLength(2);
      expect(onRunTool).toHaveBeenCalledTimes(1);
      expect(result.error.message).toBe(fixedError);
      expect(result.finish_reason).toBe('tool_calls');
      expect(result.inputTokens).toBe(34);
      expect(result.outputTokens).toBe(8);
      const perRequestPoints = formatModelChars2Points({
        model,
        inputTokens: 17,
        outputTokens: 4
      }).totalPoints;
      expect(perRequestPoints).toBeGreaterThan(0);
      expect(result.llmTotalPoints).toBe(usedUserOpenAIKey ? 0 : perRequestPoints * 2);
      expect(onLLMRequestEnd).toHaveBeenCalledTimes(2);
      const events = onLLMRequestEnd.mock.calls.map(([event]) => event);
      expect(events[1].error.message).toBe(fixedError);
      expect(events.reduce((total, event) => total + event.usage.inputTokens, 0)).toBe(
        result.inputTokens
      );
      expect(events.reduce((total, event) => total + event.usage.outputTokens, 0)).toBe(
        result.outputTokens
      );
      expect(events.reduce((total, event) => total + event.usage.totalPoints, 0)).toBe(
        result.llmTotalPoints
      );
      for (const id of result.requestIds) await readRecord(id);
    }
  );

  describe('stream chunk boundaries', () => {
    const streamTools = [
      ...tools,
      {
        type: 'function' as const,
        function: { name: 'search_content', parameters: { type: 'object' } }
      }
    ];
    const toolDelta = ({
      index,
      id,
      name,
      args
    }: {
      index?: number | null;
      id?: string | null;
      name?: string;
      args?: string;
    }): ToolDelta => ({ index, id, function: { name, arguments: args } });
    const toolChunk = (fields: Parameters<typeof toolDelta>[0]) =>
      chunk({ tool_calls: [toolDelta(fields)] });
    const end = chunk({}, 'tool_calls');
    const payload = JSON.stringify({ q: '中文😊 "quote"\\path\nline', values: [0, false, null] });
    const conflict = [
      toolChunk({ index: 0, id: 'a', name: 'search', args: '{' }),
      toolChunk({ index: 0, name: 'other', args: '}' }),
      chunk({
        content: 'After conflict.',
        tool_calls: [toolDelta({ index: 1, id: 'b', name: 'search', args: '{}' })]
      }),
      end,
      usageChunk
    ];
    type StreamCase = {
      label: string;
      chunks: Chunk[];
      expectedTools: { id?: string; name?: string; args: string }[];
      text?: string;
      reasoning?: string;
      finishReason?: CompletionFinishReason;
      error?: 'missing' | 'protocol' | 'upstream';
      startedCalls?: number;
      upstreamError?: boolean;
      wireMode?: Round['wireMode'];
    };

    /** 同时核对最终结果、流事件重放和真实 Mongo 记录，防止串参、漏参或重复派发。 */
    const assertStreamCase = async (scenario: StreamCase) => {
      rounds.push(scenario);
      const log = vi
        .spyOn(getLogger(LogCategories.MODULE.AI.LLM), 'error')
        .mockImplementation(() => {});
      const replay = new Map<string, string>();
      const onToolCall = vi.fn(({ call }: { call: ChatCompletionMessageToolCall }) => {
        expect(replay.has(call.id)).toBe(false);
        replay.set(call.id, call.function.arguments);
      });
      const onToolParam = vi.fn(
        ({ call, argsDelta }: { call: ChatCompletionMessageToolCall; argsDelta: string }) => {
          expect(replay.has(call.id)).toBe(true);
          replay.set(call.id, replay.get(call.id)! + argsDelta);
        }
      );
      const onStreaming = vi.fn();
      const onReasoning = vi.fn();
      const result = await createLLMResponse({
        teamId,
        throwError: false,
        maxRetries: 0,
        body: { ...body(true), tools: streamTools },
        onToolCall,
        onToolParam,
        onStreaming,
        onReasoning
      });
      expect(received).toHaveLength(1);
      expect(result.answerText).toBe(scenario.text ?? '');
      expect(result.reasoningText).toBe(scenario.reasoning ?? '');
      expect(onStreaming.mock.calls.map(([event]) => event.text).join('')).toBe(result.answerText);
      expect(onReasoning.mock.calls.map(([event]) => event.text).join('')).toBe(
        result.reasoningText
      );
      expect(result.responseEmptyTip).toBeUndefined();
      expect(result.usage).toMatchObject({ inputTokens: 17, outputTokens: 4 });
      const parsedError = scenario.error === 'protocol' || scenario.error === 'upstream';
      expect(result.finish_reason).toBe(
        scenario.finishReason ?? (parsedError ? 'error' : 'tool_calls')
      );
      expect(result.toolCalls ?? []).toEqual(
        scenario.expectedTools.map((tool) => ({
          id: tool.id ?? expect.any(String),
          type: 'function',
          function: { name: tool.name ?? 'search', arguments: tool.args }
        }))
      );
      const missingLogs = log.mock.calls.filter(
        ([message]) => String(message) === 'LLM tool calls missing'
      );
      if (scenario.error) {
        if (scenario.error === 'upstream') {
          // SDK 的 error.error 会按现有链路保留为普通对象，验证原始信息而非错误类。
          expect(result.error).toEqual({
            message: 'upstream simulated failure',
            code: 'UPSTREAM_SIMULATED'
          });
        } else {
          expect(result.error).toBeInstanceOf(Error);
        }
        if (scenario.error === 'missing') {
          expect(result.error.message).toBe(fixedError);
          expect(missingLogs).toHaveLength(1);
          expect(onToolCall).not.toHaveBeenCalled();
        } else {
          expect(result.error.message).toContain(
            scenario.error === 'protocol' ? 'tool name changed' : 'upstream simulated failure'
          );
          expect(missingLogs).toEqual([]);
          expect(onToolCall).toHaveBeenCalledTimes(scenario.startedCalls ?? 1);
          expect(onToolParam).not.toHaveBeenCalled();
        }
      } else {
        expect(result.error).toBeUndefined();
        expect(missingLogs).toEqual([]);
        expect(onToolCall).toHaveBeenCalledTimes(scenario.expectedTools.length);
        for (const tool of result.toolCalls ?? []) {
          const args = replay.get(tool.id)!;
          expect(args.trim() ? args : '{}').toBe(tool.function.arguments);
        }
      }
      const record = await readRecord(result.requestId);
      expect(record.response.finish_reason).toBe(result.finish_reason);
      expect(record.response.toolCalls ?? []).toEqual(result.toolCalls ?? []);
      expect(record.response.answerText).toBe(result.answerText || undefined);
      expect(record.response.reasoningText).toBe(result.reasoningText || undefined);
      expect(record.response.usage).toMatchObject({ inputTokens: 17, outputTokens: 4 });
      if (parsedError) expect(record.response.error.message).toBe(result.error.message);
      else expect(record.response.error).toBeUndefined();
    };

    const cases: StreamCase[] = [
      {
        label: 'arguments split at every UTF-16 code unit',
        chunks: [
          toolChunk({ index: 0, id: 'a', name: 'search' }),
          ...payload.split('').map((args) => toolChunk({ index: 0, args })),
          end,
          usageChunk
        ],
        expectedTools: [{ id: 'a', args: payload }]
      },
      {
        label: 'arguments buffered before the complete name',
        chunks: [
          toolChunk({ index: 0, id: 'a', args: '{"q":' }),
          toolChunk({ index: 0, args: '1}' }),
          toolChunk({ index: 0, name: 'functions.search' }),
          end,
          usageChunk
        ],
        expectedTools: [{ id: 'a', args: '{"q":1}' }]
      },
      {
        label: 'final arguments, finish and cumulative usage share one frame',
        chunks: [
          toolChunk({ index: 0, id: 'a', name: 'search', args: '{"q":' }),
          { choices: [], usage: { prompt_tokens: 17, completion_tokens: 1, total_tokens: 18 } },
          {
            ...chunk({ tool_calls: [toolDelta({ index: 0, args: '1}' })] }, 'tool_calls'),
            usage
          }
        ],
        expectedTools: [{ id: 'a', args: '{"q":1}' }]
      },
      {
        label: 'upstream id arrives after the start event',
        chunks: [
          chunk({ tool_calls: [{ index: 0 }] }),
          toolChunk({ index: 0, name: 'search', args: '{"q":' }),
          toolChunk({ index: 0, id: 'late', args: '1' }),
          toolChunk({ index: 0, args: '}' }),
          end,
          usageChunk
        ],
        expectedTools: [{ args: '{"q":1}' }]
      },
      {
        label: 'upstream id arrives before the name',
        chunks: [
          toolChunk({ index: 0, args: '{"q":' }),
          toolChunk({ index: 0, id: 'late', name: 'search', args: '1' }),
          toolChunk({ index: 0, args: '}' }),
          end,
          usageChunk
        ],
        expectedTools: [{ id: 'late', args: '{"q":1}' }]
      },
      {
        label: 'repeated full names with empty and null ids',
        chunks: [
          toolChunk({ index: 0, id: 'a', name: 'functions.search', args: '{"q":' }),
          toolChunk({ index: 0, id: '', name: 'search', args: '1' }),
          toolChunk({ index: 0, id: null, name: 'functions.search', args: '}' }),
          end,
          usageChunk
        ],
        expectedTools: [{ id: 'a', args: '{"q":1}' }]
      },
      {
        label: 'whitespace arguments normalize once',
        chunks: [
          toolChunk({ index: 0, id: 'a', name: 'search', args: ' ' }),
          toolChunk({ index: 0, args: '\t' }),
          end,
          usageChunk
        ],
        expectedTools: [{ id: 'a', args: '{}' }]
      },
      {
        label: 'parallel tools and reversed array positions',
        chunks: [
          chunk({
            tool_calls: [
              toolDelta({ index: 1, id: 'b', name: 'search_content', args: '{"b":' }),
              toolDelta({ index: 0, id: 'a', name: 'search', args: '{"a":' })
            ]
          }),
          chunk({
            tool_calls: [toolDelta({ index: 0, args: '1}' }), toolDelta({ index: 1, args: '2}' })]
          }),
          end,
          usageChunk
        ],
        expectedTools: [
          { id: 'a', args: '{"a":1}' },
          { id: 'b', name: 'search_content', args: '{"b":2}' }
        ]
      },
      {
        label: 'same index switches to a new id',
        chunks: [
          toolChunk({ index: 0, id: 'a', name: 'search', args: '{"a":' }),
          toolChunk({ index: 0, args: '1}' }),
          toolChunk({ index: 0, id: 'b', name: 'search_content', args: '{"b":' }),
          toolChunk({ index: 0, args: '2}' }),
          end,
          usageChunk
        ],
        expectedTools: [
          { id: 'a', args: '{"a":1}' },
          { id: 'b', name: 'search_content', args: '{"b":2}' }
        ]
      },
      {
        label: 'explicit old id returns to the old call after a switch',
        chunks: [
          toolChunk({ index: 0, id: 'a', name: 'search', args: '{"a":' }),
          toolChunk({ index: 0, id: 'b', name: 'search_content', args: '{"b":' }),
          toolChunk({ index: 0, id: 'a', args: '1}' }),
          toolChunk({ index: 0, args: '2}' }),
          end,
          usageChunk
        ],
        expectedTools: [
          { id: 'a', args: '{"a":1}' },
          { id: 'b', name: 'search_content', args: '{"b":2}' }
        ]
      },
      {
        label: 'parallel calls without indexes use ids',
        chunks: [
          toolChunk({ index: null, id: 'a', name: 'search', args: '{"a":' }),
          toolChunk({ id: 'b', name: 'search_content', args: '{"b":' }),
          chunk({
            tool_calls: [toolDelta({ id: 'b', args: '2}' }), toolDelta({ id: 'a', args: '1}' })]
          }),
          end,
          usageChunk
        ],
        expectedTools: [
          { id: 'a', args: '{"a":1}' },
          { id: 'b', name: 'search_content', args: '{"b":2}' }
        ]
      },
      {
        label: 'sparse indexes sort independently of start order',
        chunks: [
          toolChunk({ index: 7, id: 'a', name: 'search', args: '{"a":1}' }),
          toolChunk({ index: 2, id: 'b', name: 'search_content', args: '{"b":2}' }),
          end,
          usageChunk
        ],
        expectedTools: [
          { id: 'b', name: 'search_content', args: '{"b":2}' },
          { id: 'a', args: '{"a":1}' }
        ]
      },
      {
        label: 'empty frames and unknown tools do not consume valid deltas',
        chunks: [
          {},
          { choices: [] },
          { choices: [{}] },
          chunk({ tool_calls: [] }),
          toolChunk({ index: 1, id: 'unknown', name: 'other', args: '{' }),
          toolChunk({ index: 0, id: 'a', name: 'search', args: '{"q":' }),
          toolChunk({ index: 1, args: '}' }),
          toolChunk({ index: 0, args: '1}' }),
          end,
          {},
          usageChunk
        ],
        expectedTools: [{ id: 'a', args: '{"q":1}' }]
      },
      {
        label: 'reasoning, text and parameters interleave',
        chunks: [
          chunk({ reasoning_content: '思考' }),
          toolChunk({ index: 0, id: 'a', name: 'search', args: '{"q":' }),
          chunk({ reasoning_content: '继续' }),
          chunk({ content: '答案😊', tool_calls: [toolDelta({ index: 0, args: '"中文😊"}' })] }),
          end,
          usageChunk
        ],
        text: '答案😊',
        reasoning: '思考继续',
        expectedTools: [{ id: 'a', args: '{"q":"中文😊"}' }]
      },
      {
        label: 'think tags span multiple chunks',
        chunks: [
          chunk({ content: '<thi' }),
          chunk({ content: 'nk>思考' }),
          chunk({ content: '过程</th' }),
          chunk({ content: 'ink>答案😊' }),
          chunk({}, 'stop'),
          usageChunk
        ],
        text: '答案😊',
        reasoning: '思考过程',
        finishReason: 'stop',
        expectedTools: []
      },
      {
        label: 'unknown tool parameters are still rejected at tool_calls finish',
        chunks: [
          toolChunk({ index: 0, id: 'a', name: 'other', args: '{"q":' }),
          toolChunk({ index: 0, args: '1}' }),
          end,
          usageChunk
        ],
        expectedTools: [],
        error: 'missing'
      },
      {
        label: 'changed name suppresses later tool events but retains text and usage',
        chunks: conflict,
        text: 'After conflict.',
        expectedTools: [],
        error: 'protocol'
      },
      {
        label: 'name fragments are protocol errors',
        chunks: [
          toolChunk({ index: 0, id: 'a', name: 'sea', args: '{' }),
          toolChunk({ index: 0, name: 'rch', args: '}' }),
          end,
          usageChunk
        ],
        expectedTools: [],
        error: 'protocol',
        startedCalls: 0
      },
      {
        label: 'upstream error takes priority over a tool name conflict',
        chunks: conflict,
        text: 'After conflict.',
        expectedTools: [],
        error: 'upstream',
        upstreamError: true
      },
      {
        label: 'anonymous fragments are not guessed into one call',
        chunks: [
          toolChunk({ name: 'search', args: '{"q":' }),
          toolChunk({ args: '1}' }),
          end,
          usageChunk
        ],
        expectedTools: [{ args: '{"q":' }]
      },
      {
        label: 'length preserves incomplete arguments without synthetic braces',
        chunks: [
          toolChunk({ index: 0, id: 'a', name: 'search', args: '{"q":' }),
          chunk({}, 'length'),
          usageChunk
        ],
        expectedTools: [{ id: 'a', args: '{"q":' }],
        finishReason: 'length'
      }
    ];

    it.each(
      cases.flatMap((scenario) =>
        (['fragmented', 'bytewise'] as const).map((wireMode) => ({ ...scenario, wireMode }))
      )
    )('$label, wire=$wireMode', assertStreamCase);

    it.each([1, 2, 3, 4, 5, 6, 7, 8])(
      'reassembles six parallel calls with deterministic seed=%s',
      async (seed) => {
        // 固定种子同时改变参数分片、调用交错和数组批次；失败时可按 seed 精确重放。
        let state = seed;
        const random = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0);
        const tasks = Array.from({ length: 6 }, (_, index) => {
          const args = JSON.stringify({
            q: `call ${index}: 中文😊 "quote"\\path\nline`,
            values: [index, false, null]
          });
          const parts: string[] = [];
          for (let offset = 0; offset < args.length; ) {
            const length = (random() % 7) + 1;
            parts.push(args.slice(offset, offset + length));
            offset += length;
          }
          return { id: `seed_${seed}_${index}`, index: index * 3 + 1, args, parts, next: 0 };
        });
        const chunks: Chunk[] = [];
        while (tasks.some((task) => task.next < task.parts.length)) {
          const deltas: ToolDelta[] = [];
          const batchSize = (random() % 3) + 1;
          for (let i = 0; i < batchSize; i++) {
            const pending = tasks.filter((task) => task.next < task.parts.length);
            if (!pending.length) break;
            const task = pending[random() % pending.length];
            const first = task.next === 0;
            deltas.push(
              toolDelta({
                index: task.index,
                ...(first && { id: task.id }),
                ...((first || random() % 5 === 0) && {
                  name: first ? 'functions.search' : 'search'
                }),
                args: task.parts[task.next++]
              })
            );
          }
          chunks.push(chunk({ tool_calls: deltas }));
          if (chunks.length % 7 === 0) chunks.push({ choices: [] });
        }
        await assertStreamCase({
          label: `seed ${seed}`,
          chunks: [...chunks, end, usageChunk],
          wireMode: 'coalesced',
          expectedTools: tasks.map((task) => ({ id: task.id, args: task.args }))
        });
      }
    );

    it.each([
      {
        label: 'missing DONE with explicit finish',
        finish: true,
        done: false,
        expected: 'tool_calls'
      },
      { label: 'missing finish with DONE', finish: false, done: true, expected: 'abnormal_close' },
      {
        label: 'missing both finish and DONE',
        finish: false,
        done: false,
        expected: 'abnormal_close'
      }
    ])('$label preserves generated tools', async ({ finish, done, expected }) => {
      rounds.push({
        chunks: [
          toolChunk({ index: 0, id: 'a', name: 'search', args: '{}' }),
          ...(finish ? [end] : []),
          usageChunk
        ],
        omitDone: !done
      });
      const result = await createLLMResponse({ teamId, throwError: false, body: body(true) });
      expect(result.error).toBeUndefined();
      expect(result.finish_reason).toBe(expected);
      expect(result.toolCalls?.[0].function.arguments).toBe('{}');
      expect(result.usage).toMatchObject({ inputTokens: 17, outputTokens: 4 });
      const record = await readRecord(result.requestId);
      expect(record.response.finish_reason).toBe(expected);
      expect(record.response.toolCalls).toEqual(result.toolCalls);
      expect(record.response.usage).toMatchObject({ inputTokens: 17, outputTokens: 4 });
    });

    it('keeps an upstream stream failure instead of generating a missing-tools error', async () => {
      const receivedContent = Promise.withResolvers<void>();
      rounds.push({
        chunks: [usageChunk, chunk({ content: 'Partial answer.' })],
        disconnect: receivedContent.promise
      });
      const log = vi
        .spyOn(getLogger(LogCategories.MODULE.AI.LLM), 'error')
        .mockImplementation(() => {});
      const result = await createLLMResponse({
        teamId,
        throwError: false,
        maxRetries: 0,
        body: body(true),
        onStreaming: () => receivedContent.resolve()
      });
      expect(received).toHaveLength(1);
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error.message).not.toBe(fixedError);
      expect(result.finish_reason).toBe('error');
      expect(result.answerText).toBe('Partial answer.');
      expect(result.usage).toMatchObject({ inputTokens: 17, outputTokens: 4 });
      expect(log.mock.calls.some(([message]) => String(message) === 'LLM tool calls missing')).toBe(
        false
      );
      const record = await readRecord(result.requestId);
      expect(record.response.error).toBeDefined();
      expect(record.response.answerText).toBe(result.answerText);
      expect(record.response.usage).toMatchObject({ inputTokens: 17, outputTokens: 4 });
    });

    it('retains received text and usage when an SSE JSON frame is malformed', async () => {
      rounds.push({
        chunks: [chunk({ content: 'Partial answer.' }), usageChunk],
        malformedTail: true
      });
      const result = await createLLMResponse({ teamId, throwError: false, body: body(true) });
      expect(result.error.name).toBe('SyntaxError');
      expect(result.error.message).not.toBe(fixedError);
      expect(result.finish_reason).toBe('error');
      expect(result.answerText).toBe('Partial answer.');
      expect(result.usage).toMatchObject({ inputTokens: 17, outputTokens: 4 });
      const record = await readRecord(result.requestId);
      expect(record.response.error.name).toBe('SyntaxError');
    });

    it('cancels after the start event without appending queued parameters', async () => {
      rounds.push({
        chunks: [
          usageChunk,
          toolChunk({ index: 0, id: 'a', name: 'search', args: '{"q":' }),
          toolChunk({ index: 0, args: '1}' }),
          end
        ],
        wireMode: 'coalesced'
      });
      let aborted = false;
      const onToolCall = vi.fn(() => {
        aborted = true;
      });
      const onToolParam = vi.fn();
      const result = await createLLMResponse({
        teamId,
        throwError: false,
        body: body(true),
        isAborted: () => aborted,
        onToolCall,
        onToolParam
      });
      expect(result.error).toBeUndefined();
      expect(result.finish_reason).toBe('close');
      expect(result.toolCalls?.[0].function.arguments).toBe('{"q":');
      expect(result.usage).toMatchObject({ inputTokens: 17, outputTokens: 4 });
      expect(onToolCall).toHaveBeenCalledTimes(1);
      expect(onToolParam).not.toHaveBeenCalled();
      const record = await readRecord(result.requestId);
      expect(record.response.finish_reason).toBe('close');
      expect(record.response.toolCalls).toEqual(result.toolCalls);
      expect(record.response.usage).toMatchObject({ inputTokens: 17, outputTokens: 4 });
    });

    describe('disconnect while tool arguments are streaming', () => {
      /** 工具开始事件到达后再断开连接，确保失败发生在参数流中途而不是建连阶段。 */
      const pushCutOffRound = (wireMode?: Round['wireMode']) => {
        const started = Promise.withResolvers<void>();
        rounds.push({
          chunks: [usageChunk, toolChunk({ index: 0, id: 'a', name: 'search', args: '{"q":' })],
          wireMode,
          disconnect: started.promise
        });
        return () => started.resolve();
      };

      it.each(['fragmented', 'bytewise'] as const)(
        'keeps the upstream failure and the truncated call, wire=%s',
        async (wireMode) => {
          const onStarted = pushCutOffRound(wireMode);
          const log = vi
            .spyOn(getLogger(LogCategories.MODULE.AI.LLM), 'error')
            .mockImplementation(() => {});
          const onToolParam = vi.fn();
          const result = await createLLMResponse({
            teamId,
            throwError: false,
            maxRetries: 0,
            body: body(true),
            onToolCall: onStarted,
            onToolParam
          });

          expect(received).toHaveLength(1);
          expect(result.error).toBeInstanceOf(Error);
          expect(result.error.message).not.toBe(fixedError);
          expect(result.finish_reason).toBe('error');
          // 已开始的工具保留残缺参数用于排查；是否执行由调用方依据 error 决定。
          expect(result.toolCalls).toEqual([
            { id: 'a', type: 'function', function: { name: 'search', arguments: '{"q":' } }
          ]);
          expect(onToolParam).not.toHaveBeenCalled();
          expect(result.usage).toMatchObject({ inputTokens: 17, outputTokens: 4 });
          expect(
            log.mock.calls.some(([message]) => String(message) === 'LLM tool calls missing')
          ).toBe(false);
          const record = await readRecord(result.requestId);
          expect(record.response.finish_reason).toBe('error');
          expect(record.response.error).toBeDefined();
          expect(record.response.toolCalls).toEqual(result.toolCalls);
        }
      );

      it('agent loop stops without running the truncated tool', async () => {
        const onStarted = pushCutOffRound();
        const onRunTool = vi.fn();
        const result = await runAgentLoop({
          teamId,
          maxRunAgentTimes: 5,
          body: body(true),
          isAborted: () => false,
          onRunTool,
          onRunInteractiveTool: vi.fn(),
          onToolCall: onStarted
        });

        expect(received).toHaveLength(1);
        expect(onRunTool).not.toHaveBeenCalled();
        expect(result.error).toBeInstanceOf(Error);
        expect(result.error.message).not.toBe(fixedError);
        expect(result.finish_reason).toBe('error');
        expect(result.requestIds).toHaveLength(1);
        expect(result.inputTokens).toBe(17);
        expect(result.outputTokens).toBe(4);
        await readRecord(result.requestIds[0]);
      });
    });

    it.each([
      {
        label: 'parallel tools with reversed array positions',
        chunks: [
          chunk({
            tool_calls: [
              toolDelta({ index: 1, id: 'b', name: 'search_content', args: '{"b":' }),
              toolDelta({ index: 0, id: 'a', name: 'search', args: '{"a":' })
            ]
          }),
          chunk({
            tool_calls: [toolDelta({ index: 0, args: '1}' }), toolDelta({ index: 1, args: '2}' })]
          })
        ],
        expected: [
          { id: 'a', name: 'search', args: '{"a":1}' },
          { id: 'b', name: 'search_content', args: '{"b":2}' }
        ]
      },
      {
        label: 'same index switches to a new id',
        chunks: [
          toolChunk({ index: 0, id: 'a', name: 'search', args: '{"a":' }),
          toolChunk({ index: 0, args: '1}' }),
          toolChunk({ index: 0, id: 'b', name: 'search_content', args: '{"b":' }),
          toolChunk({ index: 0, args: '2}' })
        ],
        expected: [
          { id: 'a', name: 'search', args: '{"a":1}' },
          { id: 'b', name: 'search_content', args: '{"b":2}' }
        ]
      },
      {
        label: 'upstream id arrives after the start event',
        chunks: [
          chunk({ tool_calls: [{ index: 0 }] }),
          toolChunk({ index: 0, name: 'search', args: '{"q":' }),
          toolChunk({ index: 0, id: 'late', args: '1' }),
          toolChunk({ index: 0, args: '}' })
        ],
        // 开始事件已生成对外 id，晚到的上游 id 不能替换它。
        expected: [{ name: 'search', args: '{"q":1}' }]
      }
    ])('agent loop runs streamed tools with stable ids: $label', async ({ chunks, expected }) => {
      rounds.push(
        { chunks: [...chunks, end, usageChunk], wireMode: 'bytewise' },
        { text: 'Done.', finish: 'stop' }
      );
      const startedIds: string[] = [];
      const onRunTool = vi.fn(async ({ call }: { call: ChatCompletionMessageToolCall }) => ({
        response: `result of ${call.id}`,
        assistantMessages: [],
        usages: []
      }));
      const result = await runAgentLoop({
        teamId,
        maxRunAgentTimes: 5,
        body: { ...body(true), tools: streamTools },
        isAborted: () => false,
        onRunTool,
        onRunInteractiveTool: vi.fn(),
        onToolCall: ({ call }) => startedIds.push(call.id)
      });

      expect(result.error).toBeUndefined();
      expect(received).toHaveLength(2);
      const ran = onRunTool.mock.calls.map(([{ call }]) => ({
        id: call.id,
        name: call.function.name,
        args: call.function.arguments
      }));
      expect(ran).toEqual(
        expected.map((tool) => ({ id: expect.not.stringMatching(/^late$/), ...tool }))
      );
      // 同一个对外 id 贯穿开始事件、工具执行和下一轮请求上下文。
      expect([...startedIds].sort()).toEqual(ran.map((tool) => tool.id).sort());

      type LoopMessage = {
        role: string;
        content?: unknown;
        tool_call_id?: string;
        tool_calls?: ChatCompletionMessageToolCall[];
      };
      const nextMessages = received[1].messages as LoopMessage[];
      const assistant = nextMessages.find(
        (item) => item.role === 'assistant' && item.tool_calls?.length
      );
      expect(
        assistant?.tool_calls?.map((call) => ({
          id: call.id,
          name: call.function.name,
          args: call.function.arguments
        }))
      ).toEqual(ran);
      const toolMessages = nextMessages.filter((item) => item.role === 'tool');
      expect(toolMessages.map((item) => item.tool_call_id)).toEqual(ran.map((tool) => tool.id));
      expect(toolMessages.map((item) => item.content)).toEqual(
        ran.map((tool) => `result of ${tool.id}`)
      );
      for (const id of result.requestIds) await readRecord(id);
    });
  });
});
