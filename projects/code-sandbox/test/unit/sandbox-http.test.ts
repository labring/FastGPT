import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import dnsCallback from 'node:dns';
import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import os from 'node:os';
import type { Duplex } from 'node:stream';
import tls from 'node:tls';
import { isServerConfigError } from '@fastgpt/global/common/error/utils';
import { runSandboxHttpRequest } from '../../src/utils/sandbox-http';

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

const defaultLimits = {
  maxRequests: 5,
  timeoutMs: 3000,
  maxResponseSize: 1024 * 64,
  maxRequestBodySize: 1024 * 64
};

const startServer = <T extends http.Server | https.Server | net.Server>(
  server: T,
  host = '127.0.0.1'
) =>
  new Promise<T>((resolve) => {
    server.listen(0, host, () => resolve(server));
  });

const closeServer = (server: http.Server | https.Server | net.Server) =>
  new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });

const getServerPort = (server: http.Server | https.Server | net.Server): number => {
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Invalid test server address');
  }
  return address.port;
};

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

const tlsFixture = {
  cert: readFileSync(
    new URL(
      '../../../../packages/service/test/common/api/fixtures/connect-test-cert.pem.txt',
      import.meta.url
    ),
    'utf8'
  ),
  key: readFileSync(
    new URL(
      '../../../../packages/service/test/common/api/fixtures/connect-test-key.pem.txt',
      import.meta.url
    ),
    'utf8'
  )
};

/** 创建最小化本地 SOCKS5 代理（支持用户名/密码认证与 ATYP=0x03 域名转发），记录代理收到的目标主机与认证信息。 */
const createSocks5Proxy = async ({
  upstreamPort,
  expectedAuth
}: {
  upstreamPort: number;
  expectedAuth?: { username: string; password: string };
}) => {
  const destinations: Array<{ atyp: number; host: string; port: number }> = [];
  const authSeen: Array<{ username: string; password: string }> = [];
  const sockets = new Set<net.Socket>();

  const server = await startServer(
    net.createServer((client) => {
      sockets.add(client);
      let stage: 'greeting' | 'auth' | 'request' | 'tunnel' = 'greeting';
      let buf = Buffer.alloc(0);

      const processBuffer = () => {
        if (stage === 'greeting') {
          if (buf.length < 2) return;
          const nMethods = buf[1];
          if (buf.length < 2 + nMethods) return;
          const methods = buf.subarray(2, 2 + nMethods);
          buf = buf.subarray(2 + nMethods);
          if (expectedAuth && methods.includes(0x02)) {
            stage = 'auth';
            client.write(Buffer.from([0x05, 0x02]));
          } else {
            stage = 'request';
            client.write(Buffer.from([0x05, 0x00]));
          }
        }

        if (stage === 'auth') {
          if (buf.length < 2) return;
          const uLen = buf[1];
          if (buf.length < 2 + uLen + 1) return;
          const username = buf.subarray(2, 2 + uLen).toString('utf8');
          const pLen = buf[2 + uLen];
          if (buf.length < 2 + uLen + 1 + pLen) return;
          const password = buf.subarray(3 + uLen, 3 + uLen + pLen).toString('utf8');
          buf = buf.subarray(3 + uLen + pLen);
          authSeen.push({ username, password });
          const ok =
            !expectedAuth ||
            (username === expectedAuth.username && password === expectedAuth.password);
          client.write(Buffer.from([0x01, ok ? 0x00 : 0x01]));
          if (!ok) {
            client.end();
            return;
          }
          stage = 'request';
        }

        if (stage === 'request') {
          if (buf.length < 5) return;
          const atyp = buf[3];
          let host = '';
          let portOffset = 0;
          if (atyp === 0x03) {
            const len = buf[4];
            if (buf.length < 5 + len + 2) return;
            host = buf.subarray(5, 5 + len).toString('utf8');
            portOffset = 5 + len;
          } else if (atyp === 0x01) {
            if (buf.length < 4 + 4 + 2) return;
            host = Array.from(buf.subarray(4, 8)).join('.');
            portOffset = 8;
          } else {
            client.end(Buffer.from([0x05, 0x08, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
            return;
          }
          const port = buf.readUInt16BE(portOffset);
          const rest = buf.subarray(portOffset + 2);
          buf = Buffer.alloc(0);
          destinations.push({ atyp, host, port });
          stage = 'tunnel';

          const upstream = net.connect(upstreamPort, '127.0.0.1', () => {
            sockets.add(upstream);
            client.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 127, 0, 0, 1, 0, 0]));
            if (rest.length > 0) upstream.write(rest);
            client.pipe(upstream);
            upstream.pipe(client);
          });
          upstream.on('error', () => client.destroy());
          client.on('error', () => upstream.destroy());
          client.on('close', () => {
            sockets.delete(client);
            sockets.delete(upstream);
            upstream.destroy();
          });
          upstream.on('close', () => client.destroy());
        }
      };

      client.on('data', (chunk) => {
        if (stage === 'tunnel') return;
        buf = Buffer.concat([buf, chunk]);
        processBuffer();
      });
      client.on('close', () => sockets.delete(client));
    })
  );

  return {
    port: getServerPort(server),
    destinations,
    authSeen,
    close: async () => {
      for (const s of sockets) s.destroy();
      await closeServer(server);
    }
  };
};

describe('sandbox HTTP request lifecycle', () => {
  const originalCheckInternalIp = process.env.CHECK_INTERNAL_IP;
  const originalProxyEnv = Object.fromEntries(
    proxyEnvKeys.map((key) => [key, process.env[key]])
  ) as Record<(typeof proxyEnvKeys)[number], string | undefined>;
  let originalCertificates: string[];

  beforeEach(() => {
    for (const key of proxyEnvKeys) {
      delete process.env[key];
    }
    originalCertificates = tls.getCACertificates('default');
    tls.setDefaultCACertificates([...originalCertificates, tlsFixture.cert]);
  });

  afterEach(() => {
    tls.setDefaultCACertificates(originalCertificates);
    vi.restoreAllMocks();
    if (originalCheckInternalIp === undefined) {
      delete process.env.CHECK_INTERNAL_IP;
    } else {
      process.env.CHECK_INTERNAL_IP = originalCheckInternalIp;
    }
    for (const key of proxyEnvKeys) {
      const value = originalProxyEnv[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('任务已结束时不再启动代理请求', async () => {
    const controller = new AbortController();
    const state = { requestCount: 0 };
    controller.abort();

    await expect(
      runSandboxHttpRequest({
        payload: { url: 'https://example.com' },
        limits: {
          maxRequests: 1,
          timeoutMs: 1000,
          maxResponseSize: 1024,
          maxRequestBodySize: 1024
        },
        state,
        signal: controller.signal
      })
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(state.requestCount).toBe(0);
  });

  it('命中 HTTP_PROXY 时通过 HTTP 转发代理出网，跳过本机 DNS，锁定 Host 且剥离用户伪造的 Proxy-Authorization', async () => {
    const targetHostname = 'proxy-only.example.test';
    vi.spyOn(dns, 'resolve4').mockRejectedValue(new Error('DNS unavailable'));
    vi.spyOn(dns, 'resolve6').mockRejectedValue(new Error('DNS unavailable'));
    const lookupSpy = vi.spyOn(dns, 'lookup');

    const proxyUrls: string[] = [];
    const proxyAuthHeaders: (string | undefined)[] = [];
    const proxyHostHeaders: (string | undefined)[] = [];
    const proxyBodies: string[] = [];

    const proxy = await startServer(
      http.createServer((req, res) => {
        proxyUrls.push(req.url ?? '');
        proxyAuthHeaders.push(req.headers['proxy-authorization']);
        proxyHostHeaders.push(req.headers.host);
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
          proxyBodies.push(Buffer.concat(chunks).toString('utf8'));
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        });
      })
    );

    process.env.HTTP_PROXY = `http://proxy-user:proxy-pass@127.0.0.1:${getServerPort(proxy)}`;

    try {
      const result = await runSandboxHttpRequest({
        payload: {
          url: `http://${targetHostname}:8080/echo`,
          method: 'POST',
          headers: {
            // 验证沙箱内恶意 Host 与 Proxy-Authorization 不会劫持转发目标或覆盖代理凭据。
            Host: '127.0.0.1:3000',
            'Proxy-Authorization': 'Basic ZmFrZQ=='
          },
          body: { hello: 'sandbox' }
        },
        limits: defaultLimits,
        state: { requestCount: 0 }
      });

      expect(result.status).toBe(200);
      expect(JSON.parse(result.data)).toEqual({ ok: true });
      expect(lookupSpy).not.toHaveBeenCalled();
      expect(proxyUrls).toEqual([`http://${targetHostname}:8080/echo`]);
      expect(proxyHostHeaders).toEqual([`${targetHostname}:8080`]);
      expect(proxyAuthHeaders).toEqual([
        `Basic ${Buffer.from('proxy-user:proxy-pass').toString('base64')}`
      ]);
      expect(proxyBodies).toEqual([JSON.stringify({ hello: 'sandbox' })]);
    } finally {
      await closeServer(proxy);
    }
  });

  it.each(['http', 'https'] as const)(
    '命中 %s 代理访问 HTTPS 目标时由代理侧解析域名，保持 SNI 与证书校验且不向目标泄露代理鉴权',
    async (scheme) => {
      const targetHostname = 'target.example.test';
      vi.spyOn(dns, 'resolve4').mockRejectedValue(new Error('DNS unavailable'));
      vi.spyOn(dns, 'resolve6').mockRejectedValue(new Error('DNS unavailable'));
      const lookupSpy = vi.spyOn(dns, 'lookup');

      const sniNames: string[] = [];
      const authorities: string[] = [];
      const proxyAuthHeaders: (string | undefined)[] = [];
      const targetAuthHeaders: (string | undefined)[] = [];
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
          (req, res) => {
            targetAuthHeaders.push(req.headers['proxy-authorization']);
            res.end(req.headers.host);
          }
        )
      );
      const targetPort = getServerPort(target);

      const proxy =
        scheme === 'https'
          ? await startServer(
              https.createServer(tlsFixture, (_req, res) => res.writeHead(405).end())
            )
          : await startServer(http.createServer((_req, res) => res.writeHead(405).end()));

      const tunnelSockets = new Set<Duplex>();
      proxy.on('connect', (req, client) => {
        authorities.push(req.url ?? '');
        proxyAuthHeaders.push(req.headers['proxy-authorization']);
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

      process.env.HTTPS_PROXY = `${scheme}://tls-user:tls-pass@127.0.0.1:${getServerPort(proxy)}`;

      try {
        const ok = await runSandboxHttpRequest({
          payload: { url: `https://${targetHostname}:${targetPort}/secure` },
          limits: defaultLimits,
          state: { requestCount: 0 }
        });
        expect(ok.status).toBe(200);
        expect(ok.data).toBe(`${targetHostname}:${targetPort}`);
        expect(targetAuthHeaders).toEqual([undefined]);

        await expect(
          runSandboxHttpRequest({
            payload: { url: `https://wrong.example.test:${targetPort}/secure` },
            limits: defaultLimits,
            state: { requestCount: 0 }
          })
        ).rejects.toMatchObject({ code: 'ERR_TLS_CERT_ALTNAME_INVALID' });

        expect(lookupSpy).not.toHaveBeenCalled();
        expect(authorities).toEqual([
          `${targetHostname}:${targetPort}`,
          `wrong.example.test:${targetPort}`
        ]);
        expect(proxyAuthHeaders).toEqual(
          Array(2).fill(`Basic ${Buffer.from('tls-user:tls-pass').toString('base64')}`)
        );
        expect(sniNames).toEqual([targetHostname, 'wrong.example.test']);
      } finally {
        for (const socket of tunnelSockets) socket.destroy();
        await Promise.all([closeServer(proxy), closeServer(target)]);
      }
    }
  );

  it.each(['socks5', 'socks5h'] as const)(
    '命中 %s 代理时委托代理侧解析域名（ATYP=0x03），跳过本机 DNS 并支持 HTTP 与 HTTPS',
    async (scheme) => {
      const targetHostname = 'target.example.test';
      vi.spyOn(dns, 'resolve4').mockRejectedValue(new Error('DNS unavailable'));
      vi.spyOn(dns, 'resolve6').mockRejectedValue(new Error('DNS unavailable'));
      const lookupSpy = vi.spyOn(dns, 'lookup');

      const httpTarget = await startServer(
        http.createServer((req, res) => res.end(`socks-http:${req.headers.host}:${req.url}`))
      );
      const httpsTarget = await startServer(
        https.createServer(tlsFixture, (req, res) =>
          res.end(`socks-https:${req.headers.host}:${req.url}`)
        )
      );

      const httpSocks = await createSocks5Proxy({
        upstreamPort: getServerPort(httpTarget),
        expectedAuth: { username: 'socks-user', password: 'socks-pass' }
      });
      const httpsSocks = await createSocks5Proxy({
        upstreamPort: getServerPort(httpsTarget)
      });

      try {
        process.env.ALL_PROXY = `${scheme}://socks-user:socks-pass@127.0.0.1:${httpSocks.port}`;
        const httpRes = await runSandboxHttpRequest({
          payload: { url: `http://${targetHostname}:8081/hello` },
          limits: defaultLimits,
          state: { requestCount: 0 }
        });
        expect(httpRes.status).toBe(200);
        expect(httpRes.data).toBe(`socks-http:${targetHostname}:8081:/hello`);
        expect(httpSocks.destinations).toEqual([{ atyp: 0x03, host: targetHostname, port: 8081 }]);
        expect(httpSocks.authSeen).toEqual([{ username: 'socks-user', password: 'socks-pass' }]);

        process.env.ALL_PROXY = `${scheme}://127.0.0.1:${httpsSocks.port}`;
        const httpsRes = await runSandboxHttpRequest({
          payload: { url: `https://${targetHostname}:8443/tls` },
          limits: defaultLimits,
          state: { requestCount: 0 }
        });
        expect(httpsRes.status).toBe(200);
        expect(httpsRes.data).toBe(`socks-https:${targetHostname}:8443:/tls`);
        expect(httpsSocks.destinations).toEqual([{ atyp: 0x03, host: targetHostname, port: 8443 }]);
        expect(lookupSpy).not.toHaveBeenCalled();
      } finally {
        await Promise.all([
          httpSocks.close(),
          httpsSocks.close(),
          closeServer(httpTarget),
          closeServer(httpsTarget)
        ]);
      }
    }
  );

  it('命中 NO_PROXY 时绕过代理直连并保留本机 DNS rebinding 复检', async () => {
    const carrierHost = getReachablePrivateHost();
    if (!carrierHost) return;

    process.env.CHECK_INTERNAL_IP = 'false';
    const proxyRequests: string[] = [];
    const target = await startServer(
      http.createServer((req, res) => res.end(`direct:${req.headers.host}`)),
      '0.0.0.0'
    );
    const targetPort = getServerPort(target);

    const proxy = await startServer(
      http.createServer((req, res) => {
        proxyRequests.push(req.url ?? '');
        res.writeHead(405).end();
      })
    );
    proxy.on('connect', (req, client) => {
      proxyRequests.push(req.url ?? '');
      client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    });

    process.env.HTTP_PROXY = `http://127.0.0.1:${getServerPort(proxy)}`;
    process.env.NO_PROXY = `${carrierHost},rebind.example.test`;

    try {
      const result = await runSandboxHttpRequest({
        payload: { url: `http://${carrierHost}:${targetPort}/direct` },
        limits: defaultLimits,
        state: { requestCount: 0 }
      });
      expect(result.status).toBe(200);
      expect(result.data).toBe(`direct:${carrierHost}:${targetPort}`);
      expect(proxyRequests).toEqual([]);

      // NO_PROXY 域名直连时若二次 lookup 变更为内网 IP，必须被拦截。
      process.env.CHECK_INTERNAL_IP = 'true';
      vi.spyOn(dns, 'resolve4').mockResolvedValue(['93.184.216.34']);
      vi.spyOn(dns, 'resolve6').mockResolvedValue([]);
      vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '10.0.0.5', family: 4 }] as never);

      await expect(
        runSandboxHttpRequest({
          payload: { url: 'http://rebind.example.test/direct' },
          limits: defaultLimits,
          state: { requestCount: 0 }
        })
      ).rejects.toThrow('Request to private network not allowed');
      expect(proxyRequests).toEqual([]);
    } finally {
      await Promise.all([closeServer(proxy), closeServer(target)]);
    }
  });

  it('配置代理时仍阻止私网与元数据地址，且非法或不支持的代理协议抛出不含凭据的 ServerConfigError', async () => {
    const proxyHits: string[] = [];
    const proxy = await startServer(
      http.createServer((req, res) => {
        proxyHits.push(req.url ?? '');
        res.writeHead(405).end();
      })
    );
    proxy.on('connect', (req, client) => {
      proxyHits.push(req.url ?? '');
      client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    });
    process.env.HTTP_PROXY = `http://127.0.0.1:${getServerPort(proxy)}`;

    try {
      await expect(
        runSandboxHttpRequest({
          payload: { url: 'http://127.0.0.1:8080/secret' },
          limits: defaultLimits,
          state: { requestCount: 0 }
        })
      ).rejects.toThrow('Request to private network not allowed');

      await expect(
        runSandboxHttpRequest({
          payload: { url: 'http://[::1]:8080/secret' },
          limits: defaultLimits,
          state: { requestCount: 0 }
        })
      ).rejects.toThrow('Request to private network not allowed');

      await expect(
        runSandboxHttpRequest({
          payload: { url: 'http://169.254.169.254/latest/meta-data/' },
          limits: defaultLimits,
          state: { requestCount: 0 }
        })
      ).rejects.toThrow('Request to private network not allowed');

      vi.spyOn(dns, 'resolve4').mockResolvedValue(['10.0.0.5']);
      vi.spyOn(dns, 'resolve6').mockResolvedValue([]);
      await expect(
        runSandboxHttpRequest({
          payload: { url: 'http://internal-dns.example.test/' },
          limits: defaultLimits,
          state: { requestCount: 0 }
        })
      ).rejects.toThrow('Request to private network not allowed');

      expect(proxyHits).toEqual([]);

      vi.spyOn(dns, 'resolve4').mockRejectedValue(new Error('DNS unavailable'));
      process.env.HTTP_PROXY = 'http://secret-user:secret-pass@[invalid-host';
      let invalidError: unknown;
      try {
        await runSandboxHttpRequest({
          payload: { url: 'http://target.example.test/' },
          limits: defaultLimits,
          state: { requestCount: 0 }
        });
      } catch (error) {
        invalidError = error;
      }
      expect(isServerConfigError(invalidError)).toBe(true);
      expect(JSON.stringify(invalidError)).not.toContain('secret-pass');
      expect((invalidError as Error).message).not.toContain('secret-pass');

      process.env.HTTP_PROXY = 'http://user%ZZ:percent-secret@127.0.0.1:8080';
      let malformedCredError: unknown;
      try {
        await runSandboxHttpRequest({
          payload: { url: 'http://target.example.test/' },
          limits: defaultLimits,
          state: { requestCount: 0 }
        });
      } catch (error) {
        malformedCredError = error;
      }
      expect(isServerConfigError(malformedCredError)).toBe(true);
      expect(JSON.stringify(malformedCredError)).not.toContain('percent-secret');
      expect((malformedCredError as Error).message).not.toContain('percent-secret');
      expect((malformedCredError as Error).message).not.toContain('%ZZ');

      delete process.env.HTTP_PROXY;
      process.env.ALL_PROXY = 'socks5://user:socks%2G-secret@127.0.0.1:1080';
      let malformedSocksCredError: unknown;
      try {
        await runSandboxHttpRequest({
          payload: { url: 'http://target.example.test/' },
          limits: defaultLimits,
          state: { requestCount: 0 }
        });
      } catch (error) {
        malformedSocksCredError = error;
      }
      expect(isServerConfigError(malformedSocksCredError)).toBe(true);
      expect(JSON.stringify(malformedSocksCredError)).not.toContain('socks%2G-secret');
      expect((malformedSocksCredError as Error).message).not.toContain('socks%2G-secret');

      process.env.ALL_PROXY = 'ftp://secret-user:secret-pass@127.0.0.1:21';
      let unsupportedError: unknown;
      try {
        await runSandboxHttpRequest({
          payload: { url: 'http://target.example.test/' },
          limits: defaultLimits,
          state: { requestCount: 0 }
        });
      } catch (error) {
        unsupportedError = error;
      }
      expect(isServerConfigError(unsupportedError)).toBe(true);
      expect((unsupportedError as Error).message).toContain('Unsupported outbound proxy protocol');
      expect((unsupportedError as Error).message).not.toContain('secret-pass');
    } finally {
      await closeServer(proxy);
    }
  });

  it.each(['timeout', 'abort'] as const)(
    '代理 CONNECT 握手阶段 %s 时中止请求并关闭代理连接',
    async (mode) => {
      vi.spyOn(dns, 'resolve4').mockRejectedValue(new Error('DNS unavailable'));
      vi.spyOn(dns, 'resolve6').mockRejectedValue(new Error('DNS unavailable'));

      const proxy = await startServer(http.createServer((_req, res) => res.writeHead(405).end()));
      process.env.HTTPS_PROXY = `http://127.0.0.1:${getServerPort(proxy)}`;
      let proxySocket: net.Socket | undefined;
      const socketClosed = Promise.withResolvers<void>();

      proxy.once('connect', (_req, socket) => {
        proxySocket = socket;
        socket.once('end', () => socket.end());
        socket.on('error', () => {});
        socket.once('close', () => socketClosed.resolve());
        socket.resume();
      });

      const connected = once(proxy, 'connect', { signal: AbortSignal.timeout(2000) });
      const controller = new AbortController();

      const pending = runSandboxHttpRequest({
        payload: {
          url: 'https://target.example.test/',
          timeoutMs: mode === 'timeout' ? 300 : 3000
        },
        limits: defaultLimits,
        state: { requestCount: 0 },
        signal: controller.signal
      }).then(
        () => ({ ok: true }),
        (error: unknown) => error
      );

      try {
        await connected;
        if (mode === 'abort') controller.abort();
        const error = await pending;
        if (mode === 'timeout') {
          expect(error).toBeInstanceOf(Error);
          expect((error as Error).message).toBe('Request timeout');
        } else {
          expect(error).toMatchObject({ name: 'AbortError' });
        }

        const closeDeadline = AbortSignal.timeout(2000);
        await Promise.race([
          socketClosed.promise,
          new Promise<never>((_resolve, reject) =>
            closeDeadline.addEventListener(
              'abort',
              () => reject(new Error('Proxy socket stayed open')),
              { once: true }
            )
          )
        ]);
      } finally {
        proxySocket?.destroy();
        await closeServer(proxy);
      }
    }
  );

  it('公网 IPv6 字面量经 HTTP 代理请求时保持合法 URI 且跳过 DNS lookup', async () => {
    const ipv6 = '2606:2800:220:1:248:1893:25c8:1946';
    const lookupSpy = vi.spyOn(dns, 'lookup');
    const seenUrls: string[] = [];
    const seenHosts: (string | undefined)[] = [];

    const proxy = await startServer(
      http.createServer((req, res) => {
        seenUrls.push(req.url ?? '');
        seenHosts.push(req.headers.host);
        res.end('ipv6-ok');
      })
    );

    process.env.HTTP_PROXY = `http://127.0.0.1:${getServerPort(proxy)}`;

    try {
      const res = await runSandboxHttpRequest({
        payload: { url: `http://[${ipv6}]:8080/v6` },
        limits: defaultLimits,
        state: { requestCount: 0 }
      });
      expect(res.status).toBe(200);
      expect(res.data).toBe('ipv6-ok');
      expect(lookupSpy).not.toHaveBeenCalled();
      expect(seenUrls).toEqual([`http://[${ipv6}]:8080/v6`]);
      expect(seenHosts).toEqual([`[${ipv6}]:8080`]);
    } finally {
      await closeServer(proxy);
    }
  });

  it('HTTP 转发代理对 // 与 /\\ 开头路径仍锁定预检目标 authority', async () => {
    vi.spyOn(dns, 'resolve4').mockRejectedValue(new Error('DNS unavailable'));
    vi.spyOn(dns, 'resolve6').mockRejectedValue(new Error('DNS unavailable'));

    const seenUrls: string[] = [];
    const seenHosts: (string | undefined)[] = [];
    const proxy = await startServer(
      http.createServer((req, res) => {
        seenUrls.push(req.url ?? '');
        seenHosts.push(req.headers.host);
        res.end(`forwarded:${req.url}`);
      })
    );

    process.env.HTTP_PROXY = `http://127.0.0.1:${getServerPort(proxy)}`;

    try {
      const doubleSlashUrl = 'http://target.example.test//127.0.0.1:8080/secret';
      const res1 = await runSandboxHttpRequest({
        payload: { url: doubleSlashUrl },
        limits: defaultLimits,
        state: { requestCount: 0 }
      });
      expect(res1.status).toBe(200);
      expect(res1.data).toBe(`forwarded:${doubleSlashUrl}`);

      const res2 = await runSandboxHttpRequest({
        payload: { url: 'http://target.example.test/\\127.0.0.1:8080/secret' },
        limits: defaultLimits,
        state: { requestCount: 0 }
      });
      expect(res2.status).toBe(200);
      expect(res2.data).toBe(`forwarded:${doubleSlashUrl}`);

      expect(seenUrls).toEqual([doubleSlashUrl, doubleSlashUrl]);
      expect(seenHosts).toEqual(['target.example.test', 'target.example.test']);
    } finally {
      await closeServer(proxy);
    }
  });

  it.each(['timeout', 'abort'] as const)(
    'SOCKS5 握手阶段 %s 时立即中止请求并关闭代理连接',
    async (mode) => {
      vi.spyOn(dns, 'resolve4').mockRejectedValue(new Error('DNS unavailable'));
      vi.spyOn(dns, 'resolve6').mockRejectedValue(new Error('DNS unavailable'));

      let proxySocket: net.Socket | undefined;
      const socketClosed = Promise.withResolvers<void>();
      const proxy = await startServer(
        net.createServer((socket) => {
          proxySocket = socket;
          socket.on('error', () => {});
          socket.once('close', () => socketClosed.resolve());
          // 刻意不响应 SOCKS5 握手，模拟代理握手卡死。
          socket.resume();
        })
      );
      process.env.ALL_PROXY = `socks5://127.0.0.1:${getServerPort(proxy)}`;

      const connected = once(proxy, 'connection', { signal: AbortSignal.timeout(2000) });
      const controller = new AbortController();
      const startedAt = Date.now();

      const pending = runSandboxHttpRequest({
        payload: {
          url: 'http://target.example.test/socks-hang',
          timeoutMs: mode === 'timeout' ? 300 : 5000
        },
        limits: defaultLimits,
        state: { requestCount: 0 },
        signal: controller.signal
      }).then(
        () => ({ ok: true }),
        (error: unknown) => error
      );

      try {
        await connected;
        if (mode === 'abort') controller.abort();
        const error = await pending;
        const elapsedMs = Date.now() - startedAt;

        if (mode === 'timeout') {
          expect(error).toBeInstanceOf(Error);
          expect((error as Error).message).toBe('Request timeout');
        } else {
          expect(error).toMatchObject({ name: 'AbortError' });
          expect(elapsedMs).toBeLessThan(2000);
        }

        const closeDeadline = AbortSignal.timeout(2000);
        await Promise.race([
          socketClosed.promise,
          new Promise<never>((_resolve, reject) =>
            closeDeadline.addEventListener(
              'abort',
              () => reject(new Error('SOCKS5 proxy socket stayed open')),
              { once: true }
            )
          )
        ]);
      } finally {
        proxySocket?.destroy();
        await closeServer(proxy);
      }
    }
  );

  it('域名形式的 https:// 代理转发明文 HTTP 请求时应携带代理域名 SNI', async () => {
    vi.spyOn(dns, 'resolve4').mockRejectedValue(new Error('DNS unavailable'));
    vi.spyOn(dns, 'resolve6').mockRejectedValue(new Error('DNS unavailable'));

    const origLookup = dnsCallback.lookup;
    vi.spyOn(dnsCallback, 'lookup').mockImplementation(((
      hostname: string,
      optionsOrCb: any,
      maybeCb?: any
    ) => {
      const options = typeof optionsOrCb === 'function' ? {} : optionsOrCb || {};
      const cb = typeof optionsOrCb === 'function' ? optionsOrCb : maybeCb;
      if (hostname === 'target.example.test') {
        if (options.all) {
          cb(null, [{ address: '127.0.0.1', family: 4 }]);
          return;
        }
        cb(null, '127.0.0.1', 4);
        return;
      }
      return (origLookup as any)(hostname, optionsOrCb, maybeCb);
    }) as any);

    const sniNames: string[] = [];
    const seenUrls: string[] = [];
    const httpsProxy = await startServer(
      https.createServer(
        {
          ...tlsFixture,
          SNICallback: (servername, cb) => {
            sniNames.push(servername);
            cb(null, tls.createSecureContext(tlsFixture));
          }
        },
        (req, res) => {
          seenUrls.push(req.url ?? '');
          res.end(`https-proxy-plain:${req.url}`);
        }
      )
    );

    process.env.HTTP_PROXY = `https://target.example.test:${getServerPort(httpsProxy)}`;

    try {
      const res = await runSandboxHttpRequest({
        payload: { url: 'http://plain.example.test/hello' },
        limits: defaultLimits,
        state: { requestCount: 0 }
      });

      expect(res.status).toBe(200);
      expect(res.data).toBe('https-proxy-plain:http://plain.example.test/hello');
      expect(seenUrls).toEqual(['http://plain.example.test/hello']);
      expect(sniNames).toEqual(['target.example.test']);
    } finally {
      await closeServer(httpsProxy);
    }
  });
});
