import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { setImmediate } from 'node:timers/promises';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import {
  LLM_TOOL_CALL_ARGUMENTS_INVALID_RESPONSE,
  LLM_TOOL_CALL_ARGUMENTS_TRUNCATED_RESPONSE,
  ModelScopeEnum,
  ModelTypeEnum
} from '@fastgpt/global/core/ai/constants';
import { chats2GPTMessages, filterToolMessages } from '@fastgpt/global/core/chat/adapt';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import { LangEnum } from '@fastgpt/global/common/i18n/type';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import { isValidToolArguments } from '@fastgpt/service/core/ai/llm/request/response/normalize';
import { createAgentLoopCoreAssistantEventCollector } from '@fastgpt/service/core/workflow/dispatch/ai/agentLoopCore/adapter/assistantResponses/eventCollector';
import type { LLMModelDataType } from '@fastgpt/global/core/ai/model/schema';
import type {
  ChatCompletionMessageParam,
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
import * as outputModeration from '@fastgpt/service/core/plugin/moderation/output';

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
  pricing: { tiers: [{ inputPrice: 1, outputPrice: 2 }] },
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
  requireReasoning?: boolean;
  requireValidToolArguments?: boolean;
  toolCalls?: ChatCompletionMessageToolCall[] | null;
  text?: string;
  reasoning?: string;
  finish?: 'tool_calls' | 'length' | 'stop' | 'content_filter';
  upstreamError?: boolean;
  chunks?: Chunk[];
  wireMode?: 'fragmented' | 'bytewise' | 'coalesced';
  omitDone?: boolean;
  malformedTail?: boolean;
  disconnect?: Promise<void>;
};
type Request = {
  stream?: boolean;
  model?: string;
  tools?: unknown[];
  messages?: ChatCompletionMessageParam[];
};
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
    if (
      round.requireReasoning &&
      request.messages?.some(
        (message) => message.role === 'assistant' && typeof message.reasoning_content !== 'string'
      )
    ) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: {
            message: 'The reasoning_content in the thinking mode must be passed back to the API.',
            code: 'invalid_request_error'
          }
        })
      );
      return;
    }
    if (round.requireValidToolArguments) {
      const msgs = request.messages ?? [];
      const hasInvalidArgs = msgs.some(
        (message) =>
          message.role === 'assistant' &&
          'tool_calls' in message &&
          Array.isArray(message.tool_calls) &&
          message.tool_calls.some(
            (toolCall) =>
              toolCall.type === 'function' && !isValidToolArguments(toolCall.function?.arguments)
          )
      );
      if (hasInvalidArgs) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: {
              message:
                'The "function.arguments" parameter of the code model must be in JSON format.',
              code: 'invalid_parameter_error'
            }
          })
        );
        return;
      }

      // 模拟 DashScope / OpenAI 严格工具回执校验：assistant.tool_calls 后必须紧跟所有对应 role:'tool'。
      let pendingToolIds = new Set<string>();
      for (const message of msgs) {
        if (message.role === 'tool' && 'tool_call_id' in message && message.tool_call_id) {
          pendingToolIds.delete(message.tool_call_id);
          continue;
        }
        if (pendingToolIds.size > 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              error: {
                message:
                  'An assistant message with "tool_calls" must be followed by tool messages responding to each "tool_call_id".',
                code: 'invalid_parameter_error'
              }
            })
          );
          return;
        }
        if (
          message.role === 'assistant' &&
          'tool_calls' in message &&
          Array.isArray(message.tool_calls)
        ) {
          pendingToolIds = new Set(message.tool_calls.map((c) => c.id));
        }
      }
      if (pendingToolIds.size > 0) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: {
              message:
                'An assistant message with "tool_calls" must be followed by tool messages responding to each "tool_call_id".',
              code: 'invalid_parameter_error'
            }
          })
        );
        return;
      }

      // 模拟 DashScope / OpenAI 严格 assistant 契约：无 tool_calls 的 assistant 必须包含非空 content。
      const hasAssistantWithoutContentOrTools = msgs.some(
        (message) =>
          message.role === 'assistant' &&
          !(
            'tool_calls' in message &&
            Array.isArray(message.tool_calls) &&
            message.tool_calls.length > 0
          ) &&
          (typeof message.content !== 'string' || message.content.length === 0)
      );
      if (hasAssistantWithoutContentOrTools) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: {
              message:
                'An assistant message without "tool_calls" must include non-empty "content".',
              code: 'invalid_parameter_error'
            }
          })
        );
        return;
      }
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
  it.each(['toolChoice', 'prompt'] as const)(
    'sends paired filtered history on %s initial and continuation requests',
    async (toolCallMode) => {
      rounds.push({ text: 'Partial', finish: 'length' }, { text: 'Complete.', finish: 'stop' });
      const prompt = toolCallMode === 'prompt';
      const searchCall = call('search');
      const messages = filterToolMessages(
        chats2GPTMessages({
          reserveId: false,
          reserveTool: true,
          messages: [
            { obj: ChatRoleEnum.Human, value: [{ text: { content: message } }] },
            {
              obj: ChatRoleEnum.AI,
              value: [
                { name: 'old_index', text: 'Checking the old index.', response: 'Old data' },
                { name: 'search', text: 'Searching.', response: 'Search result' }
              ].map(({ name, text, response }) => ({
                modelResponseId: name,
                text: { content: text },
                tools: [
                  {
                    id: searchCall.id,
                    functionName: name,
                    params: searchCall.function.arguments,
                    response
                  }
                ]
              }))
            },
            { obj: ChatRoleEnum.Human, value: [{ text: { content: 'Summarize.' } }] }
          ]
        }),
        (name) => name === 'search'
      );

      const response = await createLLMResponse({
        teamId,
        maxRetries: 0,
        maxContinuations: 2,
        saveLLMResponseRecord: false,
        body: { ...body(false), toolCallMode, messages }
      });

      expect(response.error).toBeUndefined();
      expect(received).toHaveLength(2);
      for (const request of received) {
        expect(request.tools).toEqual(prompt ? undefined : tools);
        if (prompt) {
          expect(
            request.messages?.some((message) => message.role === 'assistant' && message.tool_calls)
          ).toBe(false);
        }
        const history = request.messages?.slice(prompt ? 2 : 1, prompt ? 6 : 3);
        expect(history).toMatchObject(
          prompt
            ? [
                { role: 'assistant', content: '0: Checking the old index.' },
                { role: 'assistant', content: '0: Searching.' },
                { role: 'assistant', content: `1: ${JSON.stringify(searchCall.function)}` },
                { role: 'user', content: '<ToolResponse>\nSearch result\n</ToolResponse>' }
              ]
            : [
                {
                  role: 'assistant',
                  content: 'Checking the old index.Searching.',
                  tool_calls: [searchCall]
                },
                { role: 'tool', tool_call_id: searchCall.id, content: 'Search result' }
              ]
        );
      }
    }
  );

  it.each([true, false])(
    'preserves reasoning through tool rounds and serialized resume: stream=%s',
    async (stream) => {
      rounds.push(
        { requireReasoning: true, toolCalls: [call('search')] },
        {
          requireReasoning: true,
          reasoning: 'Keep the original reasoning.',
          toolCalls: [{ ...call('search'), id: 'call_second' }]
        },
        { requireReasoning: true, text: 'Task complete.', finish: 'stop' },
        { requireReasoning: true, text: 'Resumed.', finish: 'stop' }
      );
      const result = await runAgentLoop({
        teamId,
        maxRunAgentTimes: 3,
        body: body(stream),
        isAborted: () => false,
        onRunTool: async () => ({ response: 'Tool completed.', assistantMessages: [], usages: [] }),
        onRunInteractiveTool: vi.fn()
      });
      expect(result.error).toBeUndefined();
      expect(received).toHaveLength(3);
      expect(
        result.assistantMessages
          .filter((message) => message.role === 'assistant')
          .map((message) => message.reasoning_content)
      ).toEqual(['', 'Keep the original reasoning.', '']);

      const resumed = await createLLMResponse({
        teamId,
        maxRetries: 0,
        body: {
          ...body(stream),
          messages: [
            ...JSON.parse(JSON.stringify(result.completeMessages)),
            { role: 'user', content: 'Continue.' }
          ]
        }
      });
      expect(resumed.error).toBeUndefined();
      expect(resumed.answerText).toBe('Resumed.');
      expect(received).toHaveLength(4);
      for (const request of received) {
        for (const message of request.messages ?? []) {
          if (message.role === 'assistant') {
            expect(message.reasoning_content).toBeTypeOf('string');
          }
        }
      }
      const record = await readRecord(resumed.requestId);
      expect(record.body.messages).toEqual(received[3].messages);
    }
  );

  it.each(
    [true, false].flatMap((stream) => [true, false].map((reasoning) => ({ stream, reasoning })))
  )(
    'retains empty reasoning during text continuation only when supported: stream=$stream, reasoning=$reasoning',
    async ({ stream, reasoning }) => {
      rounds.push(
        { text: 'Partial ', finish: 'length', requireReasoning: reasoning },
        { text: 'answer.', finish: 'stop', requireReasoning: reasoning }
      );
      const result = await createLLMResponse({
        teamId,
        maxContinuations: 2,
        body: {
          ...body(stream),
          model: { ...model, config: { ...model.config, reasoning } }
        }
      });
      expect(result.answerText).toBe('Partial answer.');
      expect(received).toHaveLength(2);
      const assistant = received[1].messages?.find((message) => message.role === 'assistant');
      if (reasoning) {
        expect(assistant).toHaveProperty('reasoning_content', '');
        expect(result.assistantMessage).toHaveProperty('reasoning_content', '');
      } else {
        expect(assistant).not.toHaveProperty('reasoning_content');
        expect(result.assistantMessage).not.toHaveProperty('reasoning_content');
      }
    }
  );

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
      expectedTools: { id?: string; name?: string; args: string; streamedArgs?: string }[];
      expectedBlockedReasons?: ('length' | 'invalid_args' | 'moderation')[];
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
        (result.toolCalls ?? []).forEach((tool, idx) => {
          const args = replay.get(tool.id)!;
          const expectedStreamed = scenario.expectedTools[idx]?.streamedArgs;
          if (expectedStreamed !== undefined) {
            expect(args).toBe(expectedStreamed);
          } else {
            expect(args.trim() ? args : '{}').toBe(tool.function.arguments);
          }
          const expectedReason = scenario.expectedBlockedReasons?.[idx];
          if (expectedReason) {
            expect(result.blockedToolCalls?.[tool.id]).toBe(expectedReason);
          }
        });
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
        label: 'anonymous fragments are not guessed into one call and invalid args are sanitized',
        chunks: [
          toolChunk({ name: 'search', args: '{"q":' }),
          toolChunk({ args: '1}' }),
          end,
          usageChunk
        ],
        expectedTools: [{ args: '{}', streamedArgs: '{"q":' }],
        expectedBlockedReasons: ['invalid_args']
      },
      {
        label: 'length rewrites incomplete arguments to {} and marks length blocked',
        chunks: [
          toolChunk({ index: 0, id: 'a', name: 'search', args: '{"q":' }),
          chunk({}, 'length'),
          usageChunk
        ],
        expectedTools: [{ id: 'a', args: '{}', streamedArgs: '{"q":' }],
        expectedBlockedReasons: ['length'],
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
      // 用户主动中断时丢弃未完成的工具调用，防止后续被误执行或落库。
      expect(result.toolCalls ?? []).toEqual([]);
      expect(result.usage).toMatchObject({ inputTokens: 17, outputTokens: 4 });
      expect(onToolCall).toHaveBeenCalledTimes(1);
      expect(onToolParam).not.toHaveBeenCalled();
      const record = await readRecord(result.requestId);
      expect(record.response.finish_reason).toBe('close');
      expect(record.response.toolCalls ?? []).toEqual([]);
      expect(record.response.usage).toMatchObject({ inputTokens: 17, outputTokens: 4 });
    });

    it('drops unfinished tool calls when abort lands right before EOF without a further chunk', async () => {
      rounds.push({
        chunks: [usageChunk, toolChunk({ index: 0, id: 'a', name: 'search', args: '{"q":' })],
        omitDone: true,
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
      expect(result.toolCalls ?? []).toEqual([]);
      expect(result.assistantMessage).not.toHaveProperty('tool_calls');
      expect(result.usage).toMatchObject({ inputTokens: 17, outputTokens: 4 });
      const record = await readRecord(result.requestId);
      expect(record.response.finish_reason).toBe('close');
      expect(record.response.toolCalls ?? []).toEqual([]);
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
          // error 场景丢弃对外 toolCalls，避免被误执行或污染上下文；请求日志保留上游原始残缺数据用于排障。
          expect(result.toolCalls ?? []).toEqual([]);
          expect(result.assistantMessage).not.toHaveProperty('tool_calls');
          expect(onToolParam).not.toHaveBeenCalled();
          expect(result.usage).toMatchObject({ inputTokens: 17, outputTokens: 4 });
          expect(
            log.mock.calls.some(([message]) => String(message) === 'LLM tool calls missing')
          ).toBe(false);
          const record = await readRecord(result.requestId);
          expect(record.response.finish_reason).toBe('error');
          expect(record.response.error).toBeDefined();
          expect(record.response.toolCalls).toEqual([
            { id: 'a', type: 'function', function: { name: 'search', arguments: '{"q":' } }
          ]);
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

    describe('tool call arguments end-to-end integration with strict upstream validation', () => {
      const runIntegratedLoop = async ({
        messages = [{ role: 'user' as const, content: message }],
        lang = LangEnum.zh_CN,
        isAborted = () => false,
        onRunTool,
        onToolCallHook
      }: {
        messages?: ChatCompletionMessageParam[];
        lang?: `${LangEnum}`;
        isAborted?: () => boolean;
        onRunTool?: (args: { call: ChatCompletionMessageToolCall }) => Promise<{
          response: string;
          assistantMessages: ChatCompletionMessageParam[];
          usages: [];
        }>;
        onToolCallHook?: (call: ChatCompletionMessageToolCall) => void;
      }) => {
        const collector = createAgentLoopCoreAssistantEventCollector();
        const runToolSpy = vi.fn(
          onRunTool ??
            (async ({ call }: { call: ChatCompletionMessageToolCall }) => ({
              response: `ok:${call.id}:${call.function.arguments}`,
              assistantMessages: [],
              usages: []
            }))
        );
        const loopResult = await runAgentLoop({
          teamId,
          lang,
          maxRunAgentTimes: 5,
          body: { ...body(true), messages, tools: streamTools },
          isAborted,
          onRunTool: runToolSpy,
          onRunInteractiveTool: vi.fn(),
          onLLMRequestStart: (event) =>
            collector.emitEvent({ type: 'llm_request_start', ...event }),
          onReasoning: ({ text }) => collector.emitEvent({ type: 'reasoning_delta', text }),
          onStreaming: ({ text }) => collector.emitEvent({ type: 'answer_delta', text }),
          onToolCall: ({ call }) => {
            collector.emitEvent({ type: 'tool_call', call });
            onToolCallHook?.(call);
          },
          onToolParam: ({ call, argsDelta }) =>
            collector.emitEvent({ type: 'tool_params', callId: call.id, argsDelta }),
          onLLMRequestEnd: (event) =>
            collector.emitEvent({
              type: 'llm_request_end',
              ...event,
              toolCalls: event.toolCalls
            }),
          onToolRunEnd: (event) =>
            collector.emitEvent({
              type: 'tool_run_end',
              call: event.call,
              response: event.response,
              seconds: event.seconds
            })
        });
        for (const id of loopResult.requestIds) await readRecord(id);
        return { loopResult, collector, runToolSpy };
      };

      it.each([
        ['tool_calls', '{"q":'],
        ['stop', '[1,2]'],
        ['tool_calls', '"plain-string"']
      ] as const)(
        'skips invalid/non-object tool call (%s, %s), executes valid and empty siblings, and recovers under strict 400 validation',
        async (finish, brokenArgs) => {
          rounds.push(
            {
              chunks: [
                chunk({
                  tool_calls: [
                    toolDelta({ index: 0, id: 'valid_call', name: 'search', args: '{"q":"ok"}' }),
                    toolDelta({ index: 1, id: 'empty_call', name: 'search', args: '' }),
                    toolDelta({
                      index: 2,
                      id: 'bad_call',
                      name: 'search_content',
                      args: brokenArgs
                    })
                  ]
                }),
                chunk({}, finish),
                usageChunk
              ],
              wireMode: 'coalesced'
            },
            {
              requireValidToolArguments: true,
              text: 'Recovered after invalid args.',
              finish: 'stop'
            }
          );

          const { loopResult, collector, runToolSpy } = await runIntegratedLoop({});

          expect(loopResult.error).toBeUndefined();
          expect(collector.assistantResponses.at(-1)?.text?.content).toBe(
            'Recovered after invalid args.'
          );
          expect(received).toHaveLength(2);
          expect(
            runToolSpy.mock.calls.map(([{ call }]) => [call.id, call.function.arguments])
          ).toEqual([
            ['valid_call', '{"q":"ok"}'],
            ['empty_call', '{}']
          ]);

          const secondReqMessages = received[1].messages as any[];
          const assistantMsg = secondReqMessages.find(
            (item) => item.role === 'assistant' && item.tool_calls?.length
          );
          expect(
            assistantMsg.tool_calls.map((c: ChatCompletionMessageToolCall) => [
              c.id,
              c.function.arguments
            ])
          ).toEqual([
            ['valid_call', '{"q":"ok"}'],
            ['empty_call', '{}'],
            ['bad_call', '{}']
          ]);
          const badToolResp = secondReqMessages.find(
            (item) => item.role === 'tool' && item.tool_call_id === 'bad_call'
          );
          expect(badToolResp?.content).toBe(
            parseI18nString(LLM_TOOL_CALL_ARGUMENTS_INVALID_RESPONSE, LangEnum.zh_CN)
          );
          expect(
            collector.assistantResponses[0].tools?.find((t) => t.id === 'bad_call')
          ).toMatchObject({
            params: '{}',
            response: parseI18nString(LLM_TOOL_CALL_ARGUMENTS_INVALID_RESPONSE, LangEnum.zh_CN)
          });
        }
      );

      it('rewrites length-truncated tool calls to {}, skips execution, and passes strict 400 validation on retry', async () => {
        rounds.push(
          {
            chunks: [
              toolChunk({
                index: 0,
                id: 'len_call',
                name: 'search',
                args: '{"reason":"收集表单数据以生成专属HTML文件'
              }),
              chunk({}, 'length'),
              usageChunk
            ],
            wireMode: 'coalesced'
          },
          {
            requireValidToolArguments: true,
            text: 'Recovered after length truncation.',
            finish: 'stop'
          }
        );

        const { loopResult, collector, runToolSpy } = await runIntegratedLoop({});

        expect(loopResult.error).toBeUndefined();
        expect(collector.assistantResponses.at(-1)?.text?.content).toBe(
          'Recovered after length truncation.'
        );
        expect(runToolSpy).not.toHaveBeenCalled();
        expect(received).toHaveLength(2);

        const secondReqMessages = received[1].messages as any[];
        const assistantMsg = secondReqMessages.find(
          (item) => item.role === 'assistant' && item.tool_calls?.length
        );
        expect(assistantMsg.tool_calls).toEqual([
          { id: 'len_call', type: 'function', function: { name: 'search', arguments: '{}' } }
        ]);
        const toolMsg = secondReqMessages.find((item) => item.role === 'tool');
        expect(toolMsg?.content).toBe(
          parseI18nString(LLM_TOOL_CALL_ARGUMENTS_TRUNCATED_RESPONSE, LangEnum.zh_CN)
        );
        expect(collector.assistantResponses[0].tools?.[0]).toMatchObject({
          id: 'len_call',
          params: '{}',
          response: parseI18nString(LLM_TOOL_CALL_ARGUMENTS_TRUNCATED_RESPONSE, LangEnum.zh_CN)
        });
      });

      it('keeps valid tool and drops truncated sibling on abnormal_close across loop, collector, and strict next round', async () => {
        rounds.push(
          {
            chunks: [
              chunk({
                tool_calls: [
                  toolDelta({ index: 0, id: 'good_abn', name: 'search', args: '{"q":"kept"}' }),
                  toolDelta({ index: 1, id: 'bad_abn', name: 'search_content', args: '{"q":' })
                ]
              }),
              usageChunk
            ],
            omitDone: true,
            wireMode: 'coalesced'
          },
          {
            requireValidToolArguments: true,
            text: 'Continued after abnormal_close.',
            finish: 'stop'
          }
        );

        const { loopResult, collector, runToolSpy } = await runIntegratedLoop({});

        expect(loopResult.error).toBeUndefined();
        expect(collector.assistantResponses.at(-1)?.text?.content).toBe(
          'Continued after abnormal_close.'
        );
        expect(runToolSpy).toHaveBeenCalledTimes(1);
        expect(runToolSpy.mock.calls[0][0].call.id).toBe('good_abn');
        expect(collector.assistantResponses[0].toolCallIds).toEqual(['good_abn']);
        expect(collector.assistantResponses[0].tools?.map((t) => t.id)).toEqual(['good_abn']);
      });

      it.each([
        ['partial args', '{"reason":"收集表单数据'],
        ['already valid args', '{"q":"already-valid"}']
      ] as const)(
        'drops all tool calls on user close (%s), cleans collector cards, and replays next chat turn under strict 400 validation',
        async (_label, args) => {
          rounds.push(
            {
              chunks: [
                chunk({ content: '正在准备回答您的请求，先查询资料' }),
                toolChunk({ index: 0, id: 'stop_call', name: 'search', args }),
                usageChunk
              ],
              omitDone: true,
              wireMode: 'coalesced'
            },
            {
              requireValidToolArguments: true,
              text: 'Follow-up succeeded.',
              finish: 'stop'
            }
          );

          let aborted = false;
          const firstTurn = await runIntegratedLoop({
            isAborted: () => aborted,
            onToolCallHook: () => {
              aborted = true;
            }
          });

          expect(firstTurn.loopResult.error).toBeUndefined();
          expect(firstTurn.loopResult.finish_reason).toBe('close');
          expect(firstTurn.runToolSpy).not.toHaveBeenCalled();
          expect(firstTurn.collector.assistantResponses).toHaveLength(1);
          expect(firstTurn.collector.assistantResponses[0]).toMatchObject({
            text: { content: '正在准备回答您的请求，先查询资料' }
          });
          expect(firstTurn.collector.assistantResponses[0]).not.toHaveProperty('tools');

          // 模拟页面刷新后基于落库 ChatItem 继续下一轮对话，严格校验上游不会 400。
          const persistedHistory: ChatItemMiniType[] = [
            { obj: ChatRoleEnum.Human, value: [{ text: { content: message } }] },
            { obj: ChatRoleEnum.AI, value: firstTurn.collector.assistantResponses },
            { obj: ChatRoleEnum.Human, value: [{ text: { content: '继续' } }] }
          ];
          const replayed = chats2GPTMessages({
            messages: persistedHistory,
            reserveId: false,
            reserveTool: true
          });
          const secondTurn = await runIntegratedLoop({ messages: replayed });
          expect(secondTurn.loopResult.error).toBeUndefined();
          expect(secondTurn.collector.assistantResponses.at(-1)?.text?.content).toBe(
            'Follow-up succeeded.'
          );
        }
      );

      it('drops all tool calls and cleans collector cards on content_filter', async () => {
        rounds.push({
          chunks: [
            chunk({ content: 'partial' }),
            toolChunk({ index: 0, id: 'cf_call', name: 'search', args: '{"q":"ok"}' }),
            chunk({}, 'content_filter'),
            usageChunk
          ],
          wireMode: 'coalesced'
        });

        const { loopResult, collector, runToolSpy } = await runIntegratedLoop({});

        expect(loopResult.error).toBeUndefined();
        expect(loopResult.finish_reason).toBe('content_filter');
        expect(runToolSpy).not.toHaveBeenCalled();
        expect(collector.assistantResponses[0]).not.toHaveProperty('tools');
        expect(collector.assistantResponses[0]).toMatchObject({ text: { content: 'partial' } });
      });

      it.each([
        ['tool-only first round omits empty assistant', undefined, undefined],
        [
          'reasoning + tool without text omits assistant without content',
          undefined,
          '先思考再调工具'
        ],
        [
          'text + reasoning + tool first round keeps only replayable text and reasoning',
          '先梳理一下需要查询的内容，稍等',
          '先思考一下'
        ]
      ] as const)(
        'continuation omits unexecuted length tool_calls and contentless assistant (%s), passes strict 400 check, and keeps tools blocked',
        async (_label, partialText, partialReasoning) => {
          rounds.push(
            {
              chunks: [
                ...(partialReasoning ? [chunk({ reasoning_content: partialReasoning })] : []),
                ...(partialText ? [chunk({ content: partialText })] : []),
                toolChunk({
                  index: 0,
                  id: 'cont_len_call',
                  name: 'search',
                  args: '{"reason":"截断在续写首轮的半截参数'
                }),
                chunk({}, 'length'),
                usageChunk
              ],
              wireMode: 'coalesced'
            },
            {
              requireValidToolArguments: true,
              text: 'Continuation finished.',
              finish: 'stop'
            }
          );

          const result = await createLLMResponse({
            teamId,
            throwError: false,
            maxContinuations: 2,
            body: { ...body(true), tools: streamTools }
          });

          expect(result.error).toBeUndefined();
          expect(received).toHaveLength(2);
          // 续写请求不得携带无回执的 tool_calls；无正文（即使有 reasoning_content）也必须省略该 assistant。
          expect(received[1].messages).toEqual([
            { role: 'user', content: message },
            ...(partialText
              ? [
                  {
                    role: 'assistant',
                    content: partialText,
                    reasoning_content: partialReasoning ?? ''
                  }
                ]
              : []),
            { role: 'user', content: '[继续输出]' }
          ]);
          expect(result.reasoningText).toBe(partialReasoning ?? '');
          expect(result.finish_reason).toBe('stop');
          expect(result.toolCalls).toEqual([
            { id: 'cont_len_call', type: 'function', function: { name: 'search', arguments: '{}' } }
          ]);
          // 中间 length 轮产生的调用即使续写后以 stop 结束，也必须保持 length 阻断，不可执行。
          expect(result.blockedToolCalls).toEqual({ cont_len_call: 'length' });
          await readRecord(result.requestId);
        }
      );

      it('preserves moderation redaction in error request record when continuation reuses tool call id before failing', async () => {
        const moderationSpy = vi
          .spyOn(outputModeration, 'checkToolParamsModeration')
          .mockResolvedValueOnce({
            isPass: false,
            blockedToolCallIds: ['dup_len_call']
          })
          .mockResolvedValueOnce({
            isPass: true
          });

        rounds.push(
          {
            chunks: [
              toolChunk({
                index: 0,
                id: 'dup_len_call',
                name: 'search',
                args: '{"query":"toxic-secret-param"}'
              }),
              chunk({}, 'length'),
              usageChunk
            ],
            wireMode: 'coalesced'
          },
          {
            chunks: [
              toolChunk({
                index: 0,
                id: 'dup_len_call',
                name: 'search',
                args: '{"query":"clean-reused-id'
              }),
              chunk({}, 'length'),
              usageChunk
            ],
            wireMode: 'coalesced'
          },
          {
            chunks: [
              toolChunk({
                index: 0,
                id: 'err_trunc_call',
                name: 'search_content',
                args: '{"q":'
              }),
              usageChunk
            ],
            upstreamError: true,
            wireMode: 'coalesced'
          }
        );

        const result = await createLLMResponse({
          teamId,
          throwError: false,
          maxContinuations: 3,
          body: { ...body(true), tools: streamTools }
        });

        expect(moderationSpy).toHaveBeenCalledTimes(2);
        expect(result.finish_reason).toBe('error');
        expect(result.toolCalls ?? []).toEqual([]);
        const record = await readRecord(result.requestId);
        // 即使次轮复用了同 ID 且未被拦截，首轮审核拦截的参数仍必须脱敏为 '{}'，其余未拦截轮次保留排障现场。
        expect(record.response.toolCalls).toEqual([
          { id: 'dup_len_call', type: 'function', function: { name: 'search', arguments: '{}' } },
          {
            id: 'dup_len_call',
            type: 'function',
            function: { name: 'search', arguments: '{"query":"clean-reused-id' }
          },
          {
            id: 'err_trunc_call',
            type: 'function',
            function: { name: 'search_content', arguments: '{"q":' }
          }
        ]);
        expect(JSON.stringify(record.response)).not.toContain('toxic-secret-param');
      });

      it('estimates fallback outputTokens from raw model tool arguments when upstream omits usage', async () => {
        const { countGptMessagesTokens } =
          await import('@fastgpt/service/common/string/tiktoken/index');
        const countSpy = vi.mocked(countGptMessagesTokens);
        countSpy.mockClear();

        const rawLongArgs = `{"payload":"${'长参数内容'.repeat(40)}`;
        rounds.push({
          chunks: [
            toolChunk({ index: 0, id: 'bill_call', name: 'search', args: rawLongArgs }),
            chunk({}, 'length')
          ],
          wireMode: 'coalesced'
        });

        const result = await createLLMResponse({
          teamId,
          throwError: false,
          body: { ...body(true), tools: streamTools }
        });

        expect(result.error).toBeUndefined();
        expect(result.toolCalls).toEqual([
          { id: 'bill_call', type: 'function', function: { name: 'search', arguments: '{}' } }
        ]);
        expect(result.blockedToolCalls).toEqual({ bill_call: 'length' });
        // 兜底 outputTokens 估算必须使用未清洗的原始参数，不能按 '{}' 低估计费。
        const outputTokenCountCall = countSpy.mock.calls.find(([arg]) =>
          arg.messages?.some((m: any) => m.role === 'assistant')
        );
        expect(outputTokenCountCall?.[0].messages).toEqual([
          expect.objectContaining({
            role: 'assistant',
            tool_calls: [
              {
                id: 'bill_call',
                type: 'function',
                function: { name: 'search', arguments: rawLongArgs }
              }
            ]
          })
        ]);
        await readRecord(result.requestId);
      });
    });
  });
});
