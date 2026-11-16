import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer, request } from 'node:http';
import { PassThrough } from 'node:stream';
import type { NextApiRequest, NextApiResponse } from 'next';
import { createApiEntry } from '@fastgpt/service/common/http/entry';
import { resolveSystemInstanceConfig } from '@fastgpt/global/common/system/config/schema';
import { apiI18n } from '@/service/middleware/i18n';
import { serviceEnv } from '@fastgpt/service/env';

vi.unmock('@fastgpt/service/common/http/entry');
vi.unmock('@fastgpt/service/common/response');
vi.unmock('@fastgpt/service/common/logger');

vi.mock('@/service/middleware/entry', () => ({ NextAPI: (handler: unknown) => handler }));
vi.mock('@fastgpt/service/support/permission/user/auth', () => ({
  authSystemAdmin: async () => ({}),
  authUserPer: async () => ({})
}));
import handler from '@/pages/api/marketplace/[...path]';

const previousMarketplaceUrl = serviceEnv.MARKETPLACE_URL;
afterEach(() => {
  serviceEnv.MARKETPLACE_URL = previousMarketplaceUrl;
  vi.unstubAllGlobals();
});

describe('Marketplace config source', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    global.systemInstanceConfig = resolveSystemInstanceConfig({});
    Object.assign(global.systemInstanceConfig.site, {
      marketplaceUrl: 'https://stale.example.com'
    });
    serviceEnv.MARKETPLACE_URL = 'https://env.example.com';
    fetchMock.mockReset().mockResolvedValue({ headers: new Headers(), status: 200, body: null });
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('forwards requests to the ENV host while ignoring a stale scope value', async () => {
    const response = Object.assign(new PassThrough(), {
      status: vi.fn().mockReturnThis(),
      setHeader: vi.fn()
    });
    response.resume();
    await handler(
      { query: { path: ['api', 'models'] }, headers: {}, method: 'GET' } as any,
      response as any
    );
    expect(fetchMock.mock.calls[0][0].url).toBe('https://env.example.com/api/models');
    expect(response.status).toHaveBeenCalledWith(200);
  });
});

/** 让真实统一入口包装代理，观察 pipe 返回后默认 JSON 是否抢先覆盖上游响应。 */
describe('Marketplace response lifecycle', () => {
  it.each([200, 404, 500])(
    'preserves the JSON body and HTTP %s until its stream finishes',
    async (status) => {
      serviceEnv.MARKETPLACE_URL = 'https://marketplace.example.com';
      const body = JSON.stringify({ upstream: true, status });
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(
            new Response(body, { status, headers: { 'Content-Type': 'application/json' } })
          )
      );
      const wrapped = createApiEntry({ requestI18n: apiI18n })(handler);
      const server = createServer((req, res) => {
        const apiRes = Object.assign(res, {
          status: (value: number) => {
            res.statusCode = value;
            return apiRes;
          },
          json: (value: unknown) => {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(value));
          }
        }) as NextApiResponse;
        void Promise.resolve(
          wrapped(
            Object.assign(req, { query: { path: ['api', 'plugins'] } }) as NextApiRequest,
            apiRes
          )
        ).catch(() => res.destroy());
      });
      try {
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('Missing server port');
        const actual = await new Promise<{ status: number; body: string }>((resolve, reject) => {
          const client = request(
            { host: '127.0.0.1', port: address.port, path: '/api/marketplace/api/plugins' },
            (response) => {
              const parts: Buffer[] = [];
              response.on('data', (chunk) => parts.push(Buffer.from(chunk)));
              response.on('error', reject);
              response.on('end', () =>
                resolve({ status: response.statusCode!, body: Buffer.concat(parts).toString() })
              );
            }
          );
          client.on('error', reject);
          client.end();
        });
        expect(actual).toEqual({ status, body });
      } finally {
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
        vi.unstubAllGlobals();
      }
    }
  );
});
