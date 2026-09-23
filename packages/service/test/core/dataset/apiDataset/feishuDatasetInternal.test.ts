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
 * FEISHU_BASE_URL 由部署方配置，私有化飞书会改为内网域名。
 * 打开 CHECK_INTERNAL_IP 后，飞书知识库仍然必须可达，否则同步整体失败。
 * 该用例同时覆盖租户令牌请求与文档列表请求两条链路。
 */
describe('useFeishuDatasetRequest 访问内网飞书服务', () => {
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

  it('CHECK_INTERNAL_IP=true 时仍然访问私网飞书服务', async () => {
    proxyEnvKeys.forEach((key) => delete process.env[key]);

    // 取一个非 loopback 的本机地址：loopback/metadata 在开关关闭时也会被拦截，无法验证私网放行行为。
    const privateHost = Object.values(os.networkInterfaces())
      .flatMap((items) => items ?? [])
      .find((item) => item.family === 'IPv4' && !item.internal)?.address;
    if (!privateHost) return;

    const requestedPaths: string[] = [];
    const server = http.createServer((req, res) => {
      requestedPaths.push((req.url ?? '').split('?')[0]);
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify(
          req.url?.includes('/tenant_access_token/')
            ? { code: 0, tenant_access_token: 'tenant-token' }
            : {
                data: {
                  files: [
                    {
                      token: 'file-token',
                      parent_token: 'folder-token',
                      name: 'doc',
                      type: 'docx',
                      modified_time: 1700000000,
                      created_time: 1700000000,
                      url: 'https://example.com',
                      owner_id: 'owner'
                    }
                  ],
                  has_more: false,
                  next_page_token: ''
                }
              }
        )
      );
    });
    await new Promise<void>((resolve) => server.listen(0, '0.0.0.0', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Invalid test server address');
    }

    try {
      // serviceEnv 在模块加载时解析 process.env，必须先 stub 再导入，无法使用静态 import。
      vi.stubEnv('FEISHU_BASE_URL', `http://${privateHost}:${address.port}`);
      vi.stubEnv('CHECK_INTERNAL_IP', 'true');
      vi.resetModules();
      const { useFeishuDatasetRequest } =
        await import('@fastgpt/service/core/dataset/apiDataset/feishuDataset/api');

      const files = await useFeishuDatasetRequest({
        feishuServer: { appId: 'app-id', appSecret: 'app-secret', folderToken: 'folder-token' }
      }).listFiles({});

      expect(requestedPaths).toEqual([
        '/open-apis/auth/v3/tenant_access_token/internal',
        '/open-apis/drive/v1/files'
      ]);
      expect(files).toHaveLength(1);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      );
    }
  });
});
