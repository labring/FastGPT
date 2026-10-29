import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { PRIVATE_URL_TEXT } from '@fastgpt/service/common/system/utils';
import {
  installSafeLegacyFetchShim,
  runWithSafeLegacyFetch,
  safeLegacyFetch
} from '@fastgpt/service/common/api/safeFetch';
import { afterEach, describe, expect, it } from 'vitest';

/** 运行时 SSRF 防护：建连阶段拒绝回环/内网地址，并只作用于自定义端点作用域。 */
describe('safeLegacyFetch', () => {
  let server: http.Server | undefined;

  const startServer = async () => {
    server = http.createServer((_req, res) => res.end('ok'));
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    return `http://127.0.0.1:${port}/v1/models`;
  };

  afterEach(async () => {
    if (!server) return;
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  });

  it('rejects loopback addresses at connect time', async () => {
    const url = await startServer();

    await expect(safeLegacyFetch(url)).rejects.toThrow(PRIVATE_URL_TEXT);
  });

  it('only intercepts requests inside the matching endpoint scope', async () => {
    installSafeLegacyFetchShim();
    const url = await startServer();

    // 作用域外保持原 fetch：本地服务可访问。
    await expect(fetch(url)).resolves.toBeDefined();

    // 作用域内走安全传输，回环地址被拒绝。
    await expect(runWithSafeLegacyFetch(url, () => fetch(url))).rejects.toThrow(PRIVATE_URL_TEXT);
  });
});
