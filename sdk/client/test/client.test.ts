import fs from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeApiBaseUrl, SDK_VERSION } from '../src/core/baseClient';
import {
  FastGptAuthError,
  FastGptBadRequestError,
  FastGptConflictError,
  FastGptError,
  FastGptNotFoundError,
  FastGptRateLimitError,
  FastGptServerError,
  FastGptTimeoutError
} from '../src/core/errors';
import { FastGPT } from '../src/index';

const createJsonResponse = ({
  body,
  status = 200,
  headers = {}
}: {
  body: unknown;
  status?: number;
  headers?: Record<string, string>;
}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      ...headers
    }
  });

describe('FastGPT Core Client, Auth, Identity & Error Semantics', () => {
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
    vi.restoreAllMocks();
  });

  it('normalizes baseUrl with or without trailing /api suffix', () => {
    expect(normalizeApiBaseUrl('https://cloud.fastgpt.cn')).toBe('https://cloud.fastgpt.cn/api');
    expect(normalizeApiBaseUrl('https://cloud.fastgpt.cn/')).toBe('https://cloud.fastgpt.cn/api');
    expect(normalizeApiBaseUrl('https://host.example.com/api')).toBe(
      'https://host.example.com/api'
    );
    expect(normalizeApiBaseUrl('https://host.example.com/api/')).toBe(
      'https://host.example.com/api'
    );
  });

  it('exposes only OpenAPI-declared domains, omits rawRequest, and aligns SDK_VERSION with package.json', async () => {
    const pkg = JSON.parse(
      fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    ) as { version: string };
    expect(SDK_VERSION).toBe(pkg.version);

    let clientHeader: string | null = null;
    const client = new FastGPT({
      apiKey: 'fastgpt-key',
      fetch: async (_input, init) => {
        clientHeader = new Headers(init?.headers).get('x-fastgpt-client');
        return createJsonResponse({
          body: { code: 200, statusText: '', message: '', data: { models: [], providers: [] } }
        });
      }
    });
    expect('rawRequest' in client).toBe(false);
    expect('system' in client).toBe(false);
    expect(
      Object.keys(client).filter((k) => ['apps', 'chat', 'datasets', 'models'].includes(k))
    ).toEqual(['apps', 'chat', 'datasets', 'models']);

    await client.models.list();
    expect(clientHeader).toBe(`fastgpt-js-sdk/${SDK_VERSION}`);
  });

  it('blocks accidental browser instantiation unless dangerouslyAllowBrowser is true', () => {
    (globalThis as { window?: unknown }).window = { document: {} };

    expect(() => new FastGPT({ apiKey: 'fastgpt-key' })).toThrow(FastGptError);
    expect(
      () => new FastGPT({ apiKey: 'fastgpt-key', dangerouslyAllowBrowser: true })
    ).not.toThrow();
  });

  it('supports static apiKey, dynamic async credential provider, and public /core/ai/model/list without apiKey', async () => {
    const calls: Array<{ url: string; auth: string | null }> = [];
    const mockFetch: typeof globalThis.fetch = async (input, init) => {
      const headers = new Headers(init?.headers);
      calls.push({
        url: String(input),
        auth: headers.get('authorization')
      });
      return createJsonResponse({
        body: { code: 200, statusText: '', message: '', data: { models: [], providers: [] } }
      });
    };

    // 1. 缺失密钥访问受保护接口应立即抛出 FastGptAuthError
    const unauthClient = new FastGPT({
      baseUrl: 'https://api.example.com',
      fetch: mockFetch
    });
    await expect(unauthClient.models.catalog()).rejects.toThrow(FastGptAuthError);

    // 2. 公开模型列表接口允许无 API Key 访问
    await unauthClient.models.list();
    expect(calls[0]?.auth).toBeNull();

    // 3. 动态异步凭证提供器按需旋转密钥
    let seq = 0;
    const dynamicClient = new FastGPT({
      baseUrl: 'https://api.example.com',
      apiKey: async () => {
        seq += 1;
        return `fastgpt-rotated-${seq}`;
      },
      fetch: mockFetch
    });
    await dynamicClient.models.catalog();
    await dynamicClient.models.catalog();
    expect(calls[1]?.auth).toBe('Bearer fastgpt-rotated-1');
    expect(calls[2]?.auth).toBe('Bearer fastgpt-rotated-2');
  });

  it('injects defaultAppId and derived withIdentity across query and JSON body without polluting unrelated routes', async () => {
    const captured: Array<{
      url: string;
      jsonBody?: Record<string, unknown>;
    }> = [];

    const mockFetch: typeof globalThis.fetch = async (input, init) => {
      const entry: {
        url: string;
        jsonBody?: Record<string, unknown>;
      } = { url: String(input) };

      if (typeof init?.body === 'string') {
        entry.jsonBody = JSON.parse(init.body) as Record<string, unknown>;
      }
      captured.push(entry);

      return createJsonResponse({
        body: { code: 200, statusText: '', message: '', data: { total: 0, list: [] } }
      });
    };

    const rootClient = new FastGPT({
      baseUrl: 'https://api.example.com',
      apiKey: 'fastgpt-personal-key',
      defaultAppId: '68ad85a7463006c963799a05',
      fetch: mockFetch
    });

    const userClient = rootClient.withIdentity({ customUid: 'end-user-42' });

    // 1. Query 载体注入（GET /core/chat/init）
    await userClient.chat.init({ chatId: 'chat-1' });
    const initUrl = new URL(captured[0]!.url);
    expect(initUrl.searchParams.get('appId')).toBe('68ad85a7463006c963799a05');
    expect(initUrl.searchParams.get('customUid')).toBe('end-user-42');

    // 2. JSON Body 载体注入（POST /core/chat/history/getHistories）及单次代理身份覆盖
    await userClient.chat.histories.list({ pageSize: 10 }, { authProxy: { username: 'alice' } });
    expect(captured[1]?.jsonBody).toEqual({
      pageSize: 10,
      appId: '68ad85a7463006c963799a05',
      authProxy: { username: 'alice' }
    });

    // 3. 非应用维度接口（datasets.list）绝不误注入 appId 或 customUid
    await userClient.datasets.list({ searchKey: 'kb' });
    expect(captured[2]?.jsonBody).toEqual({ searchKey: 'kb' });

    // 4. 同时传入 customUid 与 authProxy 抛出客户端参数互斥异常
    expect(() =>
      rootClient.withIdentity({
        customUid: 'u1',
        authProxy: { tmbId: 't1' }
      })
    ).toThrow(FastGptBadRequestError);
  });

  it('supports both direct await and .withRawResponse() on ApiPromise with a single HTTP execution', async () => {
    let fetchCount = 0;
    const mockFetch: typeof globalThis.fetch = async () => {
      fetchCount += 1;
      return createJsonResponse({
        body: { code: 200, statusText: '', message: '', data: { version: 'v1', models: [] } },
        headers: { 'x-request-id': 'req-abc-999' }
      });
    };

    const client = new FastGPT({
      baseUrl: 'https://api.example.com',
      apiKey: 'fastgpt-key',
      fetch: mockFetch
    });

    const promise = client.models.catalog();

    const [unwrapped, rawResult] = await Promise.all([promise, promise.withRawResponse()]);
    expect(fetchCount).toBe(1);
    expect(unwrapped).toEqual({ version: 'v1', models: [] });
    expect(rawResult.data).toEqual({ version: 'v1', models: [] });
    expect(rawResult.response.status).toBe(200);
    expect(rawResult.response.requestId).toBe('req-abc-999');
  });

  it('maps HTTP statuses, HTTP-200 business error envelopes, and redacts leaked secrets', async () => {
    const cases: Array<{
      httpStatus: number;
      body: unknown;
      expectedClass: new (...args: never[]) => FastGptError;
    }> = [
      {
        httpStatus: 200,
        body: {
          code: 514,
          statusText: 'tokenInvalid',
          message: 'Invalid token fastgpt-1234567890'
        },
        expectedClass: FastGptAuthError
      },
      {
        httpStatus: 401,
        body: { code: 514, statusText: 'unAuthApiKey', message: 'Invalid API Key' },
        expectedClass: FastGptAuthError
      },
      {
        httpStatus: 403,
        body: { code: 403, message: 'Forbidden resource' },
        expectedClass: FastGptAuthError
      },
      {
        httpStatus: 500,
        body: { code: 506001, statusText: 'openapiUnAuth', message: 'OpenAPI unauthorized' },
        expectedClass: FastGptAuthError
      },
      {
        httpStatus: 404,
        body: { code: 404, message: 'Dataset not found' },
        expectedClass: FastGptNotFoundError
      },
      {
        httpStatus: 410,
        body: {
          code: 502005,
          statusText: 'workflowBuilderVersionExpired',
          message: 'Version expired'
        },
        expectedClass: FastGptNotFoundError
      },
      {
        httpStatus: 500,
        body: { code: 502000, statusText: 'appUnExist', message: 'App does not exist' },
        expectedClass: FastGptNotFoundError
      },
      {
        httpStatus: 402,
        body: { code: 510, statusText: 'insufficientQuota', message: 'Insufficient quota' },
        expectedClass: FastGptBadRequestError
      },
      {
        httpStatus: 413,
        body: { code: 501025, statusText: 'archiveLimitExceeded', message: 'Archive too large' },
        expectedClass: FastGptBadRequestError
      },
      {
        httpStatus: 409,
        body: { code: 409, message: 'Duplicate collection' },
        expectedClass: FastGptConflictError
      },
      {
        httpStatus: 429,
        body: { code: 429, message: 'Rate limit exceeded' },
        expectedClass: FastGptRateLimitError
      },
      {
        // 明确 HTTP 429 优先于旧版鉴权业务标记，避免调用方误判为凭据错误而放弃退避
        httpStatus: 429,
        body: { code: 506001, statusText: 'openapiUnAuth', message: 'Gateway rate limited' },
        expectedClass: FastGptRateLimitError
      },
      {
        // 明确 HTTP 503 优先于旧版资源不存在业务标记，避免被降级为 404
        httpStatus: 503,
        body: {
          code: 502000,
          statusText: 'appUnExist',
          message: 'Upstream temporarily unavailable'
        },
        expectedClass: FastGptServerError
      },
      {
        httpStatus: 200,
        body: {
          code: 500,
          statusText: 'core.chat.error',
          message: 'Bearer secretValue987654321 failed'
        },
        expectedClass: FastGptServerError
      }
    ];

    for (const item of cases) {
      const client = new FastGPT({
        baseUrl: 'https://api.example.com',
        apiKey: 'fastgpt-key',
        maxRetries: 0,
        fetch: async () =>
          createJsonResponse({
            status: item.httpStatus,
            body: item.body,
            headers: { 'x-fastgpt-request-id': 'trace-77' }
          })
      });

      let caught: unknown;
      try {
        await client.models.catalog();
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(item.expectedClass);
      const sdkErr = caught as FastGptError;
      expect(sdkErr.requestId).toBe('trace-77');
      expect(sdkErr.message).not.toContain('fastgpt-1234567890');
      expect(sdkErr.message).not.toContain('secretValue987654321');
    }
  });

  it('retries transient 503 on GET automatically, does not retry POST by default, and enforces timeoutMs', async () => {
    let getAttempts = 0;
    let postAttempts = 0;

    const client = new FastGPT({
      baseUrl: 'https://api.example.com',
      apiKey: 'fastgpt-key',
      fetch: async (_url, init) => {
        if (init?.method === 'GET') {
          getAttempts += 1;
          if (getAttempts === 1) {
            return createJsonResponse({
              status: 503,
              body: { message: 'Temporary overload' },
              headers: { 'retry-after': '0' }
            });
          }
          return createJsonResponse({
            body: { code: 200, statusText: '', message: '', data: { version: 'v1' } }
          });
        }

        postAttempts += 1;
        return createJsonResponse({
          status: 503,
          body: { message: 'Service unavailable' }
        });
      }
    });

    await expect(client.models.catalog()).resolves.toEqual({ version: 'v1' });
    expect(getAttempts).toBe(2);

    await expect(client.datasets.list({})).rejects.toThrow(FastGptServerError);
    expect(postAttempts).toBe(1);

    const slowClient = new FastGPT({
      baseUrl: 'https://api.example.com',
      apiKey: 'fastgpt-key',
      maxRetries: 0,
      timeoutMs: 25,
      fetch: (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        })
    });

    await expect(slowClient.models.catalog()).rejects.toThrow(FastGptTimeoutError);
  });

  it('keeps timeoutMs and external AbortSignal active after response headers arrive for both body reads and SSE streams', async () => {
    const encoder = new TextEncoder();

    // 1. 普通 JSON 响应在 headers 立即返回、body 延迟 80ms 才发送时，15ms timeoutMs 必须超时中断
    const slowBodyClient = new FastGPT({
      baseUrl: 'https://api.example.com',
      apiKey: 'fastgpt-key',
      maxRetries: 0,
      timeoutMs: 15,
      fetch: async () => {
        const delayedBody = new ReadableStream<Uint8Array>({
          start(controller) {
            const timer = setTimeout(() => {
              controller.enqueue(
                encoder.encode(
                  JSON.stringify({
                    code: 200,
                    statusText: '',
                    message: '',
                    data: { version: 'v1' }
                  })
                )
              );
              controller.close();
            }, 80);
            return () => clearTimeout(timer);
          }
        });
        return new Response(delayedBody, {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }
    });
    await expect(slowBodyClient.models.catalog()).rejects.toThrow(FastGptTimeoutError);

    // 2. 普通响应在 headers 返回后由外部 AbortSignal 取消，必须中断响应体读取
    const externalJsonAbort = new AbortController();
    const abortableBodyClient = new FastGPT({
      baseUrl: 'https://api.example.com',
      apiKey: 'fastgpt-key',
      maxRetries: 0,
      fetch: async () => {
        const hangingBody = new ReadableStream<Uint8Array>({
          pull() {
            return new Promise<void>(() => {});
          }
        });
        setTimeout(() => externalJsonAbort.abort(new Error('user cancelled')), 10);
        return new Response(hangingBody, {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }
    });
    await expect(
      abortableBodyClient.models.catalog(undefined, { signal: externalJsonAbort.signal })
    ).rejects.toThrow(FastGptError);

    // 3. SSE 流建连后（握手超时清理，不误杀慢流），外部 AbortSignal 触发仍能直达底层流并中止迭代
    let fetchSignalAborted = false;
    const sseClient = new FastGPT({
      baseUrl: 'https://api.example.com',
      apiKey: 'fastgpt-key',
      timeoutMs: 15,
      fetch: async (_url, init) => {
        init?.signal?.addEventListener('abort', () => {
          fetchSignalAborted = true;
        });
        let sentFirst = false;
        const sseBody = new ReadableStream<Uint8Array>({
          pull(controller) {
            if (!sentFirst) {
              sentFirst = true;
              return new Promise<void>((resolve) => {
                setTimeout(() => {
                  controller.enqueue(
                    encoder.encode('data: {"choices":[{"delta":{"content":"晚到分片"}}]}\n\n')
                  );
                  resolve();
                }, 30);
              });
            }
            return new Promise<void>(() => {});
          }
        });
        return new Response(sseBody, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' }
        });
      }
    });

    const sseAbort = new AbortController();
    const stream = await sseClient.chat.completionsV2Stream(
      {
        chatId: 'c-abort',
        messages: [{ role: 'user', content: 'hi' }]
      },
      { signal: sseAbort.signal }
    );

    const received: string[] = [];
    await expect(async () => {
      for await (const ev of stream) {
        if (ev.type === 'answer') {
          received.push(ev.textDelta);
          sseAbort.abort();
        }
      }
    }).rejects.toThrow(FastGptError);

    // 首包在 30ms（超过 15ms 握手超时）后依然正常抵达，随后由外部 sseAbort 中断底层信号
    expect(received).toEqual(['晚到分片']);
    expect(fetchSignalAborted).toBe(true);
    expect(stream.state).toBe('aborted');
  });
});
