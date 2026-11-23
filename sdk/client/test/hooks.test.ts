import { describe, expect, it } from 'vitest';
import { FastGptError, FastGptServerError } from '../src/core/errors';
import type {
  ErrorHookContext,
  FastGptLogger,
  RequestHookContext,
  ResponseHookContext
} from '../src/core/types';
import { FastGPT } from '../src/index';

describe('SDK Observability Hooks & Redacted Logger', () => {
  it('invokes onRequest/onResponse with redacted headers and URLs across retries', async () => {
    const reqContexts: RequestHookContext[] = [];
    const resContexts: ResponseHookContext[] = [];
    const errContexts: ErrorHookContext[] = [];
    const logEntries: Array<{ level: string; message: string; meta?: Record<string, unknown> }> =
      [];

    const customLogger: FastGptLogger = {
      debug: (message, meta) => logEntries.push({ level: 'debug', message, meta }),
      warn: (message, meta) => logEntries.push({ level: 'warn', message, meta }),
      error: (message, meta) => logEntries.push({ level: 'error', message, meta })
    };

    let fetchAttempt = 0;
    const client = new FastGPT({
      baseUrl: 'https://api.example.com',
      apiKey: 'fastgpt-supersecretkey9999',
      logger: customLogger,
      hooks: {
        onRequest: (ctx) => {
          reqContexts.push(ctx);
        },
        onResponse: (ctx) => {
          resContexts.push(ctx);
        },
        onError: (ctx) => {
          errContexts.push(ctx);
        }
      },
      fetch: async () => {
        fetchAttempt += 1;
        if (fetchAttempt === 1) {
          return new Response(JSON.stringify({ message: 'overload' }), {
            status: 503,
            headers: { 'content-type': 'application/json', 'retry-after': '0' }
          });
        }
        return new Response(
          JSON.stringify({ code: 200, statusText: '', message: '', data: { ok: true } }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
              'x-request-id': 'req-hook-1'
            }
          }
        );
      }
    });

    const data = await client.rawRequest<{ ok: boolean }>({
      method: 'GET',
      path: '/system/file/u/verysecretopaquetoken12345',
      query: { ticket: 'secret-ticket-888' }
    });

    expect(data).toEqual({ ok: true });
    expect(reqContexts).toHaveLength(2);
    expect(reqContexts[0]?.attempt).toBe(0);
    expect(reqContexts[1]?.attempt).toBe(1);
    expect(reqContexts[0]?.headers.authorization).not.toContain('supersecretkey9999');
    expect(reqContexts[0]?.url).not.toContain('verysecretopaquetoken12345');
    expect(reqContexts[0]?.url).not.toContain('secret-ticket-888');

    expect(resContexts).toHaveLength(2);
    expect(resContexts[0]?.status).toBe(503);
    expect(resContexts[1]?.status).toBe(200);
    expect(resContexts[1]?.requestId).toBe('req-hook-1');
    expect(errContexts).toHaveLength(0);

    // 确认日志内容同样经过完整脱敏
    const serializedLogs = JSON.stringify(logEntries);
    expect(serializedLogs).not.toContain('supersecretkey9999');
    expect(serializedLogs).not.toContain('verysecretopaquetoken12345');
    expect(serializedLogs).not.toContain('secret-ticket-888');
  });

  it('invokes onError once on failure and isolates hook exceptions from business calls', async () => {
    const errContexts: ErrorHookContext[] = [];
    const warnings: string[] = [];

    const client = new FastGPT({
      baseUrl: 'https://api.example.com',
      apiKey: 'fastgpt-key-12345678',
      maxRetries: 0,
      logger: {
        warn: (msg) => warnings.push(msg)
      },
      hooks: {
        onRequest: () => {
          throw new Error('telemetry sink offline');
        },
        onError: (ctx) => {
          errContexts.push(ctx);
        }
      },
      fetch: async () =>
        new Response(
          JSON.stringify({ code: 500, statusText: 'internalErr', message: 'Upstream failure' }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' }
          }
        )
    });

    await expect(client.system.health()).rejects.toThrow(FastGptServerError);
    expect(errContexts).toHaveLength(1);
    expect(errContexts[0]?.operationId).toBe('system.health');
    expect(errContexts[0]?.error).toBeInstanceOf(FastGptServerError);
    expect(warnings.some((w) => w.includes('onRequest'))).toBe(true);
  });

  it('provides a standalone redacted error view to onError and redacts secrets from hook exceptions', async () => {
    const errContexts: ErrorHookContext[] = [];
    const warnEntries: Array<{ message: string; meta?: Record<string, unknown> }> = [];

    const rawCause = Object.assign(
      new Error(
        'Upstream Bearer secretCauseToken9999 failed for fastgpt-causekey123456 at /api/system/file/u/secretuploadtok999?ticket=leak-ticket-1'
      ),
      {
        headers: { authorization: 'Bearer rawHeaderSecret7777' },
        apiKey: 'fastgpt-rawpropkey8888'
      }
    );

    const client = new FastGPT({
      baseUrl: 'https://api.example.com',
      apiKey: 'fastgpt-clientkey123456',
      maxRetries: 0,
      logger: {
        warn: (message, meta) => warnEntries.push({ message, meta })
      },
      hooks: {
        onRequest: () => {
          throw new Error(
            'Hook crash with Bearer hookSecretToken1111 and fastgpt-hookapikey2222 ?token=hook-tok'
          );
        },
        onError: (ctx) => {
          errContexts.push(ctx);
        }
      },
      fetch: async () => {
        throw rawCause;
      }
    });

    let caughtError: unknown;
    try {
      await client.system.health();
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(FastGptError);
    expect(errContexts).toHaveLength(1);

    // 1. onError 收到的 error 必须是独立安全视图，不能直接透传原始 error 或原始 cause 上的敏感字段
    const hookErr = errContexts[0]!.error;
    expect(hookErr).not.toBe(caughtError);
    expect(hookErr.cause).not.toBe(rawCause);
    expect('headers' in (hookErr.cause as Record<string, unknown>)).toBe(false);
    expect('apiKey' in (hookErr.cause as Record<string, unknown>)).toBe(false);

    const serializedHookErr = JSON.stringify({
      message: hookErr.message,
      stack: hookErr.stack,
      causeMessage: hookErr.cause instanceof Error ? hookErr.cause.message : hookErr.cause,
      causeStack: hookErr.cause instanceof Error ? hookErr.cause.stack : undefined
    });
    expect(serializedHookErr).not.toContain('secretCauseToken9999');
    expect(serializedHookErr).not.toContain('fastgpt-causekey123456');
    expect(serializedHookErr).not.toContain('secretuploadtok999');
    expect(serializedHookErr).not.toContain('leak-ticket-1');
    expect(serializedHookErr).not.toContain('rawHeaderSecret7777');
    expect(serializedHookErr).not.toContain('fastgpt-rawpropkey8888');

    // 2. Hook 自身抛出的异常日志也必须脱敏
    const serializedWarns = JSON.stringify(warnEntries);
    expect(serializedWarns).not.toContain('hookSecretToken1111');
    expect(serializedWarns).not.toContain('fastgpt-hookapikey2222');
    expect(serializedWarns).not.toContain('hook-tok');
  });

  it('scrubs openapi-* and custom OEM prefix API keys across headers, errors, onError views, and hook exception logs', async () => {
    const reqContexts: RequestHookContext[] = [];
    const errContexts: ErrorHookContext[] = [];
    const logEntries: Array<{ level: string; message: string; meta?: Record<string, unknown> }> =
      [];

    const customOemKey = 'acme-oemsecretkey987654321';
    const openapiKey = 'openapi-liveserverkey123456789';

    const client = new FastGPT({
      baseUrl: 'https://api.example.com',
      apiKey: customOemKey,
      maxRetries: 0,
      defaultHeaders: { 'x-trace-key': customOemKey },
      logger: {
        debug: (message, meta) => logEntries.push({ level: 'debug', message, meta }),
        warn: (message, meta) => logEntries.push({ level: 'warn', message, meta }),
        error: (message, meta) => logEntries.push({ level: 'error', message, meta })
      },
      hooks: {
        onRequest: (ctx) => {
          reqContexts.push(ctx);
          throw new Error(`hook failed with ${customOemKey} and ${openapiKey}`);
        },
        onError: (ctx) => {
          errContexts.push(ctx);
        }
      },
      fetch: async () => {
        throw new Error(`upstream rejected ${customOemKey} and ${openapiKey}`);
      }
    });

    let caught: unknown;
    try {
      await client.system.health();
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(FastGptError);
    expect((caught as Error).message).not.toContain(customOemKey);
    expect((caught as Error).message).not.toContain(openapiKey);

    expect(reqContexts).toHaveLength(1);
    expect(reqContexts[0]?.headers['x-trace-key']).not.toContain(customOemKey);

    expect(errContexts).toHaveLength(1);
    const serializedAll = JSON.stringify({
      reqContexts,
      errMessage: errContexts[0]?.error.message,
      errCause:
        errContexts[0]?.error.cause instanceof Error
          ? errContexts[0].error.cause.message
          : errContexts[0]?.error.cause,
      logEntries
    });
    expect(serializedAll).not.toContain(customOemKey);
    expect(serializedAll).not.toContain(openapiKey);
  });

  it('binds secret redaction to each request lifetime across explicit Authorization headers and >40 concurrent rotating keys', async () => {
    const errContexts: ErrorHookContext[] = [];
    const reqContexts: RequestHookContext[] = [];
    const logEntries: Array<{ level: string; message: string; meta?: Record<string, unknown> }> =
      [];

    // 1. 显式 headers.Authorization / X-Api-Key 凭据即使没有默认 apiKey 也必须在请求、日志与错误中脱敏
    const explicitBearerSecret = 'explicit-custom-bearer-secret-9999';
    const explicitRawAuthSecret = 'CustomScheme raw-opaque-secret-8888';
    const explicitClient = new FastGPT({
      baseUrl: 'https://api.example.com',
      maxRetries: 0,
      logger: {
        debug: (message, meta) => logEntries.push({ level: 'debug', message, meta }),
        warn: (message, meta) => logEntries.push({ level: 'warn', message, meta }),
        error: (message, meta) => logEntries.push({ level: 'error', message, meta })
      },
      hooks: {
        onRequest: (ctx) => {
          reqContexts.push(ctx);
        },
        onError: (ctx) => {
          errContexts.push(ctx);
        }
      },
      fetch: async () => {
        throw new Error(
          `upstream bounced ${explicitBearerSecret} and ${explicitRawAuthSecret} raw-opaque-secret-8888`
        );
      }
    });

    await expect(
      explicitClient.system.health({
        headers: {
          Authorization: `Bearer ${explicitBearerSecret}`,
          'X-Api-Key': explicitRawAuthSecret
        }
      })
    ).rejects.toThrow(FastGptError);

    const explicitSerialized = JSON.stringify({
      reqContexts,
      errMessage: errContexts[0]?.error.message,
      errCause:
        errContexts[0]?.error.cause instanceof Error
          ? errContexts[0].error.cause.message
          : undefined,
      logEntries
    });
    expect(explicitSerialized).not.toContain(explicitBearerSecret);
    expect(explicitSerialized).not.toContain(explicitRawAuthSecret);

    // 2. 45 个并发动态轮换 apiKey 请求：最先发起的慢请求 #0 在其余 44 个不同密钥请求全部结束后才失败，
    // 验证请求级脱敏作用域绝不会因跨请求固定容量缓存淘汰而泄漏 #0 的密钥。
    let seq = 0;
    let releaseSlowRequest!: () => void;
    const slowGate = new Promise<void>((resolve) => {
      releaseSlowRequest = resolve;
    });
    const slowSecret = 'oemrot-slow-request-secret-0000';
    const rotatingErrors: Array<{ key: string; message: string; hookMessage: string }> = [];

    const rotatingClient = new FastGPT({
      baseUrl: 'https://api.example.com',
      maxRetries: 0,
      apiKey: async () => {
        const current = seq;
        seq += 1;
        return current === 0
          ? slowSecret
          : `oemrot-fast-request-secret-${String(current).padStart(4, '0')}`;
      },
      hooks: {
        onError: (ctx) => {
          rotatingErrors.push({
            key: ctx.operationId,
            message: ctx.error.message,
            hookMessage:
              ctx.error.cause instanceof Error ? ctx.error.cause.message : String(ctx.error.cause)
          });
        }
      },
      fetch: async (_input, init) => {
        const auth = new Headers(init?.headers).get('authorization') ?? '';
        const rawToken = auth.replace(/^Bearer\s+/i, '');
        if (rawToken === slowSecret) {
          await slowGate;
          throw new Error(`slow request failed with leaked ${slowSecret}`);
        }
        return new Response(
          JSON.stringify({ code: 200, statusText: '', message: '', data: { ok: true } }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' }
          }
        );
      }
    });

    const slowPromise = rotatingClient.system.health().catch((err: unknown) => err);
    // 先让 44 个携带全新密钥的请求并发完成（远超原 32 条上限）
    await Promise.all(Array.from({ length: 44 }, () => rotatingClient.system.health()));
    releaseSlowRequest();

    const slowErr = await slowPromise;
    expect(slowErr).toBeInstanceOf(FastGptError);
    expect((slowErr as Error).message).not.toContain(slowSecret);
    expect(rotatingErrors).toHaveLength(1);
    expect(JSON.stringify(rotatingErrors[0])).not.toContain(slowSecret);
  });
});
