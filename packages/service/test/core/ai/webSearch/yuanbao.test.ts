import { afterEach, describe, expect, it, vi } from 'vitest';
import { serviceEnv } from '@fastgpt/service/env';
import { runYuanbaoSearch } from '@fastgpt/service/core/ai/webSearch/yuanbao';

const credentials = serviceEnv as typeof serviceEnv & {
  YUANBAO_SECRET_ID?: string;
  YUANBAO_SECRET_KEY?: string;
};
const previousId = credentials.YUANBAO_SECRET_ID;
const previousKey = credentials.YUANBAO_SECRET_KEY;

afterEach(() => {
  credentials.YUANBAO_SECRET_ID = previousId;
  credentials.YUANBAO_SECRET_KEY = previousKey;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('runYuanbaoSearch', () => {
  it('sends a signed SearchPro request and normalizes object and JSON-string Pages', async () => {
    credentials.YUANBAO_SECRET_ID = 'test-secret-id';
    credentials.YUANBAO_SECRET_KEY = 'test-secret-key';
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            Response: {
              Pages: [
                {
                  title: 'First',
                  url: 'https://example.com/a',
                  passage: 'First passage',
                  date: '2026-01-01'
                },
                JSON.stringify({
                  title: 'Second',
                  url: 'http://example.com/b',
                  passage: 'Second passage'
                })
              ]
            }
          }),
          { status: 200 }
        )
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await runYuanbaoSearch({ query: '  FastGPT  ' });

    expect(result).toEqual({
      query: 'FastGPT',
      results: [
        {
          title: 'First',
          url: 'https://example.com/a',
          snippet: 'First passage',
          publishedAt: '2026-01-01'
        },
        { title: 'Second', url: 'http://example.com/b', snippet: 'Second passage' }
      ]
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://wsa.tencentcloudapi.com/',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ Query: 'FastGPT' }),
        headers: expect.objectContaining({
          'X-TC-Action': 'SearchPro',
          'X-TC-Version': '2025-05-08',
          Authorization: expect.stringMatching(
            /^TC3-HMAC-SHA256 Credential=test-secret-id\/\d{4}-\d{2}-\d{2}\/wsa\/tc3_request, SignedHeaders=content-type;host, Signature=[a-f0-9]{64}$/
          )
        })
      })
    );
  });

  it('drops unsafe, malformed and duplicate URLs, and caps results at ten', async () => {
    credentials.YUANBAO_SECRET_ID = 'id';
    credentials.YUANBAO_SECRET_KEY = 'key';
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              Response: {
                Pages: [
                  { title: 'unsafe', url: 'javascript:alert(1)', passage: 'x' },
                  '{not json}',
                  { title: 'missing', passage: 'x' },
                  ...Array.from({ length: 12 }, (_, index) => ({
                    title: `Title ${index}`,
                    url: `https://example.com/${index}`,
                    passage: 'x'.repeat(5000)
                  })),
                  { title: 'duplicate', url: 'https://example.com/0', passage: 'duplicate' }
                ]
              }
            }),
            { status: 200 }
          )
      )
    );

    const result = await runYuanbaoSearch({ query: 'q' });

    expect(result.results).toHaveLength(10);
    expect(result.results[0].url).toBe('https://example.com/0');
    expect(result.results[0].snippet.length).toBeLessThanOrEqual(1000);
  });

  it('returns an empty result for an empty Pages array', async () => {
    credentials.YUANBAO_SECRET_ID = 'id';
    credentials.YUANBAO_SECRET_KEY = 'key';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ Response: { Pages: [] } }), { status: 200 }))
    );

    await expect(runYuanbaoSearch({ query: 'nothing' })).resolves.toEqual({
      query: 'nothing',
      results: []
    });
  });

  it('rejects missing credentials, oversized queries and sanitized upstream errors', async () => {
    credentials.YUANBAO_SECRET_ID = undefined;
    credentials.YUANBAO_SECRET_KEY = undefined;
    await expect(runYuanbaoSearch({ query: 'q' })).rejects.toThrow(/not configured/i);

    credentials.YUANBAO_SECRET_ID = 'id';
    credentials.YUANBAO_SECRET_KEY = 'key';
    await expect(runYuanbaoSearch({ query: 'x'.repeat(2000) })).rejects.toThrow(/query/i);
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              Response: { Error: { Code: 'BadRequest', Message: 'secret-in-error' } }
            }),
            { status: 200 }
          )
      )
    );
    await expect(runYuanbaoSearch({ query: 'q' })).rejects.toThrow('BadRequest');
    await expect(runYuanbaoSearch({ query: 'q' })).rejects.not.toThrow('secret-in-error');
  });

  it('honors cancellation', async () => {
    credentials.YUANBAO_SECRET_ID = 'id';
    credentials.YUANBAO_SECRET_KEY = 'key';
    const controller = new AbortController();
    controller.abort();
    await expect(runYuanbaoSearch({ query: 'q', signal: controller.signal })).rejects.toThrow();
  });

  it('aborts a timed-out request without exposing the fetch error', async () => {
    credentials.YUANBAO_SECRET_ID = 'id';
    credentials.YUANBAO_SECRET_KEY = 'key';
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(AbortSignal.abort());
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url, init: RequestInit) => {
        if (init.signal?.aborted) throw new Error('private fetch details');
        throw new Error('unexpected active request');
      })
    );

    await expect(runYuanbaoSearch({ query: 'q' })).rejects.toThrow('Yuanbao search timed out');
  });
});
