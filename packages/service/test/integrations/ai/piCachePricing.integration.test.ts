import { once } from 'node:events';
import { createServer, type Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { LLMModelDataType } from '@fastgpt/global/core/ai/model/schema';
import type { LLMCompletionUsage } from '@fastgpt/global/core/ai/llm/type';
import { runPiAgentLoop } from '@fastgpt/service/core/ai/llm/agentLoop/provider/piAgent/run';
import { createLLMResponse } from '@fastgpt/service/core/ai/llm/request/createLLMResponse';
import { formatModelChars2Points } from '@fastgpt/service/support/wallet/usage/utils';

// 模型供应商替换成本地 SSE；Pi Agent、SDK、普通请求的解析和计价均运行真实实现。
vi.mock('@fastgpt/service/core/ai/llm/compress', () => ({
  compressRequestMessages: async ({ messages }: { messages: unknown[] }) => ({ messages })
}));
vi.mock('@fastgpt/service/common/string/tiktoken/index', () => ({
  countGptMessagesTokens: vi.fn(async () => 100),
  countPromptTokens: vi.fn(async () => 100)
}));

let server: Server;
let model: LLMModelDataType;
let providerUsage: LLMCompletionUsage;
const teamId = '507f1f77bcf86cd799439011';

beforeEach(async () => {
  providerUsage = {
    prompt_tokens: 1000,
    completion_tokens: 20,
    total_tokens: 1020,
    prompt_tokens_details: { cache_read_tokens: 600, cache_creation_tokens: 100 }
  };
  server = createServer(async (req, res) => {
    let rawBody = '';
    for await (const bytes of req) rawBody += bytes.toString();
    const body = JSON.parse(rawBody);
    const metadata = { id: 'pi-cache-test', created: 1, model: body.model };
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const frames = [
      {
        ...metadata,
        object: 'chat.completion.chunk',
        choices: [
          { index: 0, delta: { role: 'assistant', content: 'answer' }, finish_reason: 'stop' }
        ]
      },
      { ...metadata, object: 'chat.completion.chunk', choices: [], usage: providerUsage }
    ];
    for (const frame of frames) res.write(`data: ${JSON.stringify(frame)}\n\n`);
    res.end('data: [DONE]\n\n');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Failed to bind test server');
  model = {
    modelId: '507f1f77bcf86cd799439012',
    model: 'pi-cache-test',
    name: 'Pi cache test',
    provider: 'OpenAI',
    type: ModelTypeEnum.llm,
    scope: ModelScopeEnum.system,
    isActive: true,
    requestUrl: `http://127.0.0.1:${address.port}/v1/chat/completions`,
    requestAuth: 'local-test',
    pricing: {
      tiers: [
        { inputPrice: 2000, outputPrice: 4000, cacheReadPrice: 200, cacheCreationPrice: 2500 }
      ]
    },
    config: { maxContext: 100000, maxResponse: 10000, quoteMaxToken: 80000 }
  };
});

afterEach(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  });
});

describe('Pi cache billing through the real SDK', () => {
  it.each([
    {
      name: 'explicit detail fields',
      fields: { prompt_tokens_details: { cache_read_tokens: 600, cache_creation_tokens: 100 } },
      read: 600,
      write: 100,
      points: 1.05
    },
    {
      name: 'top-level provider fields',
      fields: { prompt_cache_hit_tokens: 600, cache_creation_tokens: 100 },
      read: 600,
      write: 100,
      points: 1.05
    },
    {
      name: 'cached tokens including current writes',
      fields: { prompt_tokens_details: { cached_tokens: 700, cache_write_tokens: 100 } },
      read: 600,
      write: 100,
      points: 1.05
    },
    {
      name: 'explicit zero overrides fallback fields',
      fields: {
        cache_creation_tokens: 0,
        prompt_cache_hit_tokens: 600,
        prompt_tokens_details: { cache_read_tokens: 0, cache_creation_tokens: 100 }
      },
      read: 0,
      write: 0,
      points: 2.08
    },
    {
      name: 'cache counts above total input',
      fields: { prompt_tokens_details: { cache_read_tokens: 900, cache_creation_tokens: 2000 } },
      read: 0,
      write: 1000,
      points: 2.58
    },
    {
      name: 'negative cache counts',
      fields: { prompt_tokens_details: { cache_read_tokens: -600, cache_creation_tokens: -100 } },
      read: 0,
      write: 0,
      points: 2.08
    },
    { name: 'no cache fields', fields: {}, read: 0, write: 0, points: 2.08 }
  ])('matches ordinary requests for $name', async ({ fields, read, write, points }) => {
    providerUsage = {
      prompt_tokens: 1000,
      completion_tokens: 20,
      total_tokens: 1020,
      ...fields
    };
    const ordinary = await createLLMResponse({
      teamId,
      saveLLMResponseRecord: false,
      body: { model, stream: true, messages: [{ role: 'user', content: 'hello' }] }
    });
    const usagePush = vi.fn();
    const result = await runPiAgentLoop({
      input: { messages: [{ role: 'user', content: 'hello' }] },
      runtime: {
        teamId,
        llmParams: { model },
        toolCatalog: { runtimeTools: [] },
        executeTool: vi.fn(),
        usagePush
      }
    });

    expect(result.status).toBe('done');
    expect(result.usages).toEqual([
      expect.objectContaining({
        inputTokens: ordinary.usage.inputTokens,
        outputTokens: ordinary.usage.outputTokens,
        cacheReadTokens: read,
        cacheCreationTokens: write,
        totalPoints: points
      })
    ]);
    expect(result.usages?.[0].totalPoints).toBeCloseTo(
      formatModelChars2Points({ model, ...ordinary.usage }).totalPoints
    );
    expect(usagePush).toHaveBeenCalledExactlyOnceWith(result.usages);
  });
});
