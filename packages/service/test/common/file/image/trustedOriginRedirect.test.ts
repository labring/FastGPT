import http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const { getImageBuffer } = await import('@fastgpt/service/common/file/image/utils');

// 与 common/api/axios.test.ts 的 redirect 用例保持同一套写法：
// 真实 http.createServer + listen(0)，验证可信 origin 通道不跟随跨 origin 3xx。
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

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

let trustedServer: http.Server;
let otherServer: http.Server;
let trustedBaseUrl = '';
let otherHits = 0;

beforeAll(async () => {
  otherServer = await listen((_req, res) => {
    otherHits += 1;
    res.writeHead(200, { 'content-type': 'image/png' });
    res.end(PNG);
  });
  const otherBaseUrl = `http://127.0.0.1:${getServerPort(otherServer)}`;

  trustedServer = await listen((req, res) => {
    // 预览代理/网关把请求跳到另一个 origin（这里用不同端口模拟）。
    if (req.url?.startsWith('/preview/redirect')) {
      res.writeHead(302, { location: `${otherBaseUrl}/evil.png` });
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': 'image/png' });
    res.end(PNG);
  });
  trustedBaseUrl = `http://127.0.0.1:${getServerPort(trustedServer)}`;
});

afterAll(async () => {
  await Promise.all([closeServer(trustedServer), closeServer(otherServer)]);
});

describe('trusted origin image download', () => {
  it('应该下载配置 origin 上的图片', async () => {
    const result = await getImageBuffer(`${trustedBaseUrl}/preview/a.png`, {
      trustedOrigin: trustedBaseUrl
    });

    expect(result.mime).toBe('image/png');
    expect(result.buffer.length).toBe(PNG.length);
  });

  it('不应该跟随可信通道上的跨 origin 重定向', async () => {
    const otherHitsBefore = otherHits;

    // 302 直接作为错误返回（不跟随 + 非 2xx 拒绝），不会去请求跳转目标。
    await expect(
      getImageBuffer(`${trustedBaseUrl}/preview/redirect.png`, {
        trustedOrigin: trustedBaseUrl
      })
    ).rejects.toThrow(/status code 302/);

    // 关键：跳转目标一次都不能被请求，否则等于绕过内网校验。
    expect(otherHits).toBe(otherHitsBefore);
  });
});
