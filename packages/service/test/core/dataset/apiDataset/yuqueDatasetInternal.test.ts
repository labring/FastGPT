import http from 'http';
import os from 'os';
import { afterEach, describe, expect, it, vi } from 'vitest';

const proxyEnvKeys = [
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'http_proxy',
  'https_proxy'
] as const;

/**
 * YUQUE_DATASET_BASE_URL 由部署方配置，可能指向内网代理。
 * 打开 CHECK_INTERNAL_IP 后，API 数据集仍然必须可达，否则知识库同步整体失败。
 */
describe('useYuqueDatasetRequest 访问内网 API 数据集服务', () => {
  const originalProxyEnv = proxyEnvKeys.map((key) => process.env[key]);
  const originalCheckInternalIp = process.env.CHECK_INTERNAL_IP;

  afterEach(() => {
    proxyEnvKeys.forEach((key, index) => {
      const value = originalProxyEnv[index];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });
    vi.stubEnv('CHECK_INTERNAL_IP', originalCheckInternalIp ?? '');
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('CHECK_INTERNAL_IP=true 时仍然访问私网 API 数据集服务', async () => {
    proxyEnvKeys.forEach((key) => delete process.env[key]);

    // 取一个非 loopback 的本机地址：loopback/metadata 在开关关闭时也会被拦截，无法验证私网放行行为。
    const privateHost = Object.values(os.networkInterfaces())
      .flatMap((items) => items ?? [])
      .find((item) => item.family === 'IPv4' && !item.internal)?.address;
    if (!privateHost) return;

    const requestedPaths: string[] = [];
    const server = http.createServer((req, res) => {
      requestedPaths.push(req.url ?? '');
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ data: [{ id: 1, name: 'repo', slug: 'repo' }] }));
    });
    await new Promise<void>((resolve) => server.listen(0, '0.0.0.0', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Invalid test server address');
    }

    try {
      // serviceEnv 在模块加载时解析 process.env，必须先 stub 再导入，无法使用静态 import。
      vi.stubEnv('YUQUE_DATASET_BASE_URL', `http://${privateHost}:${address.port}`);
      vi.stubEnv('CHECK_INTERNAL_IP', 'true');
      vi.resetModules();
      const { useYuqueDatasetRequest: useRequest } =
        await import('@fastgpt/service/core/dataset/apiDataset/yuqueDataset/api');

      const files = await useRequest({ yuqueServer: { userId: '1', token: 'token' } }).listFiles(
        {}
      );

      expect(requestedPaths).toEqual(['/api/v2/groups/1/repos?offset=0&limit=100']);
      expect(files).toHaveLength(1);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      );
    }
  });
});
