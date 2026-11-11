import http from 'http';
import type { AddressInfo } from 'net';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getTestInstanceConfig } from '@test/utils/instanceConfigSnapshot';
import { CodeSandbox } from '@fastgpt/service/thirdProvider/codeSandbox';

describe('CodeSandbox runtime configuration', () => {
  let server: http.Server;
  let baseUrl: string;
  let requests: Array<{ url?: string; auth?: string }> = [];
  let previous: ReturnType<typeof getTestInstanceConfig>['subservice']['codeSandbox'];

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      requests.push({ url: req.url, auth: req.headers.authorization });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: { js: [], python: [], builtinGlobals: [] } }));
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
  beforeEach(() => {
    requests = [];
    previous = getTestInstanceConfig().subservice.codeSandbox;
    getTestInstanceConfig().subservice.codeSandbox = {
      enabled: true,
      url: baseUrl,
      token: 'first'
    };
  });
  afterEach(() => {
    getTestInstanceConfig().subservice.codeSandbox = previous;
  });

  it('rebuilds clients on credential or address change and fails closed on disabled or missing values', async () => {
    const client = new CodeSandbox();
    await client.getPackages();
    getTestInstanceConfig().subservice.codeSandbox.token = 'second';
    getTestInstanceConfig().subservice.codeSandbox.url = `${baseUrl}/new-path`;
    await client.getPackages();
    expect(requests).toEqual([
      { url: '/sandbox/modules', auth: 'Bearer first' },
      { url: '/new-path/sandbox/modules', auth: 'Bearer second' }
    ]);

    for (const config of [
      { enabled: false, url: baseUrl, token: 'second' },
      { enabled: true, url: '', token: 'second' },
      { enabled: true, url: 'ftp://sandbox.test', token: 'second' },
      { enabled: true, url: baseUrl, token: ' ' }
    ]) {
      getTestInstanceConfig().subservice.codeSandbox = config;
      await expect(client.getPackages()).rejects.toThrow(
        'Code sandbox service is not configured or disabled'
      );
    }
    expect(requests).toHaveLength(2);

    getTestInstanceConfig().subservice.codeSandbox = {
      enabled: true,
      url: baseUrl,
      token: 'third'
    };
    await client.getPackages();
    expect(requests.at(-1)?.auth).toBe('Bearer third');
  });
});
