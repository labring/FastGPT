import { createServer, request, type IncomingMessage, type Server } from 'node:http';
import type { NextApiRequest, NextApiResponse } from 'next';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// 这里需要真实的响应管线；全局 API/JSON mock 会隐藏代理被追加 JSON 的回归。
vi.unmock('@fastgpt/service/common/http/entry');
vi.unmock('@fastgpt/service/common/response');
vi.unmock('@fastgpt/service/common/logger');
vi.mock('@fastgpt/service/common/system/constants', () => ({
  FastGPTProUrl: 'https://admin.example.com/api'
}));

import handler from '@/pages/api/proApi/[...path]';

describe('proApi response forwarding', () => {
  let server: Server;
  let port: number;
  const fetchUpstream = vi.fn<typeof fetch>();
  const jsonResponses: unknown[] = [];
  const handlerErrors: unknown[] = [];

  /** 使用真实 HTTP 流，仅补齐 Next 的 status/json 方法以观察最终线上形态的回包。 */
  const sendRequest = ({
    method = 'POST',
    headers = {},
    onChunk
  }: {
    method?: string;
    headers?: Record<string, string>;
    onChunk?: (response: IncomingMessage) => void;
  } = {}) =>
    new Promise<{ status: number; body: string; contentType?: string }>((resolve, reject) => {
      const client = request(
        {
          host: '127.0.0.1',
          port,
          path: '/api/proApi/support/user/account/login/wx/callback?nonce=nonce',
          method,
          headers
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => {
            chunks.push(chunk);
            onChunk?.(response);
          });
          response.on('error', reject);
          response.on('aborted', () => reject(new Error('Response aborted')));
          response.on('end', () =>
            resolve({
              status: response.statusCode ?? 0,
              body: Buffer.concat(chunks).toString(),
              contentType: response.headers['content-type']
            })
          );
        }
      );
      client.on('error', reject);
      client.end(method === 'GET' || method === 'HEAD' ? undefined : '<xml />');
    });

  beforeAll(async () => {
    server = createServer((req, res) => {
      const apiRequest = Object.assign(req, {
        query: { path: ['support', 'user', 'account', 'login', 'wx', 'callback'], nonce: 'nonce' },
        cookies: {},
        env: process.env,
        body: undefined
      }) as NextApiRequest;
      const apiResponse: NextApiResponse = Object.assign(res, {
        status: (status: number): NextApiResponse => {
          res.statusCode = status;
          return apiResponse;
        },
        json: (data: unknown) => {
          jsonResponses.push(data);
          const body = JSON.stringify(data);
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Content-Length', Buffer.byteLength(body));
          res.end(body);
        }
      }) as NextApiResponse;
      // 记录异常而不是让测试服务器悬挂，测试会检查管线没有重复写响应。
      void Promise.resolve(handler(apiRequest, apiResponse)).catch((error) => {
        handlerErrors.push(error);
        res.destroy();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test server address');
    port = address.port;
  });

  beforeEach(() => {
    fetchUpstream.mockReset();
    jsonResponses.length = 0;
    handlerErrors.length = 0;
    vi.stubGlobal('fetch', fetchUpstream);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
      server.closeAllConnections();
    });
  });

  it('preserves a WeChat success acknowledgement without Content-Type', async () => {
    fetchUpstream.mockResolvedValue(new Response(new TextEncoder().encode('success')));

    const response = await sendRequest();

    expect(response.status).toBe(200);
    expect(response.body).toBe('success');
    expect(jsonResponses).toEqual([]);
    expect(handlerErrors).toEqual([]);
  });

  it('waits for every delayed chunk before completing the response', async () => {
    let release: () => void = () => {};
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(new TextEncoder().encode('suc'));
        await released;
        controller.enqueue(new TextEncoder().encode('cess'));
        controller.close();
      }
    });
    fetchUpstream.mockResolvedValue(new Response(body));

    const response = await sendRequest({ onChunk: release });

    expect(response.body).toBe('success');
    expect(jsonResponses).toEqual([]);
    expect(handlerErrors).toEqual([]);
  });

  it.each(['GET', 'HEAD'])('preserves an empty %s response and upstream status', async (method) => {
    fetchUpstream.mockResolvedValue(new Response(null, { status: 204 }));

    const response = await sendRequest({ method });

    expect(response.status).toBe(204);
    expect(response.body).toBe('');
    expect(jsonResponses).toEqual([]);
  });

  it('forwards upstream JSON, status, query and headers without changing its envelope', async () => {
    let upstreamRequest: Request | undefined;
    fetchUpstream.mockImplementation(async (input) => {
      if (!(input instanceof Request)) throw new Error('Expected a Request');
      upstreamRequest = input;
      expect(await input.text()).toBe('<xml />');
      return new Response('{"error":"denied"}', {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    });

    const response = await sendRequest({
      headers: {
        rootkey: 'root-secret',
        'x-fastgpt-pro-token': 'pro-secret',
        'Content-Type': 'application/xml'
      }
    });

    expect(response.status).toBe(403);
    expect(response.body).toBe('{"error":"denied"}');
    expect(upstreamRequest?.url).toBe(
      'https://admin.example.com/api/support/user/account/login/wx/callback?nonce=nonce'
    );
    expect(upstreamRequest?.headers.get('rootkey')).toBeNull();
    expect(upstreamRequest?.headers.get('x-fastgpt-pro-token')).toBeNull();
    expect(upstreamRequest?.headers.get('host')).toBeNull();
    expect(upstreamRequest?.headers.get('content-type')).toBe('application/xml');
    expect(jsonResponses).toEqual([]);
  });

  it('returns one JSON error when upstream fails before response streaming starts', async () => {
    fetchUpstream.mockRejectedValue(new Error('Upstream unavailable'));

    const response = await sendRequest();

    expect(response.status).toBe(500);
    expect(JSON.parse(response.body)).toMatchObject({ code: 500, message: 'Upstream unavailable' });
    expect(jsonResponses).toHaveLength(1);
    expect(handlerErrors).toEqual([]);
  });

  it('does not append JSON when the upstream stream fails before its first byte', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error('Upstream stream failed'));
      }
    });
    fetchUpstream.mockResolvedValue(new Response(body));

    await expect(sendRequest()).rejects.toThrow();

    expect(jsonResponses).toEqual([]);
    expect(handlerErrors).toEqual([]);
  });

  it('closes a partial response without adding JSON when its stream fails', async () => {
    let fail: () => void = () => {};
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('partial'));
        fail = () => controller.error(new Error('Upstream interrupted'));
      }
    });
    fetchUpstream.mockResolvedValue(
      new Response(body, { headers: { 'Content-Type': 'text/plain' } })
    );

    await expect(sendRequest({ onChunk: fail })).rejects.toThrow('Response aborted');

    expect(jsonResponses).toEqual([]);
    expect(handlerErrors).toEqual([]);
  });

  it('cancels the upstream stream when the client disconnects', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('partial'));
      },
      cancel
    });
    fetchUpstream.mockResolvedValue(new Response(body));

    await expect(
      sendRequest({ onChunk: (response) => response.destroy(new Error('Client disconnected')) })
    ).rejects.toThrow();

    await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce());
    expect(jsonResponses).toEqual([]);
    expect(handlerErrors).toEqual([]);
  });

  it('does not replace the raw response when middleware has already ended it', async () => {
    // 已有登录 Cookie 但缺少 Web 标记时，保留 NextAPI 的 CSRF 拦截。
    const response = await sendRequest({
      method: 'GET',
      headers: { Cookie: 'fastgpt_token=token' }
    });

    expect(response.status).toBe(403);
    expect(JSON.parse(response.body)).toMatchObject({ statusText: 'csrf_invalid' });
    expect(fetchUpstream).not.toHaveBeenCalled();
    expect(jsonResponses).toHaveLength(1);
  });
});
