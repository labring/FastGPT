import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// 真实 HTTP 服务，不走 mock：验证可信 origin 通道不会跟随跨 origin 3xx。
const { getImageBuffer } = await import('@fastgpt/service/common/file/image/utils');

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

const listen = (handler: http.RequestListener) =>
  new Promise<http.Server>((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });

const getPort = (server: http.Server) => (server.address() as AddressInfo).port;

let trustedServer: http.Server;
let otherServer: http.Server;
let trustedPort = 0;
let otherPort = 0;
const hits = { trusted: 0, other: 0 };

beforeAll(async () => {
  otherServer = await listen((_req, res) => {
    hits.other += 1;
    res.writeHead(200, { 'content-type': 'image/png' });
    res.end(PNG);
  });
  otherPort = getPort(otherServer);

  trustedServer = await listen((req, res) => {
    hits.trusted += 1;
    if (req.url?.startsWith('/preview/redirect')) {
      // 预览代理/网关把请求跳到另一个 origin（这里用不同端口模拟）。
      res.writeHead(302, { location: `http://127.0.0.1:${otherPort}/evil.png` });
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': 'image/png' });
    res.end(PNG);
  });
  trustedPort = getPort(trustedServer);
});

afterAll(async () => {
  await Promise.all([
    new Promise((resolve) => trustedServer.close(resolve)),
    new Promise((resolve) => otherServer.close(resolve))
  ]);
});

describe('trusted origin image download', () => {
  it('downloads a direct image from the configured origin', async () => {
    const result = await getImageBuffer(`http://127.0.0.1:${trustedPort}/preview/a.png`, {
      trustedOrigin: `http://127.0.0.1:${trustedPort}`
    });

    expect(result.mime).toBe('image/png');
    expect(result.buffer.length).toBe(PNG.length);
  });

  it('does not follow a cross-origin redirect on the trusted channel', async () => {
    const otherHitsBefore = hits.other;

    // 302 直接作为错误返回（axios 不跟随、validateStatus 拒绝），不会去请求跳转目标。
    await expect(
      getImageBuffer(`http://127.0.0.1:${trustedPort}/preview/redirect.png`, {
        trustedOrigin: `http://127.0.0.1:${trustedPort}`
      })
    ).rejects.toThrow(/status code 302/);

    // 关键：跳转目标一次都不能被请求，否则等于绕过内网校验。
    expect(hits.other).toBe(otherHitsBefore);
  });
});
