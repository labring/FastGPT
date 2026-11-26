import { once } from 'node:events';
import { createServer, type Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LLM_TOOL_CALL_ARGUMENTS_TRUNCATED_RESPONSE,
  ModelScopeEnum,
  ModelTypeEnum
} from '@fastgpt/global/core/ai/constants';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import type { LLMModelDataType } from '@fastgpt/global/core/ai/model/schema';
import { runPiAgentLoop } from '@fastgpt/service/core/ai/llm/agentLoop/provider/piAgent/run';

const { checkToolParamsModerationMock } = vi.hoisted(() => ({
  checkToolParamsModerationMock: vi.fn()
}));

// 模型供应商替换成本地 SSE；Pi Agent、pi-ai 的流式解析与参数校验均运行真实实现。
vi.mock('@fastgpt/service/core/ai/llm/compress', () => ({
  compressRequestMessages: async ({ messages }: { messages: unknown[] }) => ({ messages })
}));
vi.mock('@fastgpt/service/common/string/tiktoken/index', () => ({
  countGptMessagesTokens: vi.fn(async () => 100),
  countPromptTokens: vi.fn(async () => 100)
}));
vi.mock('@fastgpt/service/core/plugin/moderation/output', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/plugin/moderation/output')>()),
  checkToolParamsModeration: checkToolParamsModerationMock
}));

let server: Server;
let model: LLMModelDataType;
let truncatedArguments: string;
const requestBodies: any[] = [];
const teamId = '507f1f77bcf86cd799439011';
const truncatedResponse = parseI18nString(LLM_TOOL_CALL_ARGUMENTS_TRUNCATED_RESPONSE, 'en');

const frame = (delta: Record<string, unknown>, finishReason: string | null) => ({
  id: 'pi-length-test',
  created: 1,
  model: 'pi-length-test',
  object: 'chat.completion.chunk',
  choices: [{ index: 0, delta, finish_reason: finishReason }]
});

beforeEach(async () => {
  requestBodies.length = 0;
  checkToolParamsModerationMock.mockReset();
  checkToolParamsModerationMock.mockResolvedValue({ isPass: true });
  server = createServer(async (req, res) => {
    let rawBody = '';
    for await (const bytes of req) rawBody += bytes.toString();
    requestBodies.push(JSON.parse(rawBody));
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    // 第一次请求：工具参数被输出上限截断；之后正常回答。
    const frames =
      requestBodies.length === 1
        ? [
            frame(
              {
                role: 'assistant',
                tool_calls: [
                  {
                    index: 0,
                    id: 'call_truncated',
                    type: 'function',
                    function: { name: 'search', arguments: truncatedArguments }
                  }
                ]
              },
              'length'
            )
          ]
        : [frame({ role: 'assistant', content: 'done' }, 'stop')];
    for (const item of frames) res.write(`data: ${JSON.stringify(item)}\n\n`);
    res.end('data: [DONE]\n\n');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Failed to bind test server');
  model = {
    modelId: '507f1f77bcf86cd799439012',
    model: 'pi-length-test',
    name: 'Pi length test',
    provider: 'OpenAI',
    type: ModelTypeEnum.llm,
    scope: ModelScopeEnum.system,
    isActive: true,
    requestUrl: `http://127.0.0.1:${address.port}/v1/chat/completions`,
    requestAuth: 'local-test',
    config: { maxContext: 100000, maxResponse: 10000, quoteMaxToken: 80000 }
  };
});

afterEach(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  });
});

const runTruncatedToolCall = async () => {
  const events: any[] = [];
  const executeTool = vi.fn().mockResolvedValue({
    response: 'Search completed.',
    assistantMessages: [],
    usages: []
  });
  const result = await runPiAgentLoop({
    input: { messages: [{ role: 'user', content: 'hello' }] },
    runtime: {
      teamId,
      lang: 'en',
      llmParams: { model },
      toolCatalog: {
        runtimeTools: [
          {
            type: 'function',
            function: {
              name: 'search',
              description: 'Search',
              parameters: {
                type: 'object',
                properties: { q: { type: 'string' } },
                required: ['q']
              }
            }
          }
        ]
      },
      executeTool,
      checkIsStopping: vi.fn(() => false),
      emitEvent: (event) => events.push(event)
    }
  });
  const nextRequestMessages: any[] = requestBodies[1]?.messages ?? [];
  return {
    result,
    events,
    executeTool,
    toolRunEnd: events.find(
      (event) => event.type === 'tool_run_end' && event.call.id === 'call_truncated'
    ),
    nextToolMessage: nextRequestMessages.find(
      (message) => message.role === 'tool' && message.tool_call_id === 'call_truncated'
    ),
    nextAssistantToolCall: nextRequestMessages
      .find((message) => message.role === 'assistant' && message.tool_calls)
      ?.tool_calls.find((call: any) => call.id === 'call_truncated')
  };
};

const toolMessageText = (message: any) =>
  typeof message?.content === 'string'
    ? message.content
    : (message?.content ?? []).map((part: any) => part.text ?? '').join('');

describe('piAgent tool calls truncated by the output token limit (real SDK)', () => {
  it.each([
    // partial-json 补成 {"q":"incomp"}，参数校验通过，由 beforeToolCall 拦截。
    { name: 'arguments that still validate', args: '{"q":"incomp' },
    // 补成 {"other":"x"}，缺必填 q，SDK 在 beforeToolCall 之前就校验失败。
    { name: 'a missing required field', args: '{"other":"x' }
  ])('answers a call with $name with the truncation notice', async ({ args }) => {
    truncatedArguments = args;
    const { result, executeTool, toolRunEnd, nextToolMessage } = await runTruncatedToolCall();

    expect(result.status).toBe('done');
    expect(executeTool).not.toHaveBeenCalled();
    expect(requestBodies).toHaveLength(2);
    expect(toolMessageText(nextToolMessage)).toBe(truncatedResponse);
    expect(toolRunEnd).toMatchObject({ response: truncatedResponse });
    expect(result.completeMessages).toContainEqual({
      role: 'tool',
      tool_call_id: 'call_truncated',
      content: truncatedResponse
    });
  });

  it('waits for the parameter review and masks rejected arguments', async () => {
    truncatedArguments = '{"q":"secret';
    checkToolParamsModerationMock.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ isPass: false }), 200))
    );
    const { result, executeTool, toolRunEnd, nextToolMessage, nextAssistantToolCall } =
      await runTruncatedToolCall();

    expect(executeTool).not.toHaveBeenCalled();
    expect(toolRunEnd?.call.function.arguments).toBe('{}');
    expect(nextAssistantToolCall?.function.arguments).toBe('{}');
    expect(toolMessageText(nextToolMessage)).toBe(truncatedResponse);
    expect(JSON.stringify(requestBodies[1])).not.toContain('secret');
    expect(JSON.stringify(result.completeMessages)).not.toContain('secret');
  });
});
