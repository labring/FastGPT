import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import http from 'http';
import type { AddressInfo } from 'net';
import { probeUrlConnection } from '../../../../common/system/systemInstanceConfig/probe';
import { S3Buckets } from '../../../../common/s3/config/constants';
import { serviceEnv } from '../../../../env';
import { MongoS3TTL } from '../../../../common/s3/models/ttl';

describe('probeUrlConnection', () => {
  let server: http.Server;
  let baseUrl: string;
  let sandboxCalls = 0;
  let sseCloses = 0;
  const probeObjects = new Map<string, string>();

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (/^\/(proxy|slow|redirect|error|wrong-proxy)\/health$/.test(req.url ?? '')) {
        expect(req.headers.authorization).toBeUndefined();
        expect(req.headers['x-proxy-token']).toBeUndefined();
        if (req.url === '/slow/health') return;
        if (req.url === '/redirect/health') {
          res.writeHead(302, { Location: '/proxy/health' });
          return res.end();
        }
        res.writeHead(req.url === '/error/health' ? 503 : 200);
        res.end(req.url === '/proxy/health' ? 'OK' : 'unrelated service');
      } else if (req.url?.startsWith('/cdn/')) {
        const key = req.url.split('/').slice(3).join('/');
        res.writeHead(probeObjects.has(key) ? 200 : 404, { 'Content-Type': 'text/plain' });
        res.end(probeObjects.get(key) ?? 'not found');
      } else if (req.url?.endsWith('/api/system/file/health')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            code: 200,
            data: {
              service: req.url.startsWith('/wrong/') ? 'unrelated-site' : 'fastgpt-file-service'
            }
          })
        );
      } else if (req.url === '/api/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
      } else if (req.url === '/error') {
        res.writeHead(500);
        res.end('internal error');
      } else if (req.url === '/sandbox/js' || req.url === '/invalid/sandbox/js') {
        sandboxCalls++;
        let body = '';
        req.on('data', (chunk) => (body += chunk.toString()));
        req.on('end', () => {
          const input = JSON.parse(body);
          expect(input.code).toContain('6 * 7');
          expect(input.variables).toEqual({});
          if (req.headers.authorization !== 'Bearer sandbox-secret') {
            res.writeHead(401);
            res.end('secret request body must never escape');
          } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                success: true,
                data: { codeReturn: { result: req.url === '/sandbox/js' ? 42 : 0 } }
              })
            );
          }
        });
      } else if (req.url?.endsWith('/sse')) {
        const key = req.url.split('/').at(-2);
        if (req.url.startsWith('/redirect/')) {
          res.writeHead(302, { Location: `/sandbox/js` });
          return res.end();
        }
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.on('close', () => sseCloses++);
        if (req.url.startsWith('/large/')) {
          res.write('x'.repeat(20 * 1024));
        } else if (!req.url.startsWith('/slow/')) {
          const host = req.url.startsWith('/foreign/') ? 'http://elsewhere.invalid' : '';
          const prefix = req.url.startsWith('/foreign/')
            ? '/foreign'
            : req.url.startsWith('/bad-path/')
              ? '/bad-path/unexpected'
              : '';
          res.write(
            `event: endpoint\ndata: ${host}${prefix}/${key}/messages?sessionId=test-session\n\n`
          );
        }
      } else {
        res.writeHead(404);
        res.end('not found');
      }
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('preserves generic HTTP reachability, including non-2xx statuses', async () => {
    await expect(
      probeUrlConnection({ url: `${baseUrl}/api/status`, timeoutMs: 2000 })
    ).resolves.toMatchObject({ connected: true, status: 200 });
    await expect(
      probeUrlConnection({ url: `${baseUrl}/missing`, timeoutMs: 2000 })
    ).resolves.toMatchObject({ connected: true, status: 404 });
    await expect(
      probeUrlConnection({ url: `${baseUrl}/error`, timeoutMs: 2000 })
    ).resolves.toMatchObject({ connected: true, status: 500 });
  });

  it.each(['agentSandboxWsProxy', 'agentSandboxPreviewProxy'] as const)(
    'checks %s health under the configured prefix without sending credentials',
    async (service) => {
      const base = service === 'agentSandboxWsProxy' ? baseUrl.replace(/^http/, 'ws') : baseUrl;
      await expect(
        probeUrlConnection({ service, url: `${base}/proxy/`, timeoutMs: 1000 })
      ).resolves.toMatchObject({ connected: true, status: 200 });
      for (const [path, status] of [
        ['wrong-proxy', 200],
        ['redirect', 302],
        ['error', 503],
        ['missing', 404]
      ] as const) {
        await expect(
          probeUrlConnection({ service, url: `${base}/${path}`, timeoutMs: 1000 })
        ).resolves.toMatchObject({ connected: false, status, errorCode: 'response' });
      }
      await expect(
        probeUrlConnection({ service, url: `${base}/slow`, timeoutMs: 500 })
      ).resolves.toMatchObject({ connected: false, errorCode: 'timeout' });
      for (const suffix of ['?secret=draft', '#fragment']) {
        await expect(
          probeUrlConnection({ service, url: `${base}/proxy${suffix}`, timeoutMs: 1000 })
        ).resolves.toMatchObject({ connected: false, errorCode: 'response' });
      }
      await expect(
        probeUrlConnection({
          service,
          url: service === 'agentSandboxWsProxy' ? baseUrl : baseUrl.replace(/^http/, 'ws'),
          timeoutMs: 1000
        })
      ).resolves.toMatchObject({ connected: false, errorCode: 'protocol' });
    }
  );

  it('checks the actual file route under the deployment base path and rejects unrelated services', async () => {
    const previous = serviceEnv.NEXT_PUBLIC_BASE_URL;
    Object.assign(serviceEnv, { NEXT_PUBLIC_BASE_URL: '/fastgpt' });
    try {
      await expect(
        probeUrlConnection({ service: 'fileService', url: baseUrl, timeoutMs: 2000 })
      ).resolves.toMatchObject({ connected: true, status: 200 });
      await expect(
        probeUrlConnection({ service: 'fileService', url: `${baseUrl}/wrong`, timeoutMs: 2000 })
      ).resolves.toMatchObject({ connected: false, status: 200, errorCode: 'response' });
    } finally {
      Object.assign(serviceEnv, { NEXT_PUBLIC_BASE_URL: previous });
    }
  });

  it('verifies CDN object content and cleans temporary probes after success or failure', async () => {
    const previous = global.s3BucketMap;
    const vendor = serviceEnv.STORAGE_VENDOR;
    Object.assign(serviceEnv, { STORAGE_VENDOR: 'minio' });
    const remove = vi.fn(async ({ key }: { key: string }) => {
      probeObjects.delete(key);
    });
    global.s3BucketMap = {
      [S3Buckets.public]: {
        bucketName: S3Buckets.public,
        client: {
          uploadObject: async ({ key, body }: { key: string; body: Buffer }) => {
            probeObjects.set(key, body.toString());
          },
          deleteObject: remove
        },
        externalClient: {
          generatePublicGetUrl: ({ key }: { key: string }) => ({
            url: `https://storage.test/test-bucket/${key}`
          })
        }
      }
    } as any;
    try {
      const result = await probeUrlConnection({
        service: 'cdn',
        url: `${baseUrl}/cdn`,
        timeoutMs: 2000
      });
      expect(result).toMatchObject({ connected: true, status: 200 });
      const failure = await probeUrlConnection({
        service: 'cdn',
        url: `${baseUrl}/missing`,
        timeoutMs: 2000
      });
      expect(failure).toMatchObject({ connected: false, status: 404, errorCode: 'response' });
      await vi.waitFor(async () => {
        expect(remove).toHaveBeenCalledTimes(2);
        expect(probeObjects.size).toBe(0);
        expect(await MongoS3TTL.countDocuments({ minioKey: /^system\/probe\// })).toBe(0);
      });
    } finally {
      global.s3BucketMap = previous;
      Object.assign(serviceEnv, { STORAGE_VENDOR: vendor });
    }
  });

  it('does not upload if the TTL write finishes after the probe times out', async () => {
    const previous = global.s3BucketMap;
    const vendor = serviceEnv.STORAGE_VENDOR;
    Object.assign(serviceEnv, { STORAGE_VENDOR: 'minio' });
    let releaseTtl!: () => void;
    const pendingTtl = new Promise<void>((resolve) => {
      releaseTtl = resolve;
    });
    const originalCreate = MongoS3TTL.create.bind(MongoS3TTL);
    const create = vi.spyOn(MongoS3TTL, 'create').mockImplementationOnce((async (doc: any) => {
      await pendingTtl;
      return originalCreate(doc);
    }) as typeof MongoS3TTL.create);
    const upload = vi.fn();
    const remove = vi.fn();
    global.s3BucketMap = {
      [S3Buckets.public]: {
        bucketName: S3Buckets.public,
        client: { uploadObject: upload, deleteObject: remove }
      }
    } as any;

    try {
      await expect(
        probeUrlConnection({ service: 'cdn', url: `${baseUrl}/cdn`, timeoutMs: 500 })
      ).resolves.toMatchObject({ connected: false, errorCode: 'timeout' });
      expect(create).toHaveBeenCalledOnce();
      expect(upload).not.toHaveBeenCalled();

      releaseTtl();
      await vi.waitFor(async () => {
        expect(await MongoS3TTL.countDocuments({ minioKey: /^system\/probe\// })).toBe(1);
      });
      expect(upload).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
    } finally {
      releaseTtl();
      create.mockRestore();
      global.s3BucketMap = previous;
      Object.assign(serviceEnv, { STORAGE_VENDOR: vendor });
    }
  });

  it('retains the TTL until a timed-out upload completes and its object is deleted', async () => {
    const previous = global.s3BucketMap;
    const vendor = serviceEnv.STORAGE_VENDOR;
    Object.assign(serviceEnv, { STORAGE_VENDOR: 'minio' });
    let releaseUpload!: () => void;
    const pendingUpload = new Promise<void>((resolve) => {
      releaseUpload = resolve;
    });
    const upload = vi.fn(async ({ key, body }: { key: string; body: Buffer }) => {
      await pendingUpload;
      probeObjects.set(key, body.toString());
    });
    const remove = vi.fn(async ({ key }: { key: string }) => {
      expect(await MongoS3TTL.countDocuments({ bucketName: S3Buckets.public, minioKey: key })).toBe(
        1
      );
      probeObjects.delete(key);
    });
    const generatePublicGetUrl = vi.fn();
    global.s3BucketMap = {
      [S3Buckets.public]: {
        bucketName: S3Buckets.public,
        client: { uploadObject: upload, deleteObject: remove },
        externalClient: { generatePublicGetUrl }
      }
    } as any;

    try {
      await expect(
        probeUrlConnection({ service: 'cdn', url: `${baseUrl}/cdn`, timeoutMs: 500 })
      ).resolves.toMatchObject({ connected: false, errorCode: 'timeout' });
      expect(upload).toHaveBeenCalledOnce();
      expect(remove).not.toHaveBeenCalled();
      expect(await MongoS3TTL.countDocuments({ minioKey: /^system\/probe\// })).toBe(1);

      releaseUpload();
      await vi.waitFor(async () => {
        expect(remove).toHaveBeenCalledOnce();
        expect(probeObjects.size).toBe(0);
        expect(await MongoS3TTL.countDocuments({ minioKey: /^system\/probe\// })).toBe(0);
      });
      expect(generatePublicGetUrl).not.toHaveBeenCalled();
    } finally {
      releaseUpload();
      global.s3BucketMap = previous;
      Object.assign(serviceEnv, { STORAGE_VENDOR: vendor });
    }
  });

  it('validates sandbox authentication and the actual computation without returning the response body', async () => {
    await expect(
      probeUrlConnection({
        service: 'codeSandbox',
        url: baseUrl,
        token: 'sandbox-secret',
        timeoutMs: 2000
      })
    ).resolves.toMatchObject({ connected: true, status: 200 });
    for (const [url, token] of [
      [baseUrl, 'wrong-secret'],
      [`${baseUrl}/invalid`, 'sandbox-secret']
    ]) {
      const result = await probeUrlConnection({
        service: 'codeSandbox',
        url,
        token,
        timeoutMs: 2000
      });
      expect(result).toMatchObject({ connected: false, errorCode: 'response' });
      expect(JSON.stringify(result)).not.toContain(token);
      expect(JSON.stringify(result)).not.toContain('secret request body');
    }
    const count = sandboxCalls;
    expect(
      (
        await probeUrlConnection({
          service: 'codeSandbox',
          url: baseUrl,
          token: '',
          timeoutMs: 2000
        })
      ).connected
    ).toBe(false);
    expect(sandboxCalls).toBe(count);
  });

  it('rejects unsafe service URLs before making a request, while retaining generic query probes', async () => {
    const count = sandboxCalls;
    for (const service of ['codeSandbox', 'mcpSse'] as const) {
      for (const url of [
        `${baseUrl}?x=1`,
        `${baseUrl}#fragment`,
        baseUrl.replace('://', '://user:secret@')
      ]) {
        const result = await probeUrlConnection({
          service,
          url,
          token: 'sandbox-secret',
          timeoutMs: 2000
        });
        expect(result).toMatchObject({ connected: false, errorCode: 'response' });
        expect(JSON.stringify(result)).not.toContain('secret');
      }
    }
    expect(sandboxCalls).toBe(count);
    await expect(
      probeUrlConnection({ url: `${baseUrl}/api/status?x=1`, timeoutMs: 2000 })
    ).resolves.toMatchObject({ connected: true });
  });

  it('validates an SSE endpoint handshake, closes it, and rejects foreign origins or redirects', async () => {
    const before = sseCloses;
    await expect(
      probeUrlConnection({ service: 'mcpSse', url: baseUrl, timeoutMs: 2000 })
    ).resolves.toMatchObject({ connected: true, status: 200 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(sseCloses).toBeGreaterThan(before);
    await expect(
      probeUrlConnection({ service: 'mcpSse', url: `${baseUrl}/foreign`, timeoutMs: 2000 })
    ).resolves.toMatchObject({ connected: false, status: 200, errorCode: 'response' });
    await expect(
      probeUrlConnection({ service: 'mcpSse', url: `${baseUrl}/bad-path`, timeoutMs: 2000 })
    ).resolves.toMatchObject({ connected: false, status: 200, errorCode: 'response' });
    await expect(
      probeUrlConnection({ service: 'mcpSse', url: `${baseUrl}/redirect`, timeoutMs: 2000 })
    ).resolves.toMatchObject({ connected: false, status: 302, errorCode: 'response' });
    expect(
      (await probeUrlConnection({ service: 'mcpSse', url: `${baseUrl}/large`, timeoutMs: 2000 }))
        .connected
    ).toBe(false);
  });

  it('bounds stalled SSE and reports safe transport errors', async () => {
    await expect(
      probeUrlConnection({ service: 'mcpSse', url: `${baseUrl}/slow`, timeoutMs: 500 })
    ).resolves.toMatchObject({ connected: false, errorCode: 'timeout' });
    await expect(
      probeUrlConnection({ url: 'file:///etc/passwd', timeoutMs: 1000 })
    ).resolves.toMatchObject({ connected: false, errorCode: 'protocol' });
    const result = await probeUrlConnection({ url: 'http://127.0.0.1:59999', timeoutMs: 1000 });
    expect(result).toMatchObject({
      connected: false,
      error: 'Connection failed'
    });
    // 网络代理可能将本地拒绝转换为超时，但两者都应返回安全的分类而不是底层异常。
    expect(['refused', 'timeout']).toContain(result.errorCode);
  });
});
