import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createNodeFileIoAdapter } from '../../src/infra/fs/file-io';
import {
  buildAuthHeaders,
  createFastGptHttpClient
} from '../../src/infra/http/fastgpt-http-client';
import { createOutputRenderer } from '../../src/infra/ui/renderer';
import { CliApiError, CliArgumentError, CliNetworkError } from '../../src/shared/errors';
import { CliExitCode, type CliFetchFn } from '../../src/shared/types';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

describe('FastGptHttpClient (ky) & OutputRenderer (picocolors)', () => {
  it.each([
    { code: 504000, statusText: 'unAuthChat' },
    { code: 504000 },
    { code: 500, statusText: 'unAuthChat' }
  ])(
    'classifies conversation permission refusal without a session-expiry hint: %j',
    async (error) => {
      const client = createFastGptHttpClient({
        baseUrl: 'http://localhost:3000/api',
        cliVersion: '0.1.0',
        fetchFn: async () =>
          jsonResponse({ ...error, message: 'Conversation identity mismatch' }, 500)
      });
      await expect(
        client.request({ method: 'POST', path: '/v2/chat/completions', body: {} })
      ).rejects.toMatchObject({
        code: 'AUTH_FORBIDDEN',
        exitCode: 3,
        hint: expect.stringContaining('customUid')
      });
    }
  );
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

  it('keeps HTTP 403 plan/quota errors as API_ERROR while distinguishing 403 permission refusal and 401/514 auth failures', async () => {
    const mockFetch: CliFetchFn = async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.endsWith('/dataset-limit')) {
        return jsonResponse(
          {
            code: 500007,
            statusText: 'datasetAmountNotEnough',
            message: 'Dataset amount limit reached',
            data: null
          },
          403
        );
      }
      if (url.endsWith('/commercial-feature')) {
        return jsonResponse(
          {
            code: 509001,
            statusText: 'commercialFeature',
            message: 'Commercial feature required',
            data: null
          },
          403
        );
      }
      if (url.endsWith('/dataset-forbidden')) {
        return jsonResponse(
          {
            code: 501004,
            statusText: 'unAuthDataset',
            message: 'No dataset permission',
            data: null
          },
          403
        );
      }
      if (url.endsWith('/apikey-401')) {
        return jsonResponse(
          {
            code: 514,
            statusText: 'unAuthApiKey',
            message: 'Invalid API Key',
            data: null
          },
          401
        );
      }
      return jsonResponse(
        {
          code: 401,
          statusText: 'unAuthorization',
          message: 'Unauthenticated',
          data: null
        },
        401
      );
    };

    const client = createFastGptHttpClient({
      baseUrl: 'http://127.0.0.1:3000/api',
      cliVersion: '0.1.0',
      fetchFn: mockFetch
    });

    for (const [path, expectedCode, expectedStatusText] of [
      ['/dataset-limit', 500007, 'datasetAmountNotEnough'],
      ['/commercial-feature', 509001, 'commercialFeature']
    ] as const) {
      await expect(client.request({ method: 'POST', path, body: {} })).rejects.toMatchObject({
        code: 'API_ERROR',
        exitCode: CliExitCode.business,
        httpStatus: 403,
        serverCode: expectedCode,
        statusText: expectedStatusText
      });
    }

    await expect(
      client.request({ method: 'GET', path: '/dataset-forbidden' })
    ).rejects.toMatchObject({
      code: 'AUTH_FORBIDDEN',
      exitCode: CliExitCode.auth
    });
    await expect(
      client.request({ method: 'GET', path: '/dataset-forbidden' })
    ).rejects.not.toMatchObject({
      hint: expect.stringContaining('fastgpt login')
    });

    await expect(client.request({ method: 'GET', path: '/apikey-401' })).rejects.toMatchObject({
      code: 'AUTH_INVALID',
      exitCode: CliExitCode.auth,
      hint: expect.stringContaining('API Key')
    });
    await expect(client.request({ method: 'GET', path: '/session-401' })).rejects.toMatchObject({
      code: 'AUTH_INVALID',
      exitCode: CliExitCode.auth,
      hint: expect.stringContaining('fastgpt login')
    });
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

  it('streams SSE events past [DONE] until EOF and cancels reader on early consumer break', async () => {
    const sseBody = [
      ': ping comment\n\n',
      'event: answer\n',
      'data: Hello\n\n',
      'data: World\n',
      'id: msg-1\n\n',
      'data: [DONE]\n\n',
      'event: error\n',
      'data: {"message":"persist failed"}\n\n'
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
      { data: 'World', id: 'msg-1' },
      { data: '[DONE]' },
      { event: 'error', data: '{"message":"persist failed"}' }
    ]);

    let earlyCancelled = false;
    const infiniteStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('event: answer\ndata: first\n\n'));
      },
      cancel() {
        earlyCancelled = true;
      }
    });
    const breakClient = createFastGptHttpClient({
      baseUrl: 'http://127.0.0.1:3000/api',
      cliVersion: '0.1.0',
      fetchFn: async () =>
        new Response(infiniteStream, { headers: { 'content-type': 'text/event-stream' } })
    });
    for await (const evt of breakClient.streamSse({ path: '/v2/chat/completions', body: {} })) {
      expect(evt.data).toBe('first');
      break;
    }
    expect(earlyCancelled).toBe(true);
  });

  it('aborts stalled SSE body stream when timeoutMs expires after headers arrive', async () => {
    const encoder = new TextEncoder();
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('event: answer\ndata: {"partial":true}\n\n'));
      },
      cancel() {
        cancelled = true;
      }
    });

    const client = createFastGptHttpClient({
      baseUrl: 'http://127.0.0.1:3000/api',
      cliVersion: '0.1.0',
      fetchFn: async () =>
        new Response(stream, { headers: { 'content-type': 'text/event-stream' } })
    });

    const received: string[] = [];
    await expect(
      (async () => {
        for await (const evt of client.streamSse({
          path: '/core/chat/chatTest',
          body: {},
          timeoutMs: 40
        })) {
          received.push(evt.data);
        }
      })()
    ).rejects.toThrow(/SSE stream timed out/i);
    expect(received).toEqual(['{"partial":true}']);
    expect(cancelled).toBe(true);
  });

  it('strips signed query parameters and raw XML error bodies from presigned upload errors', async () => {
    const signedUrl =
      'https://s3.example.com/bucket/avatar.png?X-Amz-Signature=super-secret-sig&X-Amz-Credential=ak-123';
    const client = createFastGptHttpClient({
      baseUrl: 'http://127.0.0.1:3000/api',
      cliVersion: '0.1.0',
      fetchFn: async () =>
        new Response(
          '<Error><Code>AccessDenied</Code><StringToSign>sensitive-canonical-sig</StringToSign></Error>',
          { status: 403 }
        )
    });

    try {
      await client.putPresignedUrl({
        url: signedUrl,
        body: new Uint8Array([1, 2, 3])
      });
      expect.unreachable('should fail');
    } catch (error: any) {
      expect(error.message).toContain('HTTP 403 (AccessDenied)');
      expect(error.details?.url).toBe('https://s3.example.com/bucket/avatar.png');
      expect(JSON.stringify(error)).not.toContain('super-secret-sig');
      expect(JSON.stringify(error)).not.toContain('ak-123');
      expect(JSON.stringify(error)).not.toContain('sensitive-canonical-sig');
    }
  });

  it('classifies post-header response body disconnects as CliNetworkError', async () => {
    const client = createFastGptHttpClient({
      baseUrl: 'http://127.0.0.1:3000/api',
      cliVersion: '0.1.0',
      fetchFn: async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.error(new TypeError('socket closed mid-body'));
            }
          }),
          { status: 200 }
        )
    });

    await expect(
      client.request({ method: 'PUT', path: '/core/app/httpTools/update' })
    ).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      details: expect.objectContaining({ httpStatus: 200, phase: 'response_body' })
    });
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

  it('supports uploadBinary with content-type/length headers and unified FastGPT error mapping', async () => {
    let capturedContentType: string | null = null;
    let capturedContentLength: string | null = null;
    let capturedBytes: Uint8Array | undefined;

    const client = createFastGptHttpClient({
      baseUrl: 'http://127.0.0.1:3000/api',
      cliVersion: '0.1.0',
      fetchFn: async (input) => {
        const req = input instanceof Request ? input : new Request(input);
        if (req.url.includes('/skill/import-ok')) {
          capturedContentType = req.headers.get('content-type');
          capturedContentLength = req.headers.get('content-length');
          capturedBytes = new Uint8Array(await req.arrayBuffer());
          return jsonResponse({ code: 200, data: '68ad85a7463006c963799a21' });
        }
        return jsonResponse(
          { code: 514, statusText: 'unAuthApiKey', message: 'Invalid API key', data: null },
          500
        );
      }
    });

    const payload = new Uint8Array([80, 75, 3, 4]);
    const skillId = await client.uploadBinary<string>({
      path: '/skill/import-ok',
      query: { filename: 'demo.zip' },
      body: payload,
      contentType: 'application/zip'
    });
    expect(skillId).toBe('68ad85a7463006c963799a21');
    expect(capturedContentType).toBe('application/zip');
    expect(capturedContentLength).toBe('4');
    expect(Array.from(capturedBytes ?? [])).toEqual([80, 75, 3, 4]);

    await expect(
      client.uploadBinary({
        path: '/skill/import-auth-fail',
        body: payload,
        contentType: 'application/zip'
      })
    ).rejects.toMatchObject({
      code: 'AUTH_INVALID',
      exitCode: CliExitCode.auth
    });
  });

  it('supports putPresignedUrl for relative and cross-origin URLs without attaching auth headers', async () => {
    const seen: Array<{ url: string; method: string; headers: Headers; size: number }> = [];
    const client = createFastGptHttpClient({
      baseUrl: 'https://cloud.fastgpt.cn/api',
      cliVersion: '0.1.0',
      fetchFn: async (input, init) => {
        const req = input instanceof Request ? input : new Request(input, init);
        const buf = await req.arrayBuffer();
        seen.push({ url: req.url, method: req.method, headers: req.headers, size: buf.byteLength });
        if (req.url.includes('fail')) {
          return new Response('AccessDenied', { status: 403 });
        }
        return new Response(null, { status: 200 });
      }
    });

    const bytes = new Uint8Array([1, 2, 3, 4]);
    await client.putPresignedUrl({
      url: '/api/system/file/u/abc',
      body: bytes,
      headers: { 'content-type': 'image/png' }
    });
    await client.putPresignedUrl({
      url: 'https://oss.example.com/bucket/avatar.png?sig=1',
      body: bytes,
      headers: { 'content-type': 'image/png' }
    });

    expect(seen[0]).toMatchObject({
      url: 'https://cloud.fastgpt.cn/api/system/file/u/abc',
      method: 'PUT',
      size: 4
    });
    expect(seen[1]).toMatchObject({
      url: 'https://oss.example.com/bucket/avatar.png?sig=1',
      method: 'PUT',
      size: 4
    });
    expect(seen[1].headers.get('token')).toBeNull();
    expect(seen[1].headers.get('authorization')).toBeNull();

    await expect(
      client.putPresignedUrl({
        url: 'https://oss.example.com/fail',
        body: bytes
      })
    ).rejects.toBeInstanceOf(CliApiError);
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

  it('handles multipart Blob uploads without consuming request body and obeys redirect method rules', async () => {
    let redirect307BodyText = '';
    let redirect303Method = '';
    let redirect303ContentType: string | null = null;
    const client = createFastGptHttpClient({
      baseUrl: 'http://127.0.0.1:3000/api',
      cliVersion: '0.1.0',
      fetchFn: async (input) => {
        const req = input instanceof Request ? input : new Request(input);
        if (req.url.endsWith('/upload-unconsumed')) {
          // 故意不读取 req.body，验证 Node 24 下不会因 ky finally cancel() 触发未捕获异常
          return jsonResponse({ code: 200, data: { ok: true } });
        }
        if (req.url.endsWith('/upload-307')) {
          return new Response(null, { status: 307, headers: { location: '/upload-307-target' } });
        }
        if (req.url.endsWith('/upload-307-target')) {
          const form = await req.formData();
          redirect307BodyText = await (form.get('file') as File).text();
          return jsonResponse({ code: 200, data: { preserved: true } });
        }
        if (req.url.endsWith('/upload-303')) {
          return new Response(null, { status: 303, headers: { location: '/upload-303-target' } });
        }
        if (req.url.endsWith('/upload-303-target')) {
          redirect303Method = req.method;
          redirect303ContentType = req.headers.get('content-type');
          return jsonResponse({ code: 200, data: { switched: true } });
        }
        return jsonResponse({}, 404);
      }
    });

    const createSampleForm = () => {
      const form = new FormData();
      form.append('file', new Blob(['# Hello FastGPT'], { type: 'text/markdown' }), 'notes.md');
      form.append('data', JSON.stringify({ name: 'notes.md' }));
      return form;
    };

    await expect(
      client.uploadMultipart({ path: '/upload-unconsumed', formData: createSampleForm() })
    ).resolves.toEqual({ ok: true });

    await expect(
      client.uploadMultipart({ path: '/upload-307', formData: createSampleForm() })
    ).resolves.toEqual({ preserved: true });
    expect(redirect307BodyText).toBe('# Hello FastGPT');

    await expect(
      client.uploadMultipart({ path: '/upload-303', formData: createSampleForm() })
    ).resolves.toEqual({ switched: true });
    expect(redirect303Method).toBe('GET');
    expect(redirect303ContentType).toBeNull();
  });

  it('supports concurrent writeTextAtomic calls targeting the same file without temp-name collision', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'fastgpt-cli-fileio-'));
    tempDirs.push(dir);
    const fileIo = createNodeFileIoAdapter({ cwd: dir });

    const payloads = Array.from({ length: 8 }, (_, idx) => JSON.stringify({ index: idx }));
    await Promise.all(
      payloads.map((content) => fileIo.writeTextAtomic({ filePath: 'workflow.json', content }))
    );

    const finalContent = await readFile(join(dir, 'workflow.json'), 'utf8');
    expect(payloads).toContain(finalContent);
  });
});
