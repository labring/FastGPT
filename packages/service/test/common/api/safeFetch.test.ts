import http from 'node:http';
import os from 'node:os';
import type { AddressInfo } from 'node:net';
import { PRIVATE_URL_TEXT } from '@fastgpt/service/common/system/utils';
import {
  installSafeLegacyFetchShim,
  runWithSafeLegacyFetch,
  safeLegacyFetch
} from '@fastgpt/service/common/api/safeFetch';
import { afterEach, describe, expect, it } from 'vitest';

const lanAddress = Object.values(os.networkInterfaces())
  .flat()
  .find((item) => item?.family === 'IPv4' && !item.internal)?.address;

describe('safeLegacyFetch', () => {
  const servers: http.Server[] = [];

  const startHttpServer = async (handler: http.RequestListener, host = '127.0.0.1') => {
    const server = http.createServer(handler);
    await new Promise<void>((resolve) => server.listen(0, host, resolve));
    servers.push(server);
    return server;
  };

  afterEach(async () => {
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

  it('rejects loopback addresses and only intercepts inside the matching endpoint scope', async () => {
    installSafeLegacyFetchShim();
    const server = await startHttpServer((_req, res) => res.end('ok'));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/models`;

    await expect(safeLegacyFetch(url)).rejects.toThrow(PRIVATE_URL_TEXT);
    await expect(fetch(url)).resolves.toBeDefined();
    await expect(runWithSafeLegacyFetch(url, () => fetch(url))).rejects.toThrow(PRIVATE_URL_TEXT);
  });

  it.skipIf(!lanAddress)(
    'follows safe redirects and rejects redirects to loopback or metadata addresses',
    async () => {
      let port = 0;
      const server = await startHttpServer((req, res) => {
        if (req.url === '/redirect-ok') {
          res.writeHead(307, { Location: `http://${lanAddress}:${port}/final` });
          res.end();
          return;
        }
        if (req.url === '/redirect-loopback') {
          res.writeHead(307, { Location: `http://127.0.0.1:${port}/secret` });
          res.end();
          return;
        }
        if (req.url === '/redirect-metadata') {
          res.writeHead(307, { Location: 'http://169.254.169.254/latest/meta-data' });
          res.end();
          return;
        }
        res.end('final');
      }, '0.0.0.0');
      port = (server.address() as AddressInfo).port;

      const okRes = await safeLegacyFetch(`http://${lanAddress}:${port}/redirect-ok`);
      await expect(okRes.text()).resolves.toBe('final');

      await expect(
        safeLegacyFetch(`http://${lanAddress}:${port}/redirect-loopback`)
      ).rejects.toThrow(PRIVATE_URL_TEXT);
      await expect(
        safeLegacyFetch(`http://${lanAddress}:${port}/redirect-metadata`)
      ).rejects.toThrow(PRIVATE_URL_TEXT);
    }
  );
});
