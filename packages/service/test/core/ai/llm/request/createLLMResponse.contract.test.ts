import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { setImmediate } from 'node:timers/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { LLMModelDataType } from '@fastgpt/global/core/ai/model/schema';
import type { ChatCompletionMessageToolCall } from '@fastgpt/global/core/ai/llm/type';
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
type Round = {
  toolCalls?: ChatCompletionMessageToolCall[] | null;
  text?: string;
  reasoning?: string;
  finish?: 'tool_calls' | 'length' | 'stop';
  upstreamError?: boolean;
};
type Request = { stream?: boolean; model?: string; tools?: unknown[]; messages?: unknown[] };
let server: Server;
let baseUrl: string;
let rounds: Round[];
let received: Request[];

/** 每个用例独立分配 loopback 端口和响应队列，模拟真实 JSON/SSE 传输而不访问外部模型。 */
beforeEach(async () => {
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
      {
        ...metadata,
        object: 'chat.completion.chunk',
        choices: [
          {
            index: 0,
            delta: {
              ...output,
              ...(round.toolCalls !== undefined && {
                tool_calls: round.toolCalls?.map((tool, index) => ({ ...tool, index })) ?? null
              })
            },
            finish_reason: null
          }
        ]
      },
      {
        ...metadata,
        object: 'chat.completion.chunk',
        choices: [{ index: 0, delta: {}, finish_reason: finish }]
      },
      { ...metadata, object: 'chat.completion.chunk', choices: [], usage },
      ...(round.upstreamError ? [{ error }] : [])
    ];
    for (const frame of frames) {
      // 刻意把 SSE JSON 跨两次异步 write 发送，验证 SDK 的缓冲与帧解析。
      const encoded = `data: ${JSON.stringify(frame)}\n\n`;
      res.write(encoded.slice(0, 19));
      await setImmediate();
      res.write(encoded.slice(19));
    }
    res.end('data: [DONE]\n\n');
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
    vi.restoreAllMocks();
  }
});

/** 等待异步请求追踪落库，直接回读 Mongo，避免只验证 save 函数调用参数。 */
const readRecord = async (requestId?: string) => {
  let record: LLMRequestRecordSchemaType | null;
  await vi.waitFor(async () => {
    record = await MongoLLMRequestRecord.findOne({
      teamId,
      ...(requestId && { requestId })
    }).lean();
    expect(record).not.toBeNull();
  });
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
    const saveRecord = vi.spyOn(recordController, 'saveLLMRequestRecord');
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
});
