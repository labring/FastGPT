import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest';
import http from 'http';
import os from 'os';
import dns from 'dns/promises';
import { createProxyAxios } from '../../../common/api/axios';
import { PRIVATE_URL_TEXT } from '../../../common/system/utils';
import { serviceEnv } from '../../../env';

type AxiosRequestConfig = {
  timeout?: number;
  headers?: Record<string, string>;
  proxy?: false | { host: string; port: number };
  baseURL?: string;
  httpAgent?: any;
  httpsAgent?: any;
};

describe('axios.ts', () => {
  const mutableServiceEnv = serviceEnv as { CHECK_INTERNAL_IP: boolean };
  const originalCheckInternalIp = serviceEnv.CHECK_INTERNAL_IP;
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
    mutableServiceEnv.CHECK_INTERNAL_IP = originalCheckInternalIp;
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

  describe('createProxyAxios', () => {
    beforeEach(() => {
      vi.clearAllMocks();
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
     * 构造一个非 loopback 的本机访问地址,用于模拟“初始 URL 通过 SSRF 校验”。
     * CHECK_INTERNAL_IP=false 时私网地址会放行,但 loopback/metadata 仍然恒拦截。
     */
    const getReachablePrivateHost = () => {
      const interfaces = os.networkInterfaces();
      for (const items of Object.values(interfaces)) {
        for (const item of items || []) {
          if (item.family === 'IPv4' && !item.internal) {
            return item.address;
          }
        }
      }
      return undefined;
    };

    it('应该逐跳跟随公网重定向', async () => {
      mutableServiceEnv.CHECK_INTERNAL_IP = false;
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
      mutableServiceEnv.CHECK_INTERNAL_IP = false;
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
      mutableServiceEnv.CHECK_INTERNAL_IP = false;
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

    const getReachablePrivateHost = () => {
      const interfaces = os.networkInterfaces();
      for (const items of Object.values(interfaces)) {
        for (const item of items || []) {
          if (item.family === 'IPv4' && !item.internal) {
            return item.address;
          }
        }
      }
      return undefined;
    };

    it('应该拒绝直连路径中预检后重绑定到 loopback 的地址', async () => {
      clearProxyEnv();
      mutableServiceEnv.CHECK_INTERNAL_IP = false;

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
      mutableServiceEnv.CHECK_INTERNAL_IP = false;
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
      mutableServiceEnv.CHECK_INTERNAL_IP = false;
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
      mutableServiceEnv.CHECK_INTERNAL_IP = false;

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
      mutableServiceEnv.CHECK_INTERNAL_IP = false;

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
      mutableServiceEnv.CHECK_INTERNAL_IP = false;

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

  describe('pickOutboundAxios', () => {
    it.each([
      'http://example.com',
      'https://example.com/path',
      'http://169.254.169.254/latest/meta-data/',
      '//attacker.example/probe' // protocol-relative 也按绝对处理
    ])('绝对 URL %j 返回 safe axios 实例', async (url) => {
      const { axios, pickOutboundAxios } = await import('../../../common/api/axios');
      expect(pickOutboundAxios(url)).toBe(axios);
    });

    it.each(['/api/foo', 'api/foo', '/support/outLink/feishu/abc'])(
      '相对路径 %j 返回内部 axios(baseURL 固定到本机)',
      async (url) => {
        const { axios, pickOutboundAxios } = await import('../../../common/api/axios');
        const client = pickOutboundAxios(url);
        expect(client).not.toBe(axios);
        expect(client.defaults.baseURL).toMatch(/^http:\/\//);
      }
    );

    it('多次调用同一类型的 URL,内部 client 应被复用(避免每次新建实例)', async () => {
      const { pickOutboundAxios } = await import('../../../common/api/axios');
      const a = pickOutboundAxios('/api/a');
      const b = pickOutboundAxios('/api/b');
      expect(a).toBe(b);
    });
  });
});
