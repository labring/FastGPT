import { ModelPricingSchema, type LLMModelDataType } from '@fastgpt/global/core/ai/model/schema';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { MongoAIModel } from '@fastgpt/service/core/ai/model/schema';
import { formatDbModelToRuntimeModel } from '@fastgpt/service/core/ai/model/runtime';
import { createLLMResponse } from '@fastgpt/service/core/ai/llm/request/createLLMResponse';
import { getAIApi } from '@fastgpt/service/core/ai/config';
import { MongoLLMRequestRecord } from '@fastgpt/service/core/ai/record/schema';
import * as recordController from '@fastgpt/service/core/ai/record/controller';
import { runAgentLoop } from '@fastgpt/service/core/ai/llm/agentLoop/provider/fastAgent/loop/base';
import { formatModelChars2Points } from '@fastgpt/service/support/wallet/usage/utils';

// 远端模型替换为本地 HTTP 服务，独立 tokenizer worker 使用固定上下文预算。
// 供应商 usage、SDK、JSON/SSE 解析、计价与 Mongo 均执行真实实现。
vi.mock('@fastgpt/service/core/ai/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/ai/config')>()),
  getAIApi: vi.fn()
}));

vi.mock('@fastgpt/service/common/string/tiktoken/index', () => ({
  countGptMessagesTokens: vi.fn(async () => 100),
  countPromptTokens: vi.fn(async () => 100)
}));

const createModel = (): LLMModelDataType => ({
  modelId: '507f1f77bcf86cd799439012',
  model: 'million-test',
  name: 'Million test',
  provider: 'openai',
  type: ModelTypeEnum.llm,
  scope: ModelScopeEnum.system,
  pricing: { tiers: [{ inputPrice: 2000, outputPrice: 4000 }] },
  config: { maxContext: 100000, maxResponse: 10000, quoteMaxToken: 80000 }
});

const teamId = '507f1f77bcf86cd799439011';
let server: Server;
let requests: boolean[];
let continuation: boolean;
let localClient: ReturnType<typeof getAIApi>;

beforeEach(async () => {
  requests = [];
  continuation = false;
  server = createServer(async (req, res) => {
    let rawBody = '';
    for await (const bytes of req) rawBody += bytes.toString();
    const body = JSON.parse(rawBody);
    requests.push(body.stream);
    const finish_reason = continuation && requests.length === 1 ? 'length' : 'stop';
    const usage = {
      prompt_tokens: 10000,
      completion_tokens: 2000,
      total_tokens: 12000
    };
    const metadata = { id: 'million-test', created: 1, model: body.model };
    if (!body.stream) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          ...metadata,
          object: 'chat.completion',
          usage,
          choices: [{ index: 0, message: { role: 'assistant', content: 'answer' }, finish_reason }]
        })
      );
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const frames = [
      {
        ...metadata,
        object: 'chat.completion.chunk',
        choices: [{ index: 0, delta: { role: 'assistant', content: 'answer' }, finish_reason }]
      },
      { ...metadata, object: 'chat.completion.chunk', choices: [], usage }
    ];
    for (const frame of frames) res.write(`data: ${JSON.stringify(frame)}\n\n`);
    res.end('data: [DONE]\n\n');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Failed to bind test server');
  const baseUrl = `http://127.0.0.1:${address.port}/v1`;
  const actual = await vi.importActual<typeof import('@fastgpt/service/core/ai/config')>(
    '@fastgpt/service/core/ai/config'
  );
  const client = actual.getAIApi({ userKey: { key: 'local-test', baseUrl }, timeout: 5000 });
  localClient = { ...client, requestMeta: { baseUrl, usedUserOpenAIKey: false } };
  vi.mocked(getAIApi).mockReturnValue(localClient);
});

afterEach(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  });
  vi.restoreAllMocks();
});

describe('million-unit pricing with real HTTP/SSE and MongoDB', () => {
  it.each([false, true])(
    'persists million-unit prices, parses usage and bills once, stream=%s',
    async (stream) => {
      const { modelId: _modelId, ...document } = createModel();
      const saved = await MongoAIModel.create(document);
      const stored = await MongoAIModel.findById(saved._id).lean();
      const storedModel = formatDbModelToRuntimeModel(stored!, { fallbackProvider: true });
      if (storedModel.type !== ModelTypeEnum.llm) throw new Error('Expected LLM model');
      const writes = vi.spyOn(recordController, 'saveLLMRequestRecord');
      const result = await createLLMResponse({
        teamId,
        body: { model: storedModel, stream, messages: [{ role: 'user', content: 'hello' }] }
      });
      expect(result.usage).toEqual({
        inputTokens: 10000,
        outputTokens: 2000,
        usedUserOpenAIKey: false
      });
      expect(
        formatModelChars2Points({ model: storedModel, ...result.usage }).totalPoints
      ).toBeCloseTo(28);
      await Promise.all(writes.mock.results.map(({ value }) => value));
      const record = await MongoLLMRequestRecord.findOne({ requestId: result.requestId }).lean();
      expect(record?.response.usage).toMatchObject({ inputTokens: 10000, outputTokens: 2000 });
      expect(ModelPricingSchema.parse(stored?.pricing).tiers?.[0]).toMatchObject({
        inputPrice: 2000,
        outputPrice: 4000
      });
    }
  );

  it('accumulates continuation usage and bills million-unit prices', async () => {
    continuation = true;
    const model = createModel();
    const result = await createLLMResponse({
      teamId,
      saveLLMResponseRecord: false,
      maxContinuations: 2,
      body: { model, stream: true, messages: [{ role: 'user', content: 'continue' }] }
    });
    expect(requests).toHaveLength(2);
    expect(result.usage).toMatchObject({
      inputTokens: 20000,
      outputTokens: 4000
    });
    expect(formatModelChars2Points({ model, ...result.usage }).totalPoints).toBe(56);
  });
});

it.each([false, true])(
  'bills an Agent request with million-unit prices and respects user keys: %s',
  async (userKey) => {
    vi.mocked(getAIApi).mockReturnValue({
      ...localClient,
      requestMeta: {
        ...localClient.requestMeta,
        usedUserOpenAIKey: userKey
      }
    });

    const model = createModel();
    const onLLMRequestEnd = vi.fn();
    const writes = vi.spyOn(recordController, 'saveLLMRequestRecord');
    const result = await runAgentLoop({
      teamId,
      maxRunAgentTimes: 1,
      isAborted: () => false,
      onRunInteractiveTool: vi.fn(),
      body: { model, stream: true, tools: [], messages: [{ role: 'user', content: 'hello' }] },
      onRunTool: vi.fn(),
      onLLMRequestEnd
    });
    expect(result).toMatchObject({
      inputTokens: 10000,
      outputTokens: 2000
    });
    expect(result.llmTotalPoints).toBeCloseTo(userKey ? 0 : 28);
    expect(onLLMRequestEnd).toHaveBeenCalledWith(
      expect.objectContaining({
        usage: expect.objectContaining({
          inputTokens: 10000,
          outputTokens: 2000,
          totalPoints: userKey ? 0 : 28
        })
      })
    );
    await Promise.all(writes.mock.results.map(({ value }) => value));
  }
);
