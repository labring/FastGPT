import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeApiBaseUrl } from '../src/core/baseClient';
import {
  FastGPT,
  FastGptAuthError,
  FastGptBadRequestError,
  FastGptConflictError,
  FastGptError,
  FastGptNotFoundError,
  FastGptRateLimitError,
  FastGptServerError,
  FastGptTimeoutError
} from '../src/index';

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

  it('blocks accidental browser instantiation unless dangerouslyAllowBrowser is true', () => {
    (globalThis as { window?: unknown }).window = { document: {} };

    expect(() => new FastGPT({ apiKey: 'fastgpt-key' })).toThrow(FastGptError);
    expect(
      () => new FastGPT({ apiKey: 'fastgpt-key', dangerouslyAllowBrowser: true })
    ).not.toThrow();
  });

  it('supports static apiKey, dynamic async credential provider, and public/token routes without apiKey', async () => {
    const calls: Array<{ url: string; auth: string | null }> = [];
    const mockFetch: typeof globalThis.fetch = async (input, init) => {
      const headers = new Headers(init?.headers);
      calls.push({
        url: String(input),
        auth: headers.get('authorization')
      });
      return createJsonResponse({
        body: { code: 200, statusText: '', message: '', data: { etag: 'etag-1' } }
      });
    };

    // 1. 缺失密钥访问受保护接口应立即抛出 FastGptAuthError
    const unauthClient = new FastGPT({
      baseUrl: 'https://api.example.com',
      fetch: mockFetch
    });
    await expect(unauthClient.system.health()).rejects.toThrow(FastGptAuthError);

    // 2. 公开模型列表与分片上传 token 接口允许无 API Key 访问
    await unauthClient.models.list();
    await unauthClient.datasets.files.uploadPart({
      token: 'tok-1',
      partNumber: 1,
      file: new Uint8Array([1, 2, 3])
    });
    expect(calls[0]?.auth).toBeNull();
    expect(calls[1]?.auth).toBeNull();

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
    await dynamicClient.system.health();
    await dynamicClient.system.health();
    expect(calls[2]?.auth).toBe('Bearer fastgpt-rotated-1');
    expect(calls[3]?.auth).toBe('Bearer fastgpt-rotated-2');
  });

  it('injects defaultAppId and derived withIdentity across query, JSON body, and multipartData without polluting unrelated routes', async () => {
    const captured: Array<{
      url: string;
      jsonBody?: Record<string, unknown>;
      formData?: FormData;
    }> = [];

    const mockFetch: typeof globalThis.fetch = async (input, init) => {
      const entry: {
        url: string;
        jsonBody?: Record<string, unknown>;
        formData?: FormData;
      } = { url: String(input) };

      if (typeof init?.body === 'string') {
        entry.jsonBody = JSON.parse(init.body) as Record<string, unknown>;
      } else if (init?.body instanceof FormData) {
        entry.formData = init.body;
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

    // 3. Multipart data JSON 字段载体注入（POST /v1/audio/transcriptions）
    await userClient.chat.transcribeAudio({
      file: { data: 'audio-bytes', filename: 'voice.mp3', contentType: 'audio/mpeg' },
      chatId: 'chat-audio-1'
    });
    const mpDataRaw = captured[2]?.formData?.get('data');
    expect(typeof mpDataRaw).toBe('string');
    expect(JSON.parse(String(mpDataRaw))).toEqual({
      chatId: 'chat-audio-1',
      appId: '68ad85a7463006c963799a05',
      customUid: 'end-user-42'
    });

    // 4. 非应用维度接口（datasets.list）绝不误注入 appId 或 customUid
    await userClient.datasets.list({ searchKey: 'kb' });
    expect(captured[3]?.jsonBody).toEqual({ searchKey: 'kb' });

    // 5. 同时传入 customUid 与 authProxy 抛出客户端参数互斥异常
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
        body: { code: 200, statusText: '', message: '', data: { ok: true } },
        headers: { 'x-request-id': 'req-abc-999' }
      });
    };

    const client = new FastGPT({
      baseUrl: 'https://api.example.com',
      apiKey: 'fastgpt-key',
      fetch: mockFetch
    });

    const promise = client.rawRequest<{ ok: boolean }>({
      method: 'GET',
      path: '/support/openapi/health'
    });

    const [unwrapped, rawResult] = await Promise.all([promise, promise.withRawResponse()]);
    expect(fetchCount).toBe(1);
    expect(unwrapped).toEqual({ ok: true });
    expect(rawResult.data).toEqual({ ok: true });
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
        body: { code: 409, message: 'Duplicate synonym term' },
        expectedClass: FastGptConflictError
      },
      {
        httpStatus: 429,
        body: { code: 429, message: 'Rate limit exceeded' },
        expectedClass: FastGptRateLimitError
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
        await client.system.health();
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
            body: { code: 200, statusText: '', message: '', data: 'ok' }
          });
        }

        postAttempts += 1;
        return createJsonResponse({
          status: 503,
          body: { message: 'Service unavailable' }
        });
      }
    });

    await expect(client.system.health()).resolves.toBe('ok');
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

    await expect(slowClient.system.health()).rejects.toThrow(FastGptTimeoutError);
  });
});
