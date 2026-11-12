import { describe, expect, it } from 'vitest';
import {
  buildAuthHeaders,
  createFastGptHttpClient
} from '../../src/infra/http/fastgpt-http-client';
import { createOutputRenderer } from '../../src/infra/ui/renderer';
import { CliApiError, CliArgumentError, CliNetworkError } from '../../src/shared/errors';
import type { CliFetchFn } from '../../src/shared/types';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

describe('FastGptHttpClient (ky) & OutputRenderer (picocolors)', () => {
  it('builds token header without Cookie and Bearer header for API Keys', () => {
    const tokenHeaders = buildAuthHeaders({
      auth: { authType: 'token', secret: 'u1:sess' },
      cliVersion: '0.1.0'
    });
    expect(tokenHeaders.token).toBe('u1:sess');
    expect(tokenHeaders.cookie).toBeUndefined();
    expect(tokenHeaders['x-fastgpt-client']).toContain('fastgpt-cli/0.1.0');

    const keyHeaders = buildAuthHeaders({
      auth: { authType: 'apikey', secret: 'fastgpt-abc' },
      cliVersion: '0.1.0'
    });
    expect(keyHeaders.authorization).toBe('Bearer fastgpt-abc');
  });

  it('unwraps FastGPT envelopes and classifies 514/expired/quota/business/network errors', async () => {
    const mockFetch: CliFetchFn = async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.endsWith('/ok')) {
        return jsonResponse({ code: 200, statusText: '', message: '', data: { hello: 'world' } });
      }
      if (url.endsWith('/key-514')) {
        return jsonResponse(
          { code: 514, statusText: 'unAuthApiKey', message: 'APIKey invalid', data: null },
          500
        );
      }
      if (url.endsWith('/expired')) {
        return jsonResponse(
          { code: 500, statusText: 'error', message: 'API Key is expired', data: null },
          500
        );
      }
      if (url.endsWith('/quota')) {
        return jsonResponse(
          { code: 500, statusText: 'error', message: 'API Key is over usage', data: null },
          500
        );
      }
      if (url.endsWith('/bad-req')) {
        return jsonResponse(
          { code: 400, statusText: 'error', message: 'Data validation error', data: null },
          400
        );
      }
      throw new Error('connect ECONNREFUSED 127.0.0.1:3000');
    };

    const client = createFastGptHttpClient({
      baseUrl: 'http://127.0.0.1:3000/api',
      cliVersion: '0.1.0',
      fetchFn: mockFetch
    });

    await expect(client.request({ method: 'GET', path: '/ok' })).resolves.toEqual({
      hello: 'world'
    });
    await expect(client.request({ method: 'GET', path: '/key-514' })).rejects.toMatchObject({
      code: 'AUTH_INVALID',
      exitCode: 3
    });
    await expect(client.request({ method: 'GET', path: '/expired' })).rejects.toMatchObject({
      code: 'AUTH_EXPIRED',
      exitCode: 3
    });
    await expect(client.request({ method: 'GET', path: '/quota' })).rejects.toMatchObject({
      code: 'AUTH_QUOTA_EXCEEDED',
      exitCode: 3
    });
    await expect(client.request({ method: 'GET', path: '/bad-req' })).rejects.toBeInstanceOf(
      CliApiError
    );
    await expect(client.request({ method: 'GET', path: '/down' })).rejects.toBeInstanceOf(
      CliNetworkError
    );
  });

  it('renders JSON and text formats with picocolors and redaction', () => {
    const textRenderer = createOutputRenderer({ format: 'text', color: false });
    const renderedText = textRenderer.renderSuccess({
      command: 'auth status',
      result: {
        changed: false,
        message: 'Authenticated',
        data: {
          profile: 'default',
          tags: ['a', 'b'],
          emptyList: [],
          nested: { team: 'Core', checks: [{ name: 'ok' }, 'raw'] }
        },
        warnings: ['Fallback file mode with Authorization: Bearer secret-123']
      }
    });

    expect(renderedText).toContain('Authenticated');
    expect(renderedText).toContain('profile: default');
    expect(renderedText).toContain('tags: a, b');
    expect(renderedText).toContain('emptyList: (none)');
    expect(renderedText).toContain(
      'Warning: Fallback file mode with Authorization: Bearer [REDACTED]'
    );

    expect(
      textRenderer.renderSuccess({
        command: 'whoami',
        quiet: true,
        result: { changed: false, message: 'Banner', data: 'ok-str', warnings: ['Warn'] }
      })
    ).toBe('ok-str');

    const errText = textRenderer.renderError({
      command: 'login',
      error: new CliArgumentError('Bad flag', undefined, 'Run --help')
    });
    expect(errText).toContain('Error [CLI_ARGUMENT_INVALID]: Bad flag');
    expect(errText).toContain('Hint: Run --help');

    const jsonRenderer = createOutputRenderer({ format: 'json', color: true });
    const errJson = JSON.parse(
      jsonRenderer.renderError({
        command: 'login',
        error: new Error('Authorization: Bearer secret-xyz')
      })
    );
    expect(errJson.error.code).toBe('CLI_INTERNAL_ERROR');
    expect(errJson.error.message).toBe('Authorization: Bearer [REDACTED]');
  });

  it('streams SSE events with chunk parsing and termination', async () => {
    const sseBody = [
      ': ping comment\n\n',
      'event: answer\n',
      'data: Hello\n\n',
      'data: World\n',
      'id: msg-1\n\n',
      'data: [DONE]\n\n'
    ].join('');

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(sseBody));
        controller.close();
      }
    });

    const client = createFastGptHttpClient({
      baseUrl: 'http://127.0.0.1:3000/api',
      cliVersion: '0.1.0',
      fetchFn: async () =>
        new Response(stream, { headers: { 'content-type': 'text/event-stream' } })
    });

    const events: Array<{ event?: string; data: string; id?: string }> = [];
    for await (const evt of client.streamSse({
      path: '/v2/chat/completions',
      body: { msg: 'hi' }
    })) {
      events.push(evt);
    }

    expect(events).toEqual([
      { event: 'answer', data: 'Hello' },
      { data: 'World', id: 'msg-1' }
    ]);
  });

  it('supports uploadMultipart and requestRaw methods', async () => {
    let capturedFormData: FormData | undefined;
    const client = createFastGptHttpClient({
      baseUrl: 'http://127.0.0.1:3000/api',
      cliVersion: '0.1.0',
      fetchFn: async (input, init) => {
        const url = String(input instanceof Request ? input.url : input);
        if (url.endsWith('/upload')) {
          if (input instanceof Request) {
            capturedFormData = await input.clone().formData();
          } else if (init?.body instanceof FormData) {
            capturedFormData = init.body;
          }
          return jsonResponse({ code: 200, data: { uploaded: true } });
        }
        if (url.endsWith('/download')) {
          return new Response('file-content-raw', {
            status: 200,
            headers: { 'content-disposition': 'attachment; filename="data.csv"' }
          });
        }
        return jsonResponse({}, 404);
      }
    });

    const formData = new FormData();
    formData.append('data', JSON.stringify({ name: 'test-col' }));
    const uploadRes = await client.uploadMultipart({ path: '/upload', formData });
    expect(uploadRes).toEqual({ uploaded: true });
    expect(capturedFormData?.get('data')).toBe(JSON.stringify({ name: 'test-col' }));

    const rawRes = await client.requestRaw({ method: 'GET', path: '/download' });
    expect(rawRes.status).toBe(200);
    expect(await rawRes.text()).toBe('file-content-raw');
  });

  it('blocks cross-origin redirects in beforeRequest and prevents credential leakage', async () => {
    let foreignReqHeaders: Headers | undefined;
    const client = createFastGptHttpClient({
      baseUrl: 'http://127.0.0.1:3000/api',
      cliVersion: '0.1.0',
      fetchFn: async (input) => {
        const url = String(input instanceof Request ? input.url : input);
        if (url.includes(':3000')) {
          // 模拟服务端返回 302 重定向到外部恶意端口
          return new Response(null, {
            status: 302,
            headers: { location: 'http://127.0.0.1:4000/steal' }
          });
        }
        if (input instanceof Request) {
          foreignReqHeaders = input.headers;
        }
        return jsonResponse({});
      }
    });

    await expect(
      client.request({
        method: 'GET',
        path: '/redirect-test',
        auth: { authType: 'token', secret: 'secret-token-xyz' }
      })
    ).rejects.toMatchObject({
      code: 'NETWORK_ERROR'
    });

    expect(foreignReqHeaders).toBeUndefined();
  });

  it('follows same-origin 307 redirect preserving method and payload even outside /api prefix (R1)', async () => {
    let canonicalRequestReceived = false;
    let canonicalUrl: string | undefined;
    let canonicalMethod: string | undefined;
    let canonicalBody: unknown;

    const client = createFastGptHttpClient({
      baseUrl: 'http://127.0.0.1:3000/api',
      cliVersion: '0.1.0',
      fetchFn: async (input) => {
        const req = input instanceof Request ? input : new Request(input);
        const url = req.url;
        if (url.includes('/api/core/dataset/delete')) {
          // Location 位于 /api 前缀之外的根路径 /canonical/delete
          return new Response(null, {
            status: 307,
            headers: { location: '/canonical/delete?id=68ad85a7463006c963799a05' }
          });
        }
        if (url.includes('/canonical/delete')) {
          canonicalRequestReceived = true;
          canonicalUrl = url;
          canonicalMethod = req.method;
          canonicalBody = await req.json();
          return jsonResponse({ code: 200, data: { deleted: true } });
        }
        return jsonResponse({}, 404);
      }
    });

    const res = await client.request({
      method: 'DELETE',
      path: '/core/dataset/delete',
      body: { id: '68ad85a7463006c963799a05' }
    });

    expect(canonicalRequestReceived).toBe(true);
    expect(canonicalUrl).toBe('http://127.0.0.1:3000/canonical/delete?id=68ad85a7463006c963799a05');
    expect(canonicalMethod).toBe('DELETE');
    expect(canonicalBody).toEqual({ id: '68ad85a7463006c963799a05' });
    expect(res).toEqual({ deleted: true });
  });

  it('adheres to WHATWG Fetch redirect rules: 301/302 preserve PUT/DELETE but rewrite POST to GET (R2)', async () => {
    let receivedDeleteMethod: string | undefined;
    let receivedPutMethod: string | undefined;
    let receivedPostMethod: string | undefined;

    const client = createFastGptHttpClient({
      baseUrl: 'http://127.0.0.1:3000/api',
      cliVersion: '0.1.0',
      fetchFn: async (input) => {
        const req = input instanceof Request ? input : new Request(input);
        const url = req.url;

        // DELETE + 302 -> 必须保持 DELETE
        if (url.includes('/redirect-delete')) {
          return new Response(null, { status: 302, headers: { location: '/target-delete' } });
        }
        if (url.includes('/target-delete')) {
          receivedDeleteMethod = req.method;
          return jsonResponse({ code: 200, data: { ok: true } });
        }

        // PUT + 301 -> 必须保持 PUT
        if (url.includes('/redirect-put')) {
          return new Response(null, { status: 301, headers: { location: '/target-put' } });
        }
        if (url.includes('/target-put')) {
          receivedPutMethod = req.method;
          return jsonResponse({ code: 200, data: { ok: true } });
        }

        // POST + 302 -> WHATWG 规定重写为 GET
        if (url.includes('/redirect-post')) {
          return new Response(null, { status: 302, headers: { location: '/target-post' } });
        }
        if (url.includes('/target-post')) {
          receivedPostMethod = req.method;
          return jsonResponse({ code: 200, data: { ok: true } });
        }

        return jsonResponse({}, 404);
      }
    });

    await client.request({ method: 'DELETE', path: '/redirect-delete' });
    expect(receivedDeleteMethod).toBe('DELETE');

    await client.request({ method: 'PUT', path: '/redirect-put', body: { name: 'test' } });
    expect(receivedPutMethod).toBe('PUT');

    await client.request({ method: 'POST', path: '/redirect-post', body: { name: 'test' } });
    expect(receivedPostMethod).toBe('GET');
  });
});
