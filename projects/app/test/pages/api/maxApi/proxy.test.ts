import { PassThrough, Writable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  jsonRes: vi.fn()
}));

vi.mock('@fastgpt/service/common/response', () => ({
  jsonRes: mocks.jsonRes
}));
vi.mock('@fastgpt/service/common/system/constants', () => ({
  FastGPTMaxUrl: 'https://max.example.com'
}));

import handler from '@/pages/api/maxApi/[...path]';

const createRequest = () =>
  Object.assign(new PassThrough(), {
    method: 'GET',
    query: { path: ['chat', 'completions'] },
    headers: {},
    aborted: false
  });

const createResponse = () => {
  const chunks: Buffer[] = [];
  const response = Object.assign(
    new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(Buffer.from(chunk));
        callback();
      }
    }),
    {
      statusCode: 200,
      headersSent: false,
      setHeader: vi.fn(),
      status: vi.fn((statusCode: number) => {
        response.statusCode = statusCode;
        return response;
      }),
      getBody: () => Buffer.concat(chunks).toString()
    }
  );
  return response;
};

describe('Max API proxy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mocks.fetch);
  });

  it('streams the upstream SSE response without aborting a completed request', async () => {
    mocks.fetch.mockResolvedValue(
      new Response('data: ok\n\n', {
        status: 200,
        headers: { 'content-type': 'text/event-stream' }
      })
    );
    const request = createRequest();
    const response = createResponse();

    await handler(request as any, response as any);

    const upstreamRequest = mocks.fetch.mock.calls[0][0] as Request;
    expect(upstreamRequest.signal.aborted).toBe(false);
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache, no-transform');
    expect(response.getBody()).toBe('data: ok\n\n');
  });

  it('aborts the upstream request when the client disconnects', async () => {
    mocks.fetch.mockResolvedValue(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: pending\n\n'));
          }
        }),
        { headers: { 'content-type': 'text/event-stream' } }
      )
    );
    const request = createRequest();
    const response = createResponse();

    const handlerPromise = handler(request as any, response as any);
    await vi.waitFor(() => expect(mocks.fetch).toHaveBeenCalledOnce());
    const upstreamRequest = mocks.fetch.mock.calls[0][0] as Request;

    response.destroy();
    await handlerPromise;

    expect(upstreamRequest.signal.aborted).toBe(true);
    expect(mocks.jsonRes).not.toHaveBeenCalled();
  });

  it('returns a proxy error when the upstream request fails before the response starts', async () => {
    const error = new Error('upstream unavailable');
    mocks.fetch.mockRejectedValue(error);
    const request = createRequest();
    const response = createResponse();

    await handler(request as any, response as any);

    expect(mocks.jsonRes).toHaveBeenCalledWith(response, { code: 500, error });
  });
});
