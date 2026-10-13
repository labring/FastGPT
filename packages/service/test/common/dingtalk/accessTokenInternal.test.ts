import http from 'http';
import os from 'os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LEAF_ABSENT_SNAPSHOT } from '@test/utils/instanceConfigSnapshot';

// 94ae033d7 起 accessToken 改为 `getSystemInstanceConfig().providers.dataSource.dingtalkBaseUrl || serviceEnv.DINGTALK_BASE_URL`，
// 真实快照的 providers.dataSource.dingtalkBaseUrl 已被 schema 默认值填满（'https://api.dingtalk.com'），`|| serviceEnv` 兜底不触发；
// 本文件通过 vi.stubEnv + vi.resetModules 改写 serviceEnv 来指向本机私网代理，
// 因此预置一个"域对象存在、叶子字段全部缺省"的种子快照，让 getSystemInstanceConfig 首次调用时采纳它，
// 从而走回 `|| serviceEnv` 兜底分支，保持"env 驱动"的测试意图。
// 注意：getSystemInstanceConfig 只在模块首次调用时读 global.systemInstanceConfig，
// vi.resetModules 会重置 controller 模块缓存，因此每次动态 import 都会重新采纳该种子。
(global as any).systemInstanceConfig = LEAF_ABSENT_SNAPSHOT();

const { mockGetOrRefresh } = vi.hoisted(() => ({ mockGetOrRefresh: vi.fn() }));

// 只替换 Redis 令牌缓存，保留真实 axios，才能验证出站策略。
vi.mock('@fastgpt/dal/redis/caches', () => ({
  DingtalkAccessTokenCache: class {
    getOrRefresh = mockGetOrRefresh;
  }
}));

const proxyEnvKeys = [
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'http_proxy',
  'https_proxy'
] as const;

/**
 * DINGTALK_BASE_URL 由部署方配置，可能指向内网代理。
 * 打开 CHECK_INTERNAL_IP 后，钉钉鉴权仍然必须可达，否则所有钉钉能力不可用。
 */
describe('getDingtalkAppAccessToken 访问内网钉钉代理', () => {
  const originalProxyEnv = proxyEnvKeys.map((key) => process.env[key]);
  const originalBaseUrl = process.env.DINGTALK_BASE_URL;
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
    vi.stubEnv('DINGTALK_BASE_URL', originalBaseUrl ?? '');
    vi.stubEnv('CHECK_INTERNAL_IP', originalCheckInternalIp ?? '');
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('CHECK_INTERNAL_IP=true 时仍然访问私网钉钉代理', async () => {
    proxyEnvKeys.forEach((key) => delete process.env[key]);
    mockGetOrRefresh.mockImplementation(async ({ fetchToken }) => {
      const { accessToken } = await fetchToken();
      return accessToken;
    });

    // 取一个非 loopback 的本机地址：loopback/metadata 在开关关闭时也会被拦截，无法验证私网放行行为。
    const privateHost = Object.values(os.networkInterfaces())
      .flatMap((items) => items ?? [])
      .find((item) => item.family === 'IPv4' && !item.internal)?.address;
    if (!privateHost) return;

    const requestedPaths: string[] = [];
    const server = http.createServer((req, res) => {
      requestedPaths.push(req.url ?? '');
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ accessToken: 'private-token', expireIn: 7200 }));
    });
    await new Promise<void>((resolve) => server.listen(0, '0.0.0.0', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Invalid test server address');
    }

    try {
      // serviceEnv 在模块加载时解析 process.env，必须先 stub 再导入，无法使用静态 import。
      vi.stubEnv('DINGTALK_BASE_URL', `http://${privateHost}:${address.port}`);
      vi.stubEnv('CHECK_INTERNAL_IP', 'true');
      vi.resetModules();
      const { getDingtalkAppAccessToken } =
        await import('@fastgpt/service/common/dingtalk/accessToken');

      await expect(
        getDingtalkAppAccessToken({ appKey: 'test-key', appSecret: 'test-secret' })
      ).resolves.toBe('private-token');
      expect(requestedPaths).toEqual(['/v1.0/oauth2/accessToken']);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      );
    }
  });
});
