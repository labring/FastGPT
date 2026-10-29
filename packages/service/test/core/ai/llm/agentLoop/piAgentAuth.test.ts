import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { streamSimple } from '@mariozechner/pi-ai';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { installSafeLegacyFetchShim, runWithSafeLegacyFetch } from '@fastgpt/service/common/api/safeFetch';
import {
  buildPiModel,
  getModelApiKey
} from '@fastgpt/service/core/ai/llm/agentLoop/provider/piAgent/modelBridge';
import { afterEach, describe, expect, it, vi } from 'vitest';

const createLlmModel = (overrides: Record<string, unknown> = {}) => ({
  modelId: '68ad85a7463006c963799a05',
  type: ModelTypeEnum.llm,
  provider: 'openai',
  model: 'test-model',
  name: 'Test Model',
  isActive: true,
  scope: 'system' as const,
  requestAuth: 'model-key',
  ...overrides,
  config: {
    maxContext: 128000,
    maxResponse: 4096,
    quoteMaxToken: 1000,
    functionCall: true,
    toolChoice: true,
    reasoning: false,
    reasoningEffort: false
  }
});

/**
 * provider 级回归测试：pi-ai 把空 apiKey 当作缺失并回退宿主环境变量，
 * 这里直接执行真实 provider，确认无鉴权端点既不泄露宿主 Key，也不会因缺少 Key 报错。
 */
describe('PiAgent custom endpoint auth', () => {
  let server: http.Server | undefined;
  const seen: Array<string | undefined> = [];

  const startServer = async () => {
    seen.length = 0;
    server = http.createServer((req, res) => {
      seen.push(req.headers.authorization);
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.end(
        [
          'data: {"id":"1","object":"chat.completion.chunk","created":0,"model":"test-model","choices":[{"index":0,"delta":{"role":"assistant","content":"ok"},"finish_reason":null}]}',
          '',
          'data: {"id":"1","object":"chat.completion.chunk","created":0,"model":"test-model","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}',
          '',
          'data: [DONE]',
          '',
          ''
        ].join('\n')
      );
    });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    return `http://127.0.0.1:${port}/v1/chat/completions`;
  };

  const run = async (modelData: ReturnType<typeof createLlmModel>) => {
    const piModel = buildPiModel(modelData as never);
    const stream = streamSimple(
      piModel,
      { messages: [{ role: 'user', content: 'hi', timestamp: Date.now() }] } as never,
      { apiKey: getModelApiKey(modelData as never), maxTokens: 16 }
    );

    try {
      // 只关心发出的请求头，流解析失败不影响断言。
      for await (const _event of stream) break;
    } catch {
      // ignore
    }
  };

  afterEach(async () => {
    vi.unstubAllEnvs();
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  });

  it('never sends host OPENAI_API_KEY when the endpoint has no auth', async () => {
    const requestUrl = await startServer();
    vi.stubEnv('OPENAI_API_KEY', 'host-secret');

    await run(createLlmModel({ requestUrl, requestAuth: undefined }));

    expect(seen).toEqual([undefined]);
  });

  it('works without OPENAI_API_KEY when the endpoint has no auth', async () => {
    const requestUrl = await startServer();
    vi.stubEnv('OPENAI_API_KEY', '');

    await run(createLlmModel({ requestUrl, requestAuth: undefined }));

    expect(seen).toEqual([undefined]);
  });

  it('sends the configured requestAuth instead of the host key', async () => {
    const requestUrl = await startServer();
    vi.stubEnv('OPENAI_API_KEY', 'host-secret');

    await run(createLlmModel({ requestUrl, requestAuth: 'team-secret' }));

    expect(seen).toEqual(['Bearer team-secret']);
  });

  it('routes pi-agent requests through the safe transport inside the endpoint scope', async () => {
    installSafeLegacyFetchShim();
    const requestUrl = await startServer();
    const modelData = createLlmModel({ requestUrl, requestAuth: 'team-secret' });
    const piModel = buildPiModel(modelData as never);

    await runWithSafeLegacyFetch(requestUrl, async () => {
      const stream = streamSimple(
        piModel,
        { messages: [{ role: 'user', content: 'hi', timestamp: Date.now() }] } as never,
        { apiKey: getModelApiKey(modelData as never), maxTokens: 16 }
      );
      try {
        for await (const _event of stream) break;
      } catch {
        // 回环地址会被运行时安全传输拦截，这里只断言请求没有到达服务端。
      }
    });

    expect(seen).toEqual([]);
  });
});
