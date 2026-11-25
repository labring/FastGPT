import { getTestInstanceConfig } from '@test/utils/instanceConfigSnapshot';
import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import http from 'http';
import https from 'https';
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

  const startServer = <T extends http.Server | https.Server>(server: T, host = '127.0.0.1') =>
    new Promise<T>((resolve) => {
      server.listen(0, host, () => resolve(server));
    });

  const listen = (handler: http.RequestListener, host?: string) =>
    startServer(http.createServer(handler), host);

  const closeServer = (server: http.Server | https.Server) =>
    new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });

  const getServerPort = (server: http.Server | https.Server): number => {
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

    it('走代理且 isInternalAddress 返回 false 时应保留代理路径并跳过 pinning lookup', async () => {
      process.env.HTTP_PROXY = 'http://proxy.example:8080';
      getTestInstanceConfig().security.checkInternalIp = false;

      vi.spyOn(dns, 'resolve4').mockRejectedValue(new Error('DNS unavailable'));
      vi.spyOn(dns, 'resolve6').mockRejectedValue(new Error('DNS unavailable'));
      const lookupSpy = vi.spyOn(dns, 'lookup');
      const adapter = vi.fn().mockResolvedValue({
        data: { ok: true },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      });
      const instance = createProxyAxios({ adapter });

      const response = await instance.get('http://proxy-only-fastgpt.test/resource');

      expect(response.data).toEqual({ ok: true });
      expect(adapter).toHaveBeenCalled();
      expect(lookupSpy).not.toHaveBeenCalled();
    });

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

    it('公网 IPv6 字面量直连应规范化方括号并跳过 DNS lookup', async () => {
      clearProxyEnv();
      getTestInstanceConfig().security.checkInternalIp = true;

      const lookupSpy = vi.spyOn(dns, 'lookup').mockRejectedValue(new Error('DNS unavailable'));
      let capturedAgent: http.Agent | undefined;
      const adapter = vi.fn(async (config: SafeAxiosRequestConfig) => {
        capturedAgent = config.httpAgent;
        return {
          data: { ok: true },
          status: 200,
          statusText: 'OK',
          headers: {},
          config
        };
      });
      const instance = createProxyAxios({ adapter });

      const response = await instance.get('http://[2606:4700:4700::1111]/resource');

      expect(response.data).toEqual({ ok: true });
      expect(lookupSpy).not.toHaveBeenCalled();
      expect(capturedAgent).toBeInstanceOf(http.Agent);
      const pinnedLookup = (
        capturedAgent as unknown as {
          options?: {
            lookup?: (
              hostname: string,
              options: object,
              cb: (err: Error | null, address: string, family: number) => void
            ) => void;
          };
        }
      )?.options?.lookup;
      expect(typeof pinnedLookup).toBe('function');
      const resolved = await new Promise<{ address: string; family: number }>((resolve, reject) => {
        pinnedLookup!('2606:4700:4700::1111', {}, (err, address, family) => {
          if (err) reject(err);
          else resolve({ address, family });
        });
      });
      expect(resolved).toEqual({ address: '2606:4700:4700::1111', family: 6 });
    });

    it('显式代理应优先于环境代理处理 HTTP 请求', async () => {
      clearProxyEnv();
      getTestInstanceConfig().security.checkInternalIp = false;
      vi.spyOn(dns, 'resolve4').mockRejectedValue(new Error('DNS unavailable'));
      vi.spyOn(dns, 'resolve6').mockRejectedValue(new Error('DNS unavailable'));

      let envProxyHits = 0;
      let explicitProxyHits = 0;
      const envProxy = await listen((_req, res) => {
        envProxyHits += 1;
        res.end('from-env-proxy');
      });
      const explicitProxy = await listen((req, res) => {
        explicitProxyHits += 1;
        res.end(`from-explicit-proxy:${req.url}`);
      });

      try {
        process.env.HTTP_PROXY = `http://127.0.0.1:${getServerPort(envProxy)}`;
        const instance = createProxyAxios();
        const response = await instance.get('http://dual-proxy.example.test/resource', {
          proxy: { host: '127.0.0.1', port: getServerPort(explicitProxy) }
        });

        expect(response.data).toBe('from-explicit-proxy:http://dual-proxy.example.test/resource');
        expect(explicitProxyHits).toBe(1);
        expect(envProxyHits).toBe(0);
      } finally {
        await Promise.all([closeServer(envProxy), closeServer(explicitProxy)]);
      }
    });

    it('重定向跨 NO_PROXY 边界时应支持直连与环境代理双向切换', async () => {
      clearProxyEnv();
      getTestInstanceConfig().security.checkInternalIp = false;
      const carrierHost = getReachablePrivateHost();
      if (!carrierHost) return;

      vi.spyOn(dns, 'resolve4').mockRejectedValue(new Error('DNS unavailable'));
      vi.spyOn(dns, 'resolve6').mockRejectedValue(new Error('DNS unavailable'));

      let directPort = 0;
      const proxyHits: string[] = [];
      const directHits: string[] = [];
      const directServer = await listen((req, res) => {
        directHits.push(req.url ?? '');
        if (req.url === '/to-proxy') {
          res.writeHead(302, { Location: 'http://via-proxy.example.test/final' });
          res.end();
          return;
        }
        res.end('direct-final');
      }, '0.0.0.0');
      directPort = getServerPort(directServer);

      const proxyServer = await listen((req, res) => {
        proxyHits.push(req.url ?? '');
        if (req.url === 'http://via-proxy.example.test/to-direct') {
          res.writeHead(302, { Location: `http://${carrierHost}:${directPort}/final` });
          res.end();
          return;
        }
        res.end('proxy-final');
      });

      try {
        process.env.HTTP_PROXY = `http://127.0.0.1:${getServerPort(proxyServer)}`;
        process.env.NO_PROXY = carrierHost;
        const instance = createProxyAxios();

        const directToProxy = await instance.get(`http://${carrierHost}:${directPort}/to-proxy`);
        expect(directToProxy.data).toBe('proxy-final');
        expect(directHits).toEqual(['/to-proxy']);
        expect(proxyHits).toEqual(['http://via-proxy.example.test/final']);

        const proxyToDirect = await instance.get('http://via-proxy.example.test/to-direct');
        expect(proxyToDirect.data).toBe('direct-final');
        expect(proxyHits).toEqual([
          'http://via-proxy.example.test/final',
          'http://via-proxy.example.test/to-direct'
        ]);
        expect(directHits).toEqual(['/to-proxy', '/final']);
      } finally {
        await Promise.all([closeServer(directServer), closeServer(proxyServer)]);
      }
    });

    it('Proxy-Authorization 仅发送给首跳代理，直连与跨跳切换均不泄露到目标请求头', async () => {
      clearProxyEnv();
      getTestInstanceConfig().security.checkInternalIp = false;
      const carrierHost = getReachablePrivateHost();
      if (!carrierHost) return;

      vi.spyOn(dns, 'resolve4').mockRejectedValue(new Error('DNS unavailable'));
      vi.spyOn(dns, 'resolve6').mockRejectedValue(new Error('DNS unavailable'));

      const directProxyAuthHeaders: (string | undefined)[] = [];
      const directServer = await listen((req, res) => {
        directProxyAuthHeaders.push(req.headers['proxy-authorization']);
        res.end('direct-ok');
      }, '0.0.0.0');
      const directPort = getServerPort(directServer);

      const proxyAuthSeen: (string | undefined)[] = [];
      const proxyServer = await listen((req, res) => {
        proxyAuthSeen.push(req.headers['proxy-authorization']);
        if (req.url === 'http://proxied.example.test/hop1') {
          res.writeHead(302, { Location: `http://${carrierHost}:${directPort}/hop2` });
          res.end();
          return;
        }
        res.end('proxy-ok');
      });

      try {
        process.env.HTTP_PROXY = `http://127.0.0.1:${getServerPort(proxyServer)}`;
        process.env.NO_PROXY = carrierHost;
        const instance = createProxyAxios();

        // 1. 直连请求传入 Proxy-Authorization 必须被剥离。
        const directRes = await instance.get(`http://${carrierHost}:${directPort}/direct`, {
          headers: { 'Proxy-Authorization': 'Basic c2VjcmV0' }
        });
        expect(directRes.data).toBe('direct-ok');
        expect(directProxyAuthHeaders).toEqual([undefined]);

        // 2. 经代理发起并跳转到 NO_PROXY 直连目标时，代理收到凭据，直连目标不收到凭据。
        const redirectRes = await instance.get('http://proxied.example.test/hop1', {
          headers: { 'Proxy-Authorization': 'Basic c2VjcmV0' }
        });
        expect(redirectRes.data).toBe('direct-ok');
        expect(proxyAuthSeen).toEqual(['Basic c2VjcmV0']);
        expect(directProxyAuthHeaders).toEqual([undefined, undefined]);
      } finally {
        await Promise.all([closeServer(directServer), closeServer(proxyServer)]);
      }
    });

    it('代理 HTTPS CONNECT 握手超时或取消时应立即释放代理 socket，并保留默认 30s 握手期限', async () => {
      clearProxyEnv();
      getTestInstanceConfig().security.checkInternalIp = false;
      vi.spyOn(dns, 'resolve4').mockRejectedValue(new Error('DNS unavailable'));
      vi.spyOn(dns, 'resolve6').mockRejectedValue(new Error('DNS unavailable'));

      const hangingSockets: net.Socket[] = [];
      const closedEvents: Promise<unknown>[] = [];
      const connectSeen: (() => void)[] = [];
      const waitNextConnect = () => new Promise<void>((resolve) => connectSeen.push(resolve));

      const hangingProxy = await listen((_req, res) => {
        res.statusCode = 405;
        res.end();
      });
      hangingProxy.on('connect', (_req, socket) => {
        hangingSockets.push(socket);
        // http.Server 默认 allowHalfOpen=true，需消费对端 FIN 后才能触发服务端 socket close。
        socket.on('end', () => socket.destroy());
        socket.resume();
        closedEvents.push(once(socket, 'close'));
        connectSeen.shift()?.();
      });

      try {
        process.env.HTTPS_PROXY = `http://127.0.0.1:${getServerPort(hangingProxy)}`;
        const instance = createProxyAxios();

        // 1. 显式请求超时：返回 ECONNABORTED 且释放代理 socket。
        const timeoutConnect = waitNextConnect();
        const timeoutReq = instance.get('https://hanging-timeout.example.test/resource', {
          timeout: 80
        });
        await timeoutConnect;
        await expect(timeoutReq).rejects.toMatchObject({ code: 'ECONNABORTED' });
        await closedEvents[0];

        // 2. AbortSignal 取消：立即释放代理 socket。
        const abortConnect = waitNextConnect();
        const controller = new AbortController();
        const abortReq = instance.get('https://hanging-abort.example.test/resource', {
          signal: controller.signal
        });
        await abortConnect;
        controller.abort();
        await expect(abortReq).rejects.toMatchObject({ code: 'ERR_CANCELED' });
        await closedEvents[1];

        // 3. 未设置 timeout 时触发默认 30s 握手超时并释放代理 socket。
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        try {
          const defaultConnect = waitNextConnect();
          const defaultReq = instance.get('https://hanging-default.example.test/resource');
          await defaultConnect;
          vi.advanceTimersByTime(30_000);
          await expect(defaultReq).rejects.toThrow(
            /Proxy CONNECT handshake timed out after 30000 ms/
          );
          await closedEvents[2];
        } finally {
          vi.useRealTimers();
        }
      } finally {
        for (const s of hangingSockets) s.destroy();
        await closeServer(hangingProxy);
      }
    });

    it('__safeAxios.rejectUnauthorized 经代理时仅作用于目标 TLS，不影响 HTTPS 代理自身证书校验', async () => {
      clearProxyEnv();
      getTestInstanceConfig().security.checkInternalIp = false;
      vi.spyOn(dns, 'resolve4').mockRejectedValue(new Error('DNS unavailable'));
      vi.spyOn(dns, 'resolve6').mockRejectedValue(new Error('DNS unavailable'));

      const cert = readFileSync(new URL('./fixtures/connect-test-cert.pem.txt', import.meta.url));
      const key = readFileSync(new URL('./fixtures/connect-test-key.pem.txt', import.meta.url));

      const targetAuthHeaders: (string | undefined)[] = [];
      const selfSignedTarget = await startServer(
        https.createServer({ cert, key }, (req, res) => {
          targetAuthHeaders.push(req.headers['proxy-authorization']);
          res.end('tls-target-ok');
        })
      );
      const targetPort = getServerPort(selfSignedTarget);

      const connectSockets = new Set<net.Socket>();
      const connectProxyAuth: (string | undefined)[] = [];
      const httpProxy = await listen((_req, res) => {
        res.statusCode = 405;
        res.end();
      });
      httpProxy.on('connect', (req, clientSocket, head) => {
        connectProxyAuth.push(req.headers['proxy-authorization']);
        connectSockets.add(clientSocket);
        const upstream = net.connect(targetPort, '127.0.0.1', () => {
          connectSockets.add(upstream);
          clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
          if (head.length > 0) upstream.write(head);
          upstream.pipe(clientSocket);
          clientSocket.pipe(upstream);
        });
        upstream.on('error', () => clientSocket.destroy());
        clientSocket.on('close', () => {
          connectSockets.delete(clientSocket);
          connectSockets.delete(upstream);
          upstream.destroy();
        });
      });

      const selfSignedHttpsProxy = await startServer(
        https.createServer({ cert, key }, (_req, res) => {
          res.statusCode = 405;
          res.end();
        })
      );

      try {
        process.env.HTTPS_PROXY = `http://127.0.0.1:${getServerPort(httpProxy)}`;
        const instance = createProxyAxios();

        // 默认校验证书，自签名目标被拒绝。
        await expect(instance.get('https://target.example.test/tls')).rejects.toThrow();

        // 显式豁免目标证书时经代理成功，且 Proxy-Authorization 不透传到目标 HTTPS 服务。
        const okRes = await instance.get('https://target.example.test/tls', {
          headers: { 'Proxy-Authorization': 'Basic dGxzLXByb3h5' },
          __safeAxios: { rejectUnauthorized: false }
        } as SafeAxiosRequestConfig);
        expect(okRes.data).toBe('tls-target-ok');
        expect(connectProxyAuth).toContain('Basic dGxzLXByb3h5');
        expect(targetAuthHeaders).toEqual([undefined]);

        // HTTPS 代理本身为自签名证书时，即使目标配置 rejectUnauthorized: false 仍应拒绝代理证书。
        process.env.HTTPS_PROXY = `https://127.0.0.1:${getServerPort(selfSignedHttpsProxy)}`;
        await expect(
          instance.get('https://target.example.test/tls', {
            __safeAxios: { rejectUnauthorized: false }
          } as SafeAxiosRequestConfig)
        ).rejects.toThrow();
      } finally {
        for (const s of connectSockets) s.destroy();
        await Promise.all([
          closeServer(httpProxy),
          closeServer(selfSignedHttpsProxy),
          closeServer(selfSignedTarget)
        ]);
      }
    });

    it('HTTP 转发代理在 query 包含完整 URL 时仍应发送 RFC 9112 absolute-form 请求目标', async () => {
      clearProxyEnv();
      getTestInstanceConfig().security.checkInternalIp = false;
      vi.spyOn(dns, 'resolve4').mockRejectedValue(new Error('DNS unavailable'));
      vi.spyOn(dns, 'resolve6').mockRejectedValue(new Error('DNS unavailable'));

      const receivedRequestTargets: string[] = [];
      const proxyServer = await listen((req, res) => {
        const target = req.url ?? '';
        receivedRequestTargets.push(target);
        if (!/^http:\/\//i.test(target)) {
          res.writeHead(400);
          res.end('invalid-absolute-form');
          return;
        }
        res.end(`proxied:${target}`);
      });

      try {
        process.env.HTTP_PROXY = `http://127.0.0.1:${getServerPort(proxyServer)}`;
        const instance = createProxyAxios();
        const url =
          'http://query-url.example.test/fetch?redirect=https://other.example.test/callback&ok=1';
        const res = await instance.get(url);

        expect(res.data).toBe(`proxied:${url}`);
        expect(receivedRequestTargets).toEqual([url]);
      } finally {
        await closeServer(proxyServer);
      }
    });

    it.each(['socks5', 'socks5h', 'socks'] as const)(
      '%s:// 代理应在无本地目标 DNS 时交由代理侧解析域名出网',
      async (scheme) => {
        clearProxyEnv();
        getTestInstanceConfig().security.checkInternalIp = false;
        vi.spyOn(dns, 'resolve4').mockRejectedValue(new Error('DNS unavailable'));
        vi.spyOn(dns, 'resolve6').mockRejectedValue(new Error('DNS unavailable'));
        const lookupSpy = vi.spyOn(dns, 'lookup').mockRejectedValue(new Error('DNS unavailable'));

        const targetServer = await listen((req, res) => {
          res.end(`socks-target:${req.headers.host}${req.url}`);
        });
        const targetPort = getServerPort(targetServer);

        const socksTargets: Array<{ atyp: number; host: string; port: number }> = [];
        const socksSockets = new Set<net.Socket>();
        const socksServer = net.createServer((client) => {
          socksSockets.add(client);
          let stage = 0;
          client.on('data', (chunk) => {
            if (stage === 0) {
              stage = 1;
              client.write(Buffer.from([0x05, 0x00]));
            } else if (stage === 1) {
              stage = 2;
              const atyp = chunk[3];
              const hostLen = atyp === 0x03 ? chunk[4] : 0;
              const host = atyp === 0x03 ? chunk.subarray(5, 5 + hostLen).toString('utf8') : '';
              const port = chunk.readUInt16BE(5 + hostLen);
              socksTargets.push({ atyp, host, port });
              const upstream = net.connect(targetPort, '127.0.0.1', () => {
                socksSockets.add(upstream);
                client.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 127, 0, 0, 1, 0, 0]));
                upstream.pipe(client);
                client.pipe(upstream);
              });
              upstream.on('error', () => client.destroy());
              client.on('close', () => {
                socksSockets.delete(client);
                socksSockets.delete(upstream);
                upstream.destroy();
              });
            }
          });
        });
        await new Promise<void>((resolve) => socksServer.listen(0, '127.0.0.1', resolve));
        const socksAddress = socksServer.address();
        if (!socksAddress || typeof socksAddress === 'string') {
          throw new Error('Invalid SOCKS5 server address');
        }

        try {
          process.env.ALL_PROXY = `${scheme}://127.0.0.1:${socksAddress.port}`;
          const instance = createProxyAxios();
          const res = await instance.get('http://socks-only.example.test/data');

          expect(res.data).toBe('socks-target:socks-only.example.test/data');
          expect(socksTargets).toEqual([{ atyp: 0x03, host: 'socks-only.example.test', port: 80 }]);
          expect(lookupSpy).not.toHaveBeenCalled();
        } finally {
          for (const s of socksSockets) s.destroy();
          await Promise.all([
            new Promise<void>((resolve) => socksServer.close(() => resolve())),
            closeServer(targetServer)
          ]);
        }
      }
    );

    it('SOCKS5 代理握手挂起时取消请求应立即关闭代理 socket', async () => {
      clearProxyEnv();
      getTestInstanceConfig().security.checkInternalIp = false;
      vi.spyOn(dns, 'resolve4').mockRejectedValue(new Error('DNS unavailable'));
      vi.spyOn(dns, 'resolve6').mockRejectedValue(new Error('DNS unavailable'));

      const hangingSockets: net.Socket[] = [];
      let resolveGreetingSeen!: () => void;
      const greetingSeen = new Promise<void>((resolve) => {
        resolveGreetingSeen = resolve;
      });
      let socketClosed!: Promise<unknown>;

      const hangingSocks = net.createServer((socket) => {
        hangingSockets.push(socket);
        socket.on('end', () => socket.destroy());
        socketClosed = once(socket, 'close');
        socket.once('data', () => {
          // 收到 SOCKS5 greeting 后故意不响应，模拟协商挂起。
          socket.resume();
          resolveGreetingSeen();
        });
      });
      await new Promise<void>((resolve) => hangingSocks.listen(0, '127.0.0.1', resolve));
      const socksAddress = hangingSocks.address();
      if (!socksAddress || typeof socksAddress === 'string') {
        throw new Error('Invalid hanging SOCKS5 server address');
      }

      try {
        process.env.ALL_PROXY = `socks5://127.0.0.1:${socksAddress.port}`;
        const instance = createProxyAxios();
        const controller = new AbortController();

        const req = instance.get('http://hanging-socks.example.test/resource', {
          signal: controller.signal
        });
        await greetingSeen;
        controller.abort();

        await expect(req).rejects.toMatchObject({ code: 'ERR_CANCELED' });
        await socketClosed;
      } finally {
        for (const s of hangingSockets) s.destroy();
        await new Promise<void>((resolve) => hangingSocks.close(() => resolve()));
      }
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
