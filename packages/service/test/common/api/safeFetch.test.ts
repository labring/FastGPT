import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import type { AddressInfo } from 'node:net';
import { PRIVATE_URL_TEXT } from '@fastgpt/service/common/system/utils';
import {
  installSafeLegacyFetchShim,
  runWithSafeLegacyFetch,
  safeLegacyFetch
} from '@fastgpt/service/common/api/safeFetch';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const PROXY_ENV_KEYS = [
  'HTTP_PROXY',
  'http_proxy',
  'HTTPS_PROXY',
  'https_proxy',
  'NO_PROXY',
  'no_proxy'
] as const;

const getLanIPv4 = () =>
  Object.values(os.networkInterfaces())
    .flat()
    .find((item) => item?.family === 'IPv4' && !item.internal)?.address;

const lanAddress = getLanIPv4();

/** 运行时 SSRF 防护：逐跳校验 URL、建连阶段拒绝回环/内网地址，并保留代理语义。 */
describe('safeLegacyFetch', () => {
  const servers: http.Server[] = [];
  const proxySockets = new Set<net.Socket>();
  const savedProxyEnv: Record<string, string | undefined> = {};

  const startHttpServer = async (handler: http.RequestListener, host = '127.0.0.1') => {
    const server = http.createServer(handler);
    await new Promise<void>((resolve) => server.listen(0, host, resolve));
    servers.push(server);
    return server;
  };

  const startLoopbackServer = async () => {
    const server = await startHttpServer((_req, res) => res.end('ok'));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/models`;
  };

  const trackProxySocket = (socket: net.Socket) => {
    proxySockets.add(socket);
    socket.on('close', () => proxySockets.delete(socket));
  };

  beforeEach(() => {
    for (const key of PROXY_ENV_KEYS) {
      savedProxyEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(async () => {
    for (const key of PROXY_ENV_KEYS) {
      const value = savedProxyEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }

    for (const socket of proxySockets) socket.destroy();
    proxySockets.clear();

    await Promise.all(
      servers.splice(0).map(
        (server) =>
          new Promise<void>((resolve) => {
            server.closeAllConnections();
            server.close(() => resolve());
          })
      )
    );
  });

  it('rejects loopback addresses at connect time', async () => {
    const url = await startLoopbackServer();

    await expect(safeLegacyFetch(url)).rejects.toThrow(PRIVATE_URL_TEXT);
  });

  it('only intercepts requests inside the matching endpoint scope', async () => {
    installSafeLegacyFetchShim();
    const url = await startLoopbackServer();

    // 作用域外保持原 fetch：本地服务可访问。
    await expect(fetch(url)).resolves.toBeDefined();

    // 作用域内走安全传输，回环地址被拒绝。
    await expect(runWithSafeLegacyFetch(url, () => fetch(url))).rejects.toThrow(PRIVATE_URL_TEXT);
  });

  it.skipIf(!lanAddress)('follows safe redirects on the same origin', async () => {
    let port = 0;
    const server = await startHttpServer((req, res) => {
      if (req.url === '/redirect') {
        res.writeHead(307, { Location: `http://${lanAddress}:${port}/final` });
        res.end();
        return;
      }
      res.end('final');
    }, '0.0.0.0');
    port = (server.address() as AddressInfo).port;

    const response = await safeLegacyFetch(`http://${lanAddress}:${port}/redirect`);

    await expect(response.text()).resolves.toBe('final');
  });

  it.skipIf(!lanAddress)('rejects redirects to loopback addresses', async () => {
    let port = 0;
    const server = await startHttpServer((req, res) => {
      if (req.url === '/redirect') {
        res.writeHead(307, { Location: `http://127.0.0.1:${port}/secret` });
        res.end();
        return;
      }
      res.end('secret');
    }, '0.0.0.0');
    port = (server.address() as AddressInfo).port;

    await expect(safeLegacyFetch(`http://${lanAddress}:${port}/redirect`)).rejects.toThrow(
      PRIVATE_URL_TEXT
    );
  });

  it.skipIf(!lanAddress)('rejects redirects to cloud metadata addresses', async () => {
    let port = 0;
    const server = await startHttpServer((req, res) => {
      if (req.url === '/redirect') {
        res.writeHead(307, { Location: 'http://169.254.169.254/latest/meta-data' });
        res.end();
        return;
      }
      res.end('secret');
    }, '0.0.0.0');
    port = (server.address() as AddressInfo).port;

    await expect(safeLegacyFetch(`http://${lanAddress}:${port}/redirect`)).rejects.toThrow(
      PRIVATE_URL_TEXT
    );
  });

  it.skipIf(!lanAddress)('rejects malformed redirect locations', async () => {
    let port = 0;
    const server = await startHttpServer((req, res) => {
      if (req.url === '/redirect') {
        res.writeHead(307, { Location: 'http://[invalid' });
        res.end('redirect-body');
        return;
      }
      res.end('secret');
    }, '0.0.0.0');
    port = (server.address() as AddressInfo).port;

    await expect(safeLegacyFetch(`http://${lanAddress}:${port}/redirect`)).rejects.toThrow();
  });

  it.skipIf(!lanAddress)('honors HTTP_PROXY for custom endpoints', async () => {
    const target = await startHttpServer((_req, res) => res.end('target'), '0.0.0.0');
    const targetUrl = `http://${lanAddress}:${(target.address() as AddressInfo).port}/`;

    let proxyHits = 0;
    const proxy = http.createServer((_req, res) => res.end('http-proxy'));
    proxy.on('connect', (req, clientSocket, head) => {
      proxyHits++;
      trackProxySocket(clientSocket);

      const [host, port] = (req.url ?? '').split(':');
      const targetSocket = net.connect(Number(port), host, () => {
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        targetSocket.write(head);
        targetSocket.pipe(clientSocket);
        clientSocket.pipe(targetSocket);
      });
      trackProxySocket(targetSocket);
      targetSocket.on('error', () => clientSocket.destroy());
    });
    await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
    servers.push(proxy);

    process.env.HTTP_PROXY = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;

    const response = await safeLegacyFetch(targetUrl);

    await expect(response.text()).resolves.toBe('target');
    expect(proxyHits).toBe(1);
  });
});
