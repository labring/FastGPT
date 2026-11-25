import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import http from 'node:http';
import dns from 'node:dns/promises';
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { getTestInstanceConfig } from '@test/utils/instanceConfigSnapshot';
import type { NodeApiRequest, NodeApiResponse } from '@fastgpt/service/types/http';

const tracingMocks = vi.hoisted(() => ({
  setSpanError: vi.fn()
}));

vi.mock('@fastgpt/service/common/tracing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/common/tracing')>();
  return {
    ...actual,
    setSpanError: (...args: Parameters<typeof actual.setSpanError>) => {
      tracingMocks.setSpanError(...args);
      return actual.setSpanError(...args);
    }
  };
});

// 使用真实入口、JSON 响应与日志链路，验证代理配置故障 (500) 与目标 URL 下载失败 (400) 的完整分流。
vi.unmock('@fastgpt/service/common/http/entry');
vi.unmock('@fastgpt/service/common/response');
vi.unmock('@fastgpt/service/common/logger');

import { createApiEntry } from '@fastgpt/service/common/http/entry';
import { createApiI18n } from '@fastgpt/service/common/i18n/request';
import { generatedLoaders } from '@fastgpt/web/i18n/resourceLoaders.generated';
import { fetchOpenAPISchemaByUrl } from '@fastgpt/service/core/app/httpTool/schema';

const proxyEnvKeys = [
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'NO_PROXY',
  'http_proxy',
  'https_proxy',
  'all_proxy',
  'no_proxy'
] as const;

describe('fetchOpenAPISchemaByUrl HTTP boundary', () => {
  const requestI18n = createApiI18n(generatedLoaders);
  const originalCheckInternalIp = getTestInstanceConfig().security.checkInternalIp;
  const originalProxyEnv = Object.fromEntries(proxyEnvKeys.map((key) => [key, process.env[key]]));

  const clearProxyEnv = () => {
    for (const key of proxyEnvKeys) {
      delete process.env[key];
    }
  };

  const createHttpObjects = () => {
    const req: NodeApiRequest = Object.assign(new IncomingMessage(new Socket()), {
      method: 'POST',
      url: '/api/core/app/httpTools/getApiSchemaByUrl',
      query: {},
      body: {}
    });
    const res: NodeApiResponse = Object.assign(new ServerResponse(req), {
      status: (status: number): NodeApiResponse => {
        res.statusCode = status;
        return res;
      },
      json: vi.fn((data: unknown) => res.end(JSON.stringify(data)))
    });
    onTestFinished(() => {
      res.destroy();
      req.socket.destroy();
    });
    return { req, res };
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    tracingMocks.setSpanError.mockClear();
    clearProxyEnv();
    getTestInstanceConfig().security.checkInternalIp = false;
  });

  afterEach(() => {
    getTestInstanceConfig().security.checkInternalIp = originalCheckInternalIp;
    for (const key of proxyEnvKeys) {
      if (originalProxyEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalProxyEnv[key];
    }
  });

  it.each([
    {
      label: 'invalid proxy URL',
      envKey: 'HTTPS_PROXY' as const,
      envValue: 'http://user:proxy-secret@bad host:8080'
    },
    {
      label: 'unsupported proxy protocol',
      envKey: 'ALL_PROXY' as const,
      envValue: 'socks4://proxy.example.test:1080'
    }
  ])(
    'returns HTTP 500 and marks span error when instance proxy fails ($label)',
    async ({ envKey, envValue }) => {
      vi.spyOn(dns, 'resolve4').mockResolvedValue(['93.184.216.34']);
      vi.spyOn(dns, 'resolve6').mockRejectedValue(new Error('No AAAA records'));
      process.env[envKey] = envValue;

      const { req, res } = createHttpObjects();
      await createApiEntry({ requestI18n })(() =>
        fetchOpenAPISchemaByUrl('https://example.com/openapi.json')
      )(req, res);

      expect(res.statusCode).toBe(500);
      expect(tracingMocks.setSpanError).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(vi.mocked(res.json).mock.calls)).not.toContain('proxy-secret');
    }
  );

  it('returns HTTP 400 without span error when remote schema URL returns 404', async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Failed to bind local test server');
    }

    vi.spyOn(dns, 'resolve4').mockResolvedValue(['93.184.216.34']);
    vi.spyOn(dns, 'resolve6').mockRejectedValue(new Error('No AAAA records'));
    vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '127.0.0.1', family: 4 }] as any);

    try {
      const { req, res } = createHttpObjects();
      await createApiEntry({ requestI18n })(() =>
        fetchOpenAPISchemaByUrl(`http://remote-schema.example.test:${address.port}/openapi.json`)
      )(req, res);

      expect(res.statusCode).toBe(400);
      expect(tracingMocks.setSpanError).not.toHaveBeenCalled();
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
