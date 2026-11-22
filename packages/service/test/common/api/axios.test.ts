import { getTestInstanceConfig } from '@test/utils/instanceConfigSnapshot';
import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest';
import http from 'http';
import net from 'net';
import os from 'os';
import dns from 'dns/promises';
import zlib from 'node:zlib';
import { createProxyAxios, type SafeAxiosRequestConfig } from '../../../common/api/axios';
import { PRIVATE_URL_TEXT } from '../../../common/system/utils';
import { getServiceAxiosMaxContentLength } from '../../../common/system/constants';

type AxiosRequestConfig = {
  timeout?: number;
  headers?: Record<string, string>;
  proxy?: false | { host: string; port: number };
  baseURL?: string;
  httpAgent?: any;
  httpsAgent?: any;
  maxContentLength?: number;
};

describe('axios.ts', () => {
  const originalCheckInternalIp = getTestInstanceConfig().security.checkInternalIp;
  const originalResponseLimit = getTestInstanceConfig().resource.serviceAxiosMaxContentLength;
  const proxyEnvKeys = [
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'ALL_PROXY',
    'NO_PROXY',
    'http_proxy',
    'https_proxy',
    'all_proxy',
    'no_proxy',
    'npm_config_http_proxy',
    'npm_config_https_proxy',
    'npm_config_proxy',
    'npm_config_no_proxy'
  ] as const;
  const originalProxyEnv = proxyEnvKeys.reduce(
    (acc, key) => {
      acc[key] = process.env[key];
      return acc;
    },
    {} as Record<(typeof proxyEnvKeys)[number], string | undefined>
  );

  afterEach(() => {
    getTestInstanceConfig().security.checkInternalIp = originalCheckInternalIp;
    getTestInstanceConfig().resource.serviceAxiosMaxContentLength = originalResponseLimit;
    vi.restoreAllMocks();
    for (const key of proxyEnvKeys) {
      const value = originalProxyEnv[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  const clearProxyEnv = () => {
    for (const key of proxyEnvKeys) {
      delete process.env[key];
    }
  };

  const listen = (handler: http.RequestListener, host = '127.0.0.1') =>
    new Promise<http.Server>((resolve) => {
      const server = http.createServer(handler);
      server.listen(0, host, () => resolve(server));
    });

  const closeServer = (server: http.Server) =>
    new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });

  const getServerPort = (server: http.Server): number => {
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Invalid test server address');
    }
    return address.port;
  };

  /**
   * 构造一个非 loopback 的本机访问地址，用于模拟“初始 URL 通过 SSRF 校验”。
   * CHECK_INTERNAL_IP=false 时私网地址会放行，但 loopback/metadata 仍然恒拦截。
   */
  const getReachablePrivateHost = () => {
    const interfaces = os.networkInterfaces();
    for (const items of Object.values(interfaces)) {
      for (const item of items ?? []) {
        if (item.family === 'IPv4' && !item.internal) {
          return item.address;
        }
      }
    }
    return undefined;
  };

  describe('createProxyAxios', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('checks the file domain policy before the first request and every redirect', async () => {
      clearProxyEnv();
      getTestInstanceConfig().security.checkInternalIp = false;
      const adapter = vi.fn(async (config) => ({
        status: 302,
        statusText: 'Found',
        data: '',
        headers: { location: 'https://blocked.example.com/opaque' },
        config
      }));
      const instance = createProxyAxios({ adapter });
      const requestConfig: SafeAxiosRequestConfig = {
        __safeAxios: { validateUrl: (url) => new URL(url).hostname === 'allowed.example.com' }
      };
      await expect(
        instance.head('https://blocked.example.com/opaque', requestConfig)
      ).rejects.toThrow('Invalid file URL domain');
      expect(adapter).not.toHaveBeenCalled();
      vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as any);
      await expect(
        instance.head('https://allowed.example.com/opaque', requestConfig)
      ).rejects.toThrow('Invalid file URL domain');
      expect(adapter).toHaveBeenCalledTimes(1);
    });

    it('应该创建一个带有 ProxyAgent 的 axios 实例', () => {
      const instance = createProxyAxios();

      expect(instance).toBeDefined();
      expect(instance.defaults).toBeDefined();
      expect(instance.defaults.proxy).toBe(false);
      expect(instance.defaults.httpAgent).toBeDefined();
      expect(instance.defaults.httpsAgent).toBeDefined();
    });

    it('应该使用相同的 agent 作为 httpAgent 和 httpsAgent', () => {
      const instance = createProxyAxios();

      expect(instance.defaults.httpAgent).toBe(instance.defaults.httpsAgent);
    });

    it('应该接受自定义配置并合并到默认配置中', () => {
      const customConfig: AxiosRequestConfig = {
        timeout: 5000,
        headers: {
          'Custom-Header': 'test-value'
        }
      };

      const instance = createProxyAxios(customConfig);

      expect(instance.defaults.timeout).toBe(5000);
      expect(instance.defaults.headers?.['Custom-Header']).toBe('test-value');
      expect(instance.defaults.proxy).toBe(false);
      expect(instance.defaults.httpAgent).toBeDefined();
      expect(instance.defaults.httpsAgent).toBeDefined();
    });

    it('应该允许自定义配置覆盖默认的 proxy 设置', () => {
      const customConfig: AxiosRequestConfig = {
        proxy: {
          host: 'localhost',
          port: 8080
        }
      };

      const instance = createProxyAxios(customConfig);

      expect(instance.defaults.proxy).toEqual({
        host: 'localhost',
        port: 8080
      });
    });

    it('应该保留 ProxyAgent 即使提供了自定义配置', () => {
      const customConfig: AxiosRequestConfig = {
        baseURL: 'https://api.example.com'
      };

      const instance = createProxyAxios(customConfig);

      expect(instance.defaults.baseURL).toBe('https://api.example.com');
      expect(instance.defaults.httpAgent).toBeDefined();
      expect(instance.defaults.httpsAgent).toBeDefined();
    });

    it('应该创建可以发起请求的 axios 实例', () => {
      const instance = createProxyAxios();

      expect(typeof instance.get).toBe('function');
      expect(typeof instance.post).toBe('function');
      expect(typeof instance.put).toBe('function');
      expect(typeof instance.delete).toBe('function');
      expect(typeof instance.request).toBe('function');
    });

    it('应该在请求前阻止内网地址', async () => {
      const adapter = vi.fn().mockResolvedValue({
        data: {},
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      });
      const instance = createProxyAxios({ adapter });

      await expect(instance.get('http://127.0.0.1/admin')).rejects.toThrow(PRIVATE_URL_TEXT);
      expect(adapter).not.toHaveBeenCalled();
    });

    it('应该校验 baseURL 和相对路径合成后的地址', async () => {
      const adapter = vi.fn().mockResolvedValue({
        data: {},
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      });
      const instance = createProxyAxios({
        baseURL: 'http://169.254.169.254',
        adapter
      });

      await expect(instance.get('/latest/meta-data/')).rejects.toThrow(PRIVATE_URL_TEXT);
      expect(adapter).not.toHaveBeenCalled();
    });

    it('应该允许公网地址继续进入 adapter', async () => {
      vi.spyOn(dns, 'resolve4').mockResolvedValue(['8.8.8.8']);
      vi.spyOn(dns, 'resolve6').mockRejectedValue(new Error('No AAAA records'));
      vi.spyOn(dns, 'lookup').mockImplementation(
        async () => [{ address: '8.8.8.8', family: 4 }] as any
      );
      const adapter = vi.fn().mockResolvedValue({
        data: { ok: true },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      });
      const instance = createProxyAxios({ adapter });

      const response = await instance.get('https://example.com/api');

      expect(response.data).toEqual({ ok: true });
      expect(adapter).toHaveBeenCalled();
    });

    it('应该允许显式关闭 SSRF 检查', async () => {
      const adapter = vi.fn().mockResolvedValue({
        data: { ok: true },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      });
      const instance = createProxyAxios({ adapter }, false);

      const response = await instance.get('http://127.0.0.1/admin');

      expect(response.data).toEqual({ ok: true });
      expect(adapter).toHaveBeenCalled();
    });
  });

  describe('axios 导出实例', () => {
    it('应该导出一个默认的 axios 实例', async () => {
      const { axios } = await import('../../../common/api/axios');

      expect(axios).toBeDefined();
      expect(axios.defaults).toBeDefined();
      expect(axios.defaults.proxy).toBe(false);
      expect(axios.defaults.httpAgent).toBeDefined();
      expect(axios.defaults.httpsAgent).toBeDefined();
    });
  });

  describe('safe axios redirect protection', () => {
    it('应该逐跳跟随公网重定向', async () => {
      getTestInstanceConfig().security.checkInternalIp = false;
      const carrierHost = getReachablePrivateHost();
      if (!carrierHost) {
        return;
      }

      const targetServer = await listen((req, res) => {
        res.end(JSON.stringify({ ok: true, url: req.url }));
      }, '0.0.0.0');
      const targetPort = getServerPort(targetServer);

      const redirectServer = await listen((req, res) => {
        res.statusCode = 302;
        res.setHeader('Location', `http://${carrierHost}:${targetPort}/target`);
        res.end('redirect');
      }, '0.0.0.0');
      const redirectPort = getServerPort(redirectServer);

      try {
        const instance = createProxyAxios();
        const response = await instance.get<{ ok: boolean; url: string }>(
          `http://${carrierHost}:${redirectPort}/fetch`,
          {
            httpAgent: new http.Agent()
          }
        );

        expect(response.data).toEqual({ ok: true, url: '/target' });
      } finally {
        await closeServer(redirectServer);
        await closeServer(targetServer);
      }
    });

    it('应该阻止重定向到 loopback 地址', async () => {
      getTestInstanceConfig().security.checkInternalIp = false;
      const carrierHost = getReachablePrivateHost();
      if (!carrierHost) {
        return;
      }

      const protectedServer = await listen((req, res) => {
        res.end('INTERNAL-ONLY-RESPONSE');
      });
      const protectedPort = getServerPort(protectedServer);

      const redirectServer = await listen((req, res) => {
        res.statusCode = 302;
        res.setHeader('Location', `http://127.0.0.1:${protectedPort}/latest/meta-data/`);
        res.end('redirect');
      }, '0.0.0.0');
      const redirectPort = getServerPort(redirectServer);

      try {
        const instance = createProxyAxios();
        await expect(
          instance.get(`http://${carrierHost}:${redirectPort}/fetch`, {
            httpAgent: new http.Agent()
          })
        ).rejects.toThrow(PRIVATE_URL_TEXT);
      } finally {
        await closeServer(redirectServer);
        await closeServer(protectedServer);
      }
    });

    it('应该限制最大重定向次数', async () => {
      getTestInstanceConfig().security.checkInternalIp = false;
      const carrierHost = getReachablePrivateHost();
      if (!carrierHost) {
        return;
      }

      let redirectPort = 0;
      const redirectServer = await listen((req, res) => {
        res.statusCode = 302;
        res.setHeader('Location', `http://${carrierHost}:${redirectPort}/loop`);
        res.end('redirect');
      }, '0.0.0.0');
      redirectPort = getServerPort(redirectServer);

      try {
        const instance = createProxyAxios();
        await expect(
          instance.get(`http://${carrierHost}:${redirectPort}/loop`, {
            httpAgent: new http.Agent(),
            maxRedirects: 1
          })
        ).rejects.toThrow('Maximum redirects exceeded');
      } finally {
        await closeServer(redirectServer);
      }
    });
  });

  describe('safe axios DNS pinning', () => {
    it('应该拒绝直连路径中预检后重绑定到 loopback 的地址', async () => {
      clearProxyEnv();
      getTestInstanceConfig().security.checkInternalIp = false;

      vi.spyOn(dns, 'resolve4').mockResolvedValue(['8.8.8.8']);
      vi.spyOn(dns, 'resolve6').mockRejectedValue(new Error('No AAAA records'));
      vi.spyOn(dns, 'lookup').mockImplementation(
        async () => [{ address: '127.0.0.1', family: 4 }] as any
      );

      const protectedServer = await listen((req, res) => {
        res.end('FASTGPT-INTERNAL-CANARY');
      });
      const protectedPort = getServerPort(protectedServer);

      try {
        const instance = createProxyAxios();
        await expect(
          instance.get(`http://rebind-fastgpt.test:${protectedPort}/secret`)
        ).rejects.toThrow(PRIVATE_URL_TEXT);
      } finally {
        await closeServer(protectedServer);
      }
    });

    it('应该覆盖直连路径调用方传入的自定义 lookup agent', async () => {
      clearProxyEnv();
      getTestInstanceConfig().security.checkInternalIp = false;
      const carrierHost = getReachablePrivateHost();
      if (!carrierHost) {
        return;
      }

      vi.spyOn(dns, 'resolve4').mockResolvedValue([carrierHost]);
      vi.spyOn(dns, 'resolve6').mockRejectedValue(new Error('No AAAA records'));
      vi.spyOn(dns, 'lookup').mockImplementation(
        async () => [{ address: carrierHost, family: 4 }] as any
      );

      const targetServer = await listen((req, res) => {
        res.end(JSON.stringify({ host: req.headers.host, url: req.url }));
      }, '0.0.0.0');
      const targetPort = getServerPort(targetServer);

      const maliciousAgent = new http.Agent({
        lookup: (_hostname, optionsOrCallback, maybeCallback) => {
          const callback =
            typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;
          callback?.(null, '127.0.0.1', 4);
        }
      });

      try {
        const instance = createProxyAxios();
        const response = await instance.get<{ host: string; url: string }>(
          `http://pinned-fastgpt.test:${targetPort}/ok`,
          {
            httpAgent: maliciousAgent
          }
        );

        expect(response.data).toEqual({
          host: `pinned-fastgpt.test:${targetPort}`,
          url: '/ok'
        });
      } finally {
        await closeServer(targetServer);
      }
    });

    it('应该拒绝重定向下一跳中的 DNS rebinding', async () => {
      clearProxyEnv();
      getTestInstanceConfig().security.checkInternalIp = false;
      const carrierHost = getReachablePrivateHost();
      if (!carrierHost) {
        return;
      }

      vi.spyOn(dns, 'resolve4').mockResolvedValue(['8.8.8.8']);
      vi.spyOn(dns, 'resolve6').mockRejectedValue(new Error('No AAAA records'));
      vi.spyOn(dns, 'lookup').mockImplementation(
        async () => [{ address: '127.0.0.1', family: 4 }] as any
      );

      const redirectServer = await listen((req, res) => {
        res.statusCode = 302;
        res.setHeader('Location', 'http://redirect-rebind-fastgpt.test/secret');
        res.end('redirect');
      }, '0.0.0.0');
      const redirectPort = getServerPort(redirectServer);

      try {
        const instance = createProxyAxios();
        await expect(instance.get(`http://${carrierHost}:${redirectPort}/fetch`)).rejects.toThrow(
          PRIVATE_URL_TEXT
        );
      } finally {
        await closeServer(redirectServer);
      }
    });

    it('走代理时命中 isInternalAddress 应该直接拒绝', async () => {
      process.env.HTTP_PROXY = 'http://proxy.example:8080';
      getTestInstanceConfig().security.checkInternalIp = false;

      const adapter = vi.fn().mockResolvedValue({
        data: {},
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      });
      const instance = createProxyAxios({ adapter });

      await expect(instance.get('http://127.0.0.1/admin')).rejects.toThrow(PRIVATE_URL_TEXT);
      expect(adapter).not.toHaveBeenCalled();
    });

    it('走代理时无法取得可校验的目标地址就应拒绝请求', async () => {
      clearProxyEnv();
      process.env.HTTP_PROXY = 'http://proxy.example:8080';

      vi.spyOn(dns, 'resolve4').mockRejectedValue(new Error('DNS unavailable'));
      vi.spyOn(dns, 'resolve6').mockRejectedValue(new Error('DNS unavailable'));
      vi.spyOn(dns, 'lookup').mockRejectedValue(new Error('DNS unavailable'));
      const adapter = vi.fn();
      const instance = createProxyAxios({ adapter });

      await expect(instance.get('http://proxy-only-fastgpt.test/resource')).rejects.toThrow(
        'DNS unavailable'
      );
      expect(adapter).not.toHaveBeenCalled();
    });

    it.each(['环境代理', '显式代理'])(
      '%s应逐跳连接已检查的 IP，并向目标服务保留原始 Host',
      async (proxyMode) => {
        clearProxyEnv();
        getTestInstanceConfig().security.checkInternalIp = true;
        const firstHostname = 'first.example.test';
        const finalHostname = 'final.example.test';
        const firstIp = '93.184.216.34';
        const finalIp = '93.184.216.35';
        vi.spyOn(dns, 'resolve4').mockImplementation(async (hostname) => [
          hostname === firstHostname ? firstIp : finalIp
        ]);
        vi.spyOn(dns, 'resolve6').mockResolvedValue([]);
        vi.spyOn(dns, 'lookup').mockImplementation(
          async (hostname) =>
            [{ address: hostname === firstHostname ? firstIp : finalIp, family: 4 }] as any
        );

        let targetPort = 0;
        const hostHeaders: (string | undefined)[] = [];
        const target = await listen((req, res) => {
          hostHeaders.push(req.headers.host);
          if (req.url === '/start') {
            res.writeHead(302, { Location: `http://${finalHostname}:${targetPort}/ready` });
          }
          res.end('ready');
        });
        targetPort = getServerPort(target);

        const authorities: string[] = [];
        const proxy = await listen((_req, res) => res.writeHead(405).end());
        proxy.on('connect', (req, client) => {
          const authority = req.url ?? '';
          authorities.push(authority);
          if (
            authority !== `${firstIp}:${targetPort}` &&
            authority !== `${finalIp}:${targetPort}`
          ) {
            client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
            return;
          }
          // DNS 和代理的公网目标均为测试输入，代理只连接此用例启动的回显服务。
          const upstream = net.connect(targetPort, '127.0.0.1', () => {
            client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
            client.pipe(upstream).pipe(client);
          });
          upstream.on('error', () => client.destroy());
          client.on('close', () => upstream.destroy());
        });

        const proxyPort = getServerPort(proxy);
        const proxyConfig =
          proxyMode === '显式代理' ? { host: '127.0.0.1', port: proxyPort } : undefined;
        if (!proxyConfig) process.env.HTTP_PROXY = `http://127.0.0.1:${proxyPort}`;

        try {
          const instance = createProxyAxios({ proxy: proxyConfig, timeout: 4000 });
          const response = await instance.get(`http://${firstHostname}:${targetPort}/start`);
          expect(response.data).toBe('ready');
          expect(authorities).toEqual([`${firstIp}:${targetPort}`, `${finalIp}:${targetPort}`]);
          expect(hostHeaders).toEqual([
            `${firstHostname}:${targetPort}`,
            `${finalHostname}:${targetPort}`
          ]);
        } finally {
          await Promise.all([closeServer(proxy), closeServer(target)]);
        }
      }
    );

    it('直连路径 DNS lookup 失败时应该失败', async () => {
      clearProxyEnv();
      getTestInstanceConfig().security.checkInternalIp = false;

      vi.spyOn(dns, 'resolve4').mockResolvedValue(['8.8.8.8']);
      vi.spyOn(dns, 'resolve6').mockRejectedValue(new Error('No AAAA records'));
      vi.spyOn(dns, 'lookup').mockImplementation(async () => {
        throw new Error('DNS lookup failed');
      });
      const adapter = vi.fn().mockResolvedValue({
        data: { ok: true },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      });
      const instance = createProxyAxios({ adapter });

      await expect(instance.get('http://lookup-fail-fastgpt.test/resource')).rejects.toThrow(
        'DNS lookup failed'
      );
      expect(adapter).not.toHaveBeenCalled();
    });
  });

  describe('safe axios response size limit', () => {
    const mockPublicDns = () => {
      vi.spyOn(dns, 'resolve4').mockResolvedValue(['8.8.8.8']);
      vi.spyOn(dns, 'resolve6').mockRejectedValue(new Error('No AAAA records'));
      vi.spyOn(dns, 'lookup').mockImplementation(
        async () => [{ address: '8.8.8.8', family: 4 }] as any
      );
    };

    const createAdapter = () =>
      vi.fn(async (config) => ({
        status: 200,
        statusText: 'OK',
        data: {},
        headers: {},
        config
      }));

    it('应该在解压后的响应体超过 maxContentLength 时中止', async () => {
      clearProxyEnv();
      getTestInstanceConfig().security.checkInternalIp = false;
      const carrierHost = getReachablePrivateHost();
      if (!carrierHost) {
        return;
      }

      // 2MB 零字节压缩后只有几 KB，用于模拟 gzip 炸弹。
      const gzipBody = zlib.gzipSync(Buffer.alloc(2 * 1024 * 1024));
      const server = await listen((req, res) => {
        res.setHeader('Content-Encoding', 'gzip');
        res.setHeader('Content-Type', 'text/plain');
        res.end(gzipBody);
      }, '0.0.0.0');
      const port = getServerPort(server);

      try {
        const instance = createProxyAxios();
        await expect(
          instance.get(`http://${carrierHost}:${port}/bomb`, {
            responseType: 'text',
            maxContentLength: 128 * 1024
          })
        ).rejects.toThrow(/maxContentLength/i);
      } finally {
        await closeServer(server);
      }
    });

    it('缓冲型响应未显式限制时应该注入默认上限', async () => {
      clearProxyEnv();
      mockPublicDns();
      const adapter = createAdapter();
      const instance = createProxyAxios({ adapter });

      await instance.get('https://example.com/api');

      expect(adapter).toHaveBeenCalledWith(
        expect.objectContaining({ maxContentLength: getServiceAxiosMaxContentLength() })
      );
    });

    it('已创建的客户端按请求读取更新后的实例上限，并保留零字节语义', async () => {
      clearProxyEnv();
      mockPublicDns();
      const adapter = createAdapter();
      const instance = createProxyAxios({ adapter });

      for (const limit of [7, 11, 0]) {
        getTestInstanceConfig().resource.serviceAxiosMaxContentLength = limit;
        await instance.get('https://example.com/api');
        expect(adapter).toHaveBeenLastCalledWith(
          expect.objectContaining({ maxContentLength: limit * 1024 * 1024 })
        );
      }
    });

    it('流式响应未显式限制时应该保留 axios 默认值', async () => {
      clearProxyEnv();
      mockPublicDns();
      const adapter = createAdapter();
      const instance = createProxyAxios({ adapter });

      await instance.get('https://example.com/file', { responseType: 'stream' });

      expect(adapter).toHaveBeenCalledWith(
        expect.objectContaining({ responseType: 'stream', maxContentLength: -1 })
      );
    });

    it('流式响应应该保留调用方显式指定的上限', async () => {
      clearProxyEnv();
      mockPublicDns();
      const adapter = createAdapter();
      const instance = createProxyAxios({ adapter });

      await instance.get('https://example.com/file', {
        responseType: 'stream',
        maxContentLength: 100 * 1024 * 1024
      });

      expect(adapter).toHaveBeenCalledWith(
        expect.objectContaining({ maxContentLength: 100 * 1024 * 1024 })
      );
    });

    const createLargeFileServer = async () => {
      // 模拟渠道附件下载：文件超过共享默认 20 MiB，但未超过 100 MiB 业务配额。
      const body = Buffer.alloc(25 * 1024 * 1024, 1);
      const server = await listen((req, res) => {
        res.setHeader('Content-Type', 'application/octet-stream');
        res.end(body);
      }, '0.0.0.0');
      return { body, server, port: getServerPort(server) };
    };

    it('流式响应未显式限制时应该允许读取超过默认上限的业务文件', async () => {
      clearProxyEnv();
      getTestInstanceConfig().security.checkInternalIp = false;
      const carrierHost = getReachablePrivateHost();
      if (!carrierHost) {
        return;
      }

      const { body, server, port } = await createLargeFileServer();

      try {
        const instance = createProxyAxios();
        const response = await instance.get(`http://${carrierHost}:${port}/file`, {
          responseType: 'stream'
        });
        let totalBytes = 0;
        for await (const chunk of response.data as AsyncIterable<Buffer>) {
          totalBytes += chunk.length;
        }

        expect(totalBytes).toBe(body.length);
      } finally {
        await closeServer(server);
      }
    });

    it('构造实例时显式传入 maxContentLength: -1 应该保留取消限制的语义', async () => {
      clearProxyEnv();
      getTestInstanceConfig().security.checkInternalIp = false;
      const carrierHost = getReachablePrivateHost();
      if (!carrierHost) {
        return;
      }

      const { body, server, port } = await createLargeFileServer();

      try {
        const instance = createProxyAxios({ maxContentLength: -1 });
        const response = await instance.get(`http://${carrierHost}:${port}/file`, {
          responseType: 'arraybuffer'
        });

        expect(Buffer.byteLength(response.data)).toBe(body.length);
      } finally {
        await closeServer(server);
      }
    });

    it('单次请求显式传入 maxContentLength: -1 应该保留取消限制的语义', async () => {
      clearProxyEnv();
      getTestInstanceConfig().security.checkInternalIp = false;
      const carrierHost = getReachablePrivateHost();
      if (!carrierHost) {
        return;
      }

      const { body, server, port } = await createLargeFileServer();

      try {
        const instance = createProxyAxios();
        const response = await instance.get(`http://${carrierHost}:${port}/file`, {
          responseType: 'arraybuffer',
          maxContentLength: -1
        });

        expect(Buffer.byteLength(response.data)).toBe(body.length);
      } finally {
        await closeServer(server);
      }
    });
  });
});
