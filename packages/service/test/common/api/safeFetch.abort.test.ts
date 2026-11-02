import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

vi.mock('@fastgpt/global/common/system/network', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/global/common/system/network')>();

  return {
    ...actual,
    createInternalAddressChecker: (
      options: Parameters<typeof actual.createInternalAddressChecker>[0]
    ) => ({
      ...actual.createInternalAddressChecker(options),
      // 用受控延迟模拟慢 DNS，验证 abort 能否打断预检等待。
      isInternalAddress: async () => {
        await delay(300);
        return false;
      },
      // 测试服务器在回环地址，跳过建连期 IP 校验以便走到重定向第二跳。
      isInternalResolvedIP: () => false
    })
  };
});

/** 自定义端点预检不应拖过调用方（OpenAI SDK timeout）的 abort 截止时间。 */
describe('safeLegacyFetch abort', () => {
  const servers: http.Server[] = [];

  const loadSafeFetch = async () => {
    vi.resetModules();
    return import('@fastgpt/service/common/api/safeFetch');
  };

  const startServer = async (handler: http.RequestListener) => {
    const server = http.createServer(handler);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
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

  it('aborts while the DNS precheck is pending', async () => {
    const { safeLegacyFetch } = await loadSafeFetch();
    const controller = new AbortController();
    const start = performance.now();
    setTimeout(() => controller.abort(), 20);

    await expect(
      safeLegacyFetch('http://slow-dns.example.com/v1', { signal: controller.signal })
    ).rejects.toMatchObject({ name: 'AbortError' });

    expect(performance.now() - start).toBeLessThan(150);
  });

  it('applies the same deadline to redirect prechecks', async () => {
    const server = await startServer((req, res) => {
      if (req.url === '/redirect') {
        res.writeHead(307, { Location: '/final' });
        res.end();
        return;
      }
      res.end('final');
    });
    const { port } = server.address() as AddressInfo;

    const { safeLegacyFetch } = await loadSafeFetch();
    const controller = new AbortController();
    const start = performance.now();
    // 首跳预检约 300ms；第二跳预检从约 300ms 开始，350ms 时取消。
    setTimeout(() => controller.abort(), 350);

    await expect(
      safeLegacyFetch(`http://127.0.0.1:${port}/redirect`, { signal: controller.signal })
    ).rejects.toMatchObject({ name: 'AbortError' });

    expect(performance.now() - start).toBeLessThan(450);
  });
});
