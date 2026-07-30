import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import handler from '@/pages/api/proApi/[...path]';

vi.mock('@fastgpt/service/common/system/constants', () => ({
  FastGPTProUrl: 'https://pro.example.com/api'
}));

describe('Pro API proxy', () => {
  it('forwards all Set-Cookie headers from the upstream response', async () => {
    const upstreamHeaders = new Headers();
    upstreamHeaders.append('Set-Cookie', 'fastgpt_token=token; Path=/; HttpOnly');
    upstreamHeaders.append('Set-Cookie', 'oauth_txn=; Max-Age=0; Path=/; HttpOnly');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('ok', { headers: upstreamHeaders }))
    );

    const responseHeaders: Record<string, unknown> = {};
    const response = Object.assign(new PassThrough(), {
      setHeader(key: string, value: unknown) {
        responseHeaders[key] = value;
      },
      status(statusCode: number) {
        response.statusCode = statusCode;
        return response;
      }
    });
    response.resume();

    await handler(
      {
        method: 'GET',
        query: { path: ['support', 'user', 'account', 'login', 'oauth', 'callback'] },
        headers: {}
      } as any,
      response as any
    );

    expect(responseHeaders['Set-Cookie']).toEqual([
      'fastgpt_token=token; Path=/; HttpOnly',
      'oauth_txn=; Max-Age=0; Path=/; HttpOnly'
    ]);
  });
});
