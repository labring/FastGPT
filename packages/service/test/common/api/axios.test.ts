import { getTestInstanceConfig } from '@test/utils/instanceConfigSnapshot';
import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import http from 'http';
import https from 'https';
import tls from 'tls';
import { AxiosError, CancelToken } from 'axios';
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
        const targetAuth: (string | undefined)[] = [];
        const target = await listen((req, res) => {
          hostHeaders.push(req.headers.host);
          targetAuth.push(req.headers['proxy-authorization']);
          if (req.url === '/start') {
            res.writeHead(302, { Location: `http://${finalHostname}:${targetPort}/ready` });
          }
          res.end('ready');
        });
        targetPort = getServerPort(target);

        const authorities: string[] = [];
        const proxyAuth: (string | undefined)[] = [];
        const proxy = await listen((_req, res) => res.writeHead(405).end());
        proxy.on('connect', (req, client) => {
          const authority = req.url ?? '';
          authorities.push(authority);
          proxyAuth.push(req.headers['proxy-authorization']);
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
          proxyMode === '显式代理'
            ? {
                host: '127.0.0.1',
                port: proxyPort,
                auth: { username: 'proxy', password: 'fixture' }
              }
            : undefined;
        if (!proxyConfig) process.env.HTTP_PROXY = `http://127.0.0.1:${proxyPort}`;

        try {
          const instance = createProxyAxios({ proxy: proxyConfig, timeout: 4000 });
          const credential = `Basic ${Buffer.from('test:fixture').toString('base64')}`;
          const expectedCredential = proxyConfig
            ? `Basic ${Buffer.from('proxy:fixture').toString('base64')}`
            : credential;
          const response = await instance.get(`http://${firstHostname}:${targetPort}/start`, {
            headers: { 'pRoXy-AuThOrIzAtIoN': credential }
          });
          expect(response.data).toBe('ready');
          expect(proxyAuth).toEqual([expectedCredential, expectedCredential]);
          expect(targetAuth).toEqual([undefined, undefined]);
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

  describe('protected proxy transport', () => {
    // 测试证书只绑定本地代理和虚构目标域名，进程信任列表在每个用例后恢复。
    const targetHostname = 'target.example.test';
    const checkedAddress = '93.184.216.34';
    const tlsFixture = {
      cert: readFileSync(new URL('./fixtures/connect-test-cert.pem.txt', import.meta.url), 'utf8'),
      key: readFileSync(new URL('./fixtures/connect-test-key.pem.txt', import.meta.url), 'utf8')
    };
    let originalCertificates: string[];

    beforeEach(() => {
      clearProxyEnv();
      originalCertificates = tls.getCACertificates('default');
      tls.setDefaultCACertificates([...originalCertificates, tlsFixture.cert]);
      vi.spyOn(dns, 'resolve4').mockResolvedValue([checkedAddress]);
      vi.spyOn(dns, 'resolve6').mockResolvedValue([]);
      vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: checkedAddress, family: 4 }] as never);
    });

    afterEach(() => {
      tls.setDefaultCACertificates(originalCertificates);
    });

    const listenProxy = (scheme: 'http' | 'https') => {
      const rejectForwardRequest: http.RequestListener = (_req, res) => res.writeHead(405).end();
      return scheme === 'https'
        ? startServer(https.createServer(tlsFixture, rejectForwardRequest))
        : listen(rejectForwardRequest);
    };

    it.each(['http', 'https'] as const)(
      'validates target TLS identity over an %s proxy',
      async (scheme) => {
        const sniNames: string[] = [];
        const targetContext = tls.createSecureContext(tlsFixture);
        const target = await startServer(
          https.createServer(
            {
              ...tlsFixture,
              SNICallback: (servername, callback) => {
                sniNames.push(servername);
                callback(null, targetContext);
              }
            },
            (req, res) => res.end(req.headers.host)
          )
        );
        const proxy = await listenProxy(scheme);
        const targetPort = getServerPort(target);
        const authorities: string[] = [];
        const tunnelSockets = new Set<net.Socket>();
        const viaProxy = createProxyAxios({ timeout: 2500 });
        process.env.HTTPS_PROXY = `${scheme}://127.0.0.1:${getServerPort(proxy)}`;

        proxy.on('connect', (req, client) => {
          const authority = req.url ?? '';
          authorities.push(authority);
          if (authority !== `${checkedAddress}:${targetPort}`) {
            client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
            return;
          }
          const upstream = net.connect(targetPort, '127.0.0.1', () => {
            client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
            client.pipe(upstream).pipe(client);
          });
          tunnelSockets.add(client);
          upstream.on('error', () => client.destroy());
          client.on('error', () => upstream.destroy());
          client.on('close', () => {
            tunnelSockets.delete(client);
            upstream.destroy();
          });
          upstream.on('close', () => client.destroy());
        });

        try {
          const response = await viaProxy.get(`https://${targetHostname}:${targetPort}/`);
          expect(response.data).toBe(`${targetHostname}:${targetPort}`);
          await expect(
            viaProxy.get(`https://wrong.example.test:${targetPort}/`)
          ).rejects.toMatchObject({
            code: 'ERR_TLS_CERT_ALTNAME_INVALID'
          });
          expect(authorities).toEqual(Array(2).fill(`${checkedAddress}:${targetPort}`));
          expect(sniNames).toEqual([targetHostname, 'wrong.example.test']);
        } finally {
          for (const socket of tunnelSockets) socket.destroy();
          await Promise.all([closeServer(proxy), closeServer(target)]);
        }
      }
    );

    it.each([
      ['http', 'timeout'],
      ['https', 'timeout'],
      ['http', 'signal'],
      ['https', 'cancelToken']
    ] as const)('closes the %s proxy socket on %s during CONNECT', async (scheme, stop) => {
      const proxy = await listenProxy(scheme);
      process.env.HTTP_PROXY = `${scheme}://127.0.0.1:${getServerPort(proxy)}`;
      const signal = new AbortController();
      const cancelSource = CancelToken.source();
      let proxySocket: net.Socket | undefined;

      const socketClosed = Promise.withResolvers<void>();
      proxy.once('connect', (_req, socket) => {
        proxySocket = socket;
        // HTTP 升级连接可以半关闭；收到客户端的 FIN 后关闭测试代理自己的写入端。
        socket.once('end', () => socket.end());
        socket.on('error', () => {});
        socket.once('close', () => socketClosed.resolve());
        socket.resume();
      });
      const connected = once(proxy, 'connect', { signal: AbortSignal.timeout(2000) });
      const result = createProxyAxios({ timeout: stop === 'timeout' ? 800 : 4000 })
        .get(`http://${targetHostname}/`, {
          signal: signal.signal,
          cancelToken: cancelSource.token
        })
        .then(
          () => ({ code: 'unexpected success' }),
          (error: unknown) => error
        );

      try {
        await connected;
        if (stop === 'signal') signal.abort();
        if (stop === 'cancelToken') cancelSource.cancel('test canceled');
        expect(await result).toMatchObject({
          code: stop === 'timeout' ? 'ECONNABORTED' : 'ERR_CANCELED'
        });
        const closeDeadline = AbortSignal.timeout(2000);
        await Promise.race([
          socketClosed.promise,
          new Promise<never>((_resolve, reject) =>
            closeDeadline.addEventListener(
              'abort',
              () => reject(new Error('Proxy socket stayed open')),
              {
                once: true
              }
            )
          )
        ]);
      } finally {
        proxySocket?.destroy();
        await closeServer(proxy);
      }
    });

    it.each(['request', 'instance default'] as const)(
      'does not reuse %s proxy credentials when a redirect switches proxies',
      async (source) => {
        process.env.HTTP_PROXY = 'http://first-proxy.example.test:8080';
        process.env.HTTPS_PROXY = 'http://other-proxy.example.test:8080';
        const credential = `Basic ${Buffer.from('test:fixture').toString('base64')}`;
        const firstUrl = `http://${targetHostname}/start`;
        const nextUrl = `https://${targetHostname}/end`;
        const adapter = vi.fn().mockImplementation(async (config) => ({
          config,
          data: 'ready',
          ...(config.url === firstUrl
            ? { status: 302, headers: { location: nextUrl } }
            : { status: 200, headers: {} })
        }));
        const client = createProxyAxios({ adapter });
        const headers = { 'Proxy-Authorization': credential };
        if (source === 'instance default') {
          Object.assign(client.defaults.headers.common, headers);
        }
        await client.get(firstUrl, source === 'request' ? { headers } : undefined);

        const [firstRequest, redirectedRequest] = adapter.mock.calls.map(([config]) => config);
        expect(firstRequest.httpAgent.proxyHeaders()).toEqual({
          'Proxy-Authorization': credential
        });
        expect(
          JSON.stringify(new AxiosError('test', undefined, firstRequest).toJSON())
        ).not.toContain(credential);
        expect(firstRequest.headers.has('Proxy-Authorization')).toBe(false);
        expect(redirectedRequest.httpsAgent.proxyHeaders).toEqual({});
        expect(redirectedRequest.headers.has('Proxy-Authorization')).toBe(false);
      }
    );

    it('surfaces a proxy that rejects CONNECT without trying forward HTTP', async () => {
      const requestMethods: (string | undefined)[] = [];
      const proxy = await listen((req, res) => {
        requestMethods.push(req.method);
        res.end('forwarded');
      });
      proxy.on('connect', (req, socket) => {
        requestMethods.push(req.method);
        socket.end('HTTP/1.1 405 Method Not Allowed\r\nConnection: close\r\n\r\n');
      });
      process.env.HTTP_PROXY = `http://127.0.0.1:${getServerPort(proxy)}`;

      try {
        await expect(
          createProxyAxios({ timeout: 2500 }).get(`http://${targetHostname}/`)
        ).rejects.toMatchObject({ response: { status: 405 } });
        expect(requestMethods).toEqual(['CONNECT']);
      } finally {
        await closeServer(proxy);
      }
    });

    it('rejects a SOCKS proxy and keeps NO_PROXY targets on the direct route', async () => {
      process.env.ALL_PROXY = 'socks5://proxy.example.test:1080';
      const adapter = vi
        .fn()
        .mockResolvedValue({ data: 'ready', status: 200, headers: {}, config: {} });
      const client = createProxyAxios({ adapter });

      await expect(client.get(`http://${targetHostname}/`)).rejects.toThrow(
        'SSRF-protected requests require an HTTP or HTTPS CONNECT proxy'
      );
      expect(adapter).not.toHaveBeenCalled();

      process.env.NO_PROXY = targetHostname;
      await client.get(`http://${targetHostname}/`, {
        headers: { 'Proxy-Authorization': 'Basic dGVzdDpmaXh0dXJl' }
      });
      expect(adapter.mock.calls[0][0].httpAgent).toBeInstanceOf(http.Agent);
      expect(adapter.mock.calls[0][0].headers.has('Proxy-Authorization')).toBe(false);
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
