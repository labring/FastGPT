import { describe, expect, it } from 'vitest';
import {
  FastGPT,
  FastGptServerError,
  type ErrorHookContext,
  type FastGptLogger,
  type RequestHookContext,
  type ResponseHookContext
} from '../src/index';

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
});
