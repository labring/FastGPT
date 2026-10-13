import { describe, expect, it } from 'vitest';
import { modelBodyCases, type ModelBodyCase } from './cases';

/** 支持 JSON 数组或逗号/换行分隔，方便本地和 CI 注入多模型列表。 */
const parseModels = (rawValue: string) => {
  const values = (() => {
    if (!rawValue.trimStart().startsWith('[')) {
      return rawValue.split(/[\n,]/);
    }

    const parsed = JSON.parse(rawValue) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error('AI_MODEL_BODY_TEST_MODELS must be a JSON array or comma-separated list');
    }
    return parsed;
  })();

  const models = Array.from(
    new Set(values.map((value) => (typeof value === 'string' ? value.trim() : '')).filter(Boolean))
  );
  if (models.length === 0) {
    throw new Error('AI_MODEL_BODY_TEST_MODELS must contain at least one model');
  }
  return models;
};

/** AI Proxy 配置通常不带 /v1，同时兼容直接传入完整 Chat Completions URL。 */
const getChatCompletionsUrl = (endpointValue: string) => {
  const endpoint = new URL(endpointValue);
  if (!['http:', 'https:'].includes(endpoint.protocol)) {
    throw new Error('AIPROXY_API_ENDPOINT must use http or https');
  }

  endpoint.search = '';
  endpoint.hash = '';
  const basePath = endpoint.pathname.replace(/\/+$/, '');
  if (basePath.endsWith('/chat/completions')) return endpoint.toString();
  endpoint.pathname = basePath.endsWith('/v1')
    ? `${basePath}/chat/completions`
    : `${basePath}/v1/chat/completions`;
  return endpoint.toString();
};

const parseTimeout = (rawValue: string | undefined) => {
  const timeout = rawValue ? Number(rawValue) : 60_000;
  if (!Number.isInteger(timeout) || timeout < 1_000 || timeout > 300_000) {
    throw new Error('AI_MODEL_BODY_TEST_TIMEOUT_MS must be an integer between 1000 and 300000');
  }
  return timeout;
};

/**
 * 三个必要环境变量都存在时才启用真实模型测试。
 * test/setup.ts 会先加载 test/.env.test.local，因此该文件可直接读取 process.env。
 */
const getIntegrationConfig = () => {
  const endpoint = process.env.AIPROXY_API_ENDPOINT?.trim();
  const apiKey = process.env.AIPROXY_API_TOKEN?.trim();
  const rawModels = process.env.AI_MODEL_BODY_TEST_MODELS?.trim();

  if (!endpoint || !apiKey || !rawModels) return;

  return {
    apiKey,
    chatCompletionsUrl: getChatCompletionsUrl(endpoint),
    models: parseModels(rawModels),
    requestTimeout: parseTimeout(process.env.AI_MODEL_BODY_TEST_TIMEOUT_MS)
  };
};

const integrationConfig = getIntegrationConfig();
const describeWithAiProxy = integrationConfig ? describe : describe.skip;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const parseJsonObject = (value: string, context: string) => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch (error) {
    throw new Error(
      `${context} is not valid JSON: ${error instanceof Error ? error.message : error}`
    );
  }
  expect(isRecord(parsed), `${context} should be a JSON object`).toBe(true);
  return parsed as Record<string, unknown>;
};

const assertContentExpectation = ({
  content,
  expectation
}: {
  content: unknown;
  expectation: Extract<ModelBodyCase['expectation'], { type: 'text' | 'json' }>;
}) => {
  expect(content).toEqual(expect.any(String));
  expect((content as string).trim().length).toBeGreaterThan(0);

  if (expectation.type === 'json') {
    const parsed = parseJsonObject(content as string, 'assistant content');
    if (expectation.expectedObject) {
      expect(parsed).toMatchObject(expectation.expectedObject);
    }
  }
};

/** 校验所有 OpenAI-compatible 非流式 Chat Completion 都应具备的公共响应结构。 */
const assertBaseResponse = (payload: unknown) => {
  expect(isRecord(payload)).toBe(true);
  const response = payload as Record<string, unknown>;
  expect(response.id).toEqual(expect.any(String));
  expect(response.object).toBe('chat.completion');
  expect(response.created).toEqual(expect.any(Number));
  expect(response.model).toEqual(expect.any(String));
  expect(Array.isArray(response.choices)).toBe(true);
  expect((response.choices as unknown[]).length).toBeGreaterThan(0);

  const choice = (response.choices as unknown[])[0];
  expect(isRecord(choice)).toBe(true);
  expect((choice as Record<string, unknown>).index).toEqual(expect.any(Number));
  const finishReason = (choice as Record<string, unknown>).finish_reason;
  expect(finishReason === null || typeof finishReason === 'string').toBe(true);

  const message = (choice as Record<string, unknown>).message;
  expect(isRecord(message)).toBe(true);
  expect((message as Record<string, unknown>).role).toBe('assistant');

  if (response.usage !== undefined && response.usage !== null) {
    expect(isRecord(response.usage)).toBe(true);
    expect((response.usage as Record<string, unknown>).total_tokens).toEqual(expect.any(Number));
  }

  return message as Record<string, unknown>;
};

const assertExpectedNonStreamResponse = ({
  payload,
  expectation
}: {
  payload: unknown;
  expectation: ModelBodyCase['expectation'];
}) => {
  const message = assertBaseResponse(payload);
  if (expectation.type === 'text' || expectation.type === 'json') {
    assertContentExpectation({ content: message.content, expectation });
    return;
  }

  expect(Array.isArray(message.tool_calls)).toBe(true);
  const toolCall = (message.tool_calls as unknown[])[0];
  expect(isRecord(toolCall)).toBe(true);
  expect((toolCall as Record<string, unknown>).id).toEqual(expect.any(String));
  expect((toolCall as Record<string, unknown>).type).toBe('function');

  const fn = (toolCall as Record<string, unknown>).function;
  expect(isRecord(fn)).toBe(true);
  expect((fn as Record<string, unknown>).name).toBe(expectation.toolName);
  expect((fn as Record<string, unknown>).arguments).toEqual(expect.any(String));

  const args = parseJsonObject(
    (fn as Record<string, unknown>).arguments as string,
    `${expectation.toolName} arguments`
  );
  if (expectation.emptyArguments) {
    expect(args).toEqual({});
  }
  if (expectation.expectedArguments) {
    expect(args).toMatchObject(expectation.expectedArguments);
  }
};

/** 提取 SSE data 行；Chat Completions 的每个 chunk 都应由一条 JSON data 行承载。 */
const parseSseData = (responseText: string) => {
  const dataLines = responseText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .filter(Boolean);

  expect(dataLines.length, 'stream should contain SSE data lines').toBeGreaterThan(0);
  expect(dataLines.includes('[DONE]'), 'stream should end with [DONE]').toBe(true);

  return dataLines
    .filter((data) => data !== '[DONE]')
    .map((data, index) => parseJsonObject(data, `stream chunk ${index}`));
};

/** 聚合流式 delta 后，按与非流式响应相同的业务期望校验文本或工具调用。 */
const assertExpectedStreamResponse = ({
  responseText,
  expectation
}: {
  responseText: string;
  expectation: ModelBodyCase['expectation'];
}) => {
  const chunks = parseSseData(responseText);
  expect(chunks.length).toBeGreaterThan(0);

  let content = '';
  let sawChoice = false;
  let sawAssistantRole = false;
  const toolCalls = new Map<
    number,
    { id: string; type: string; name: string; arguments: string }
  >();

  for (const chunk of chunks) {
    expect(chunk.id).toEqual(expect.any(String));
    expect(chunk.object).toBe('chat.completion.chunk');
    expect(chunk.created).toEqual(expect.any(Number));
    expect(chunk.model).toEqual(expect.any(String));
    expect(Array.isArray(chunk.choices)).toBe(true);

    for (const rawChoice of chunk.choices as unknown[]) {
      sawChoice = true;
      expect(isRecord(rawChoice)).toBe(true);
      const choice = rawChoice as Record<string, unknown>;
      expect(choice.index).toEqual(expect.any(Number));
      expect(
        choice.finish_reason === undefined ||
          choice.finish_reason === null ||
          typeof choice.finish_reason === 'string'
      ).toBe(true);
      expect(isRecord(choice.delta)).toBe(true);
      const delta = choice.delta as Record<string, unknown>;

      if (delta.role !== undefined) {
        expect(delta.role).toBe('assistant');
        sawAssistantRole = true;
      }
      if (delta.content !== undefined && delta.content !== null) {
        expect(delta.content).toEqual(expect.any(String));
        content += delta.content as string;
      }

      if (delta.tool_calls !== undefined) {
        expect(Array.isArray(delta.tool_calls)).toBe(true);
        for (const rawToolCall of delta.tool_calls as unknown[]) {
          expect(isRecord(rawToolCall)).toBe(true);
          const toolCall = rawToolCall as Record<string, unknown>;
          expect(toolCall.index).toEqual(expect.any(Number));
          const index = toolCall.index as number;
          const aggregate = toolCalls.get(index) ?? {
            id: '',
            type: '',
            name: '',
            arguments: ''
          };

          if (toolCall.id !== undefined) {
            expect(toolCall.id).toEqual(expect.any(String));
            if (toolCall.id) aggregate.id = toolCall.id as string;
          }
          if (toolCall.type !== undefined) {
            expect(toolCall.type === '' || toolCall.type === 'function').toBe(true);
            if (toolCall.type) aggregate.type = toolCall.type as string;
          }
          if (toolCall.function !== undefined) {
            expect(isRecord(toolCall.function)).toBe(true);
            const fn = toolCall.function as Record<string, unknown>;
            if (fn.name !== undefined) {
              expect(fn.name).toEqual(expect.any(String));
              if (fn.name) aggregate.name += fn.name as string;
            }
            if (fn.arguments !== undefined) {
              expect(fn.arguments).toEqual(expect.any(String));
              aggregate.arguments += fn.arguments as string;
            }
          }
          toolCalls.set(index, aggregate);
        }
      }
    }
  }

  expect(sawChoice, 'stream should contain at least one choice').toBe(true);
  expect(sawAssistantRole, 'stream should identify the assistant role').toBe(true);

  if (expectation.type === 'text' || expectation.type === 'json') {
    expect(toolCalls.size).toBe(0);
    assertContentExpectation({ content, expectation });
    return;
  }

  const toolCall = [...toolCalls.values()].find((item) => item.name === expectation.toolName);
  expect(toolCall, `stream should call ${expectation.toolName}`).toBeDefined();
  expect(toolCall?.id).toEqual(expect.any(String));
  expect(toolCall?.type).toBe('function');
  const args = parseJsonObject(toolCall?.arguments ?? '', `${expectation.toolName} arguments`);
  if (expectation.emptyArguments) {
    expect(args).toEqual({});
  }
  if (expectation.expectedArguments) {
    expect(args).toMatchObject(expectation.expectedArguments);
  }
};

const requestCases = modelBodyCases.flatMap((testCase) =>
  [false, true].map((stream) => ({ ...testCase, stream }))
);

describeWithAiProxy.each(integrationConfig?.models ?? ['AIProxy environment not configured'])(
  'AI Proxy Chat Completions body compatibility: %s',
  (model) => {
    it.each(requestCases)(
      '$name (stream: $stream)',
      async ({ body, expectation, stream }) => {
        if (!integrationConfig) return;

        const response = await fetch(integrationConfig.chatCompletionsUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${integrationConfig.apiKey}`,
            'Content-Type': 'application/json',
            Accept: 'application/json'
          },
          body: JSON.stringify({ ...body, model, stream }),
          signal: AbortSignal.timeout(integrationConfig.requestTimeout)
        });
        const responseText = await response.text();

        expect(
          response.ok,
          `[${model}] AI Proxy request failed (${response.status}): ${responseText.slice(0, 2000)}`
        ).toBe(true);

        if (stream) {
          expect(response.headers.get('content-type')).toContain('text/event-stream');
          assertExpectedStreamResponse({ responseText, expectation });
          return;
        }

        let payload: unknown;
        try {
          payload = JSON.parse(responseText);
        } catch {
          throw new Error(
            `[${model}] AI Proxy returned non-JSON response (${response.status}): ${responseText.slice(0, 2000)}`
          );
        }
        assertExpectedNonStreamResponse({ payload, expectation });
      },
      (integrationConfig?.requestTimeout ?? 60_000) + 5_000
    );
  }
);
