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

  it.for([
    {
      name: '私网成功请求',
      tokenStatus: 200,
      tokenBody: { code: 0, tenant_access_token: 'tenant-token' },
      listStatus: 200,
      listBody: undefined,
      message: undefined
    },
    {
      name: 'Token HTTP200 业务失败',
      tokenStatus: 200,
      tokenBody: { code: 10003, msg: 'app secret invalid' },
      listStatus: 200,
      listBody: undefined,
      message: 'app secret invalid'
    },
    {
      name: 'Token HTTP400 错误正文',
      tokenStatus: 400,
      tokenBody: { msg: 'invalid app credentials' },
      listStatus: 200,
      listBody: undefined,
      message: 'invalid app credentials'
    },
    {
      name: '列表 HTTP403 具体权限',
      tokenStatus: 200,
      tokenBody: { code: 0, tenant_access_token: 'tenant-token' },
      listStatus: 403,
      listBody: { msg: 'drive scope missing' },
      message: 'drive scope missing'
    },
    {
      name: '列表 HTTP429 具体限流原因',
      tokenStatus: 200,
      tokenBody: { code: 0, tenant_access_token: 'tenant-token' },
      listStatus: 429,
      listBody: { message: 'tenant request quota exhausted' },
      message: 'tenant request quota exhausted'
    },
    {
      name: '列表 HTTP200 业务失败',
      tokenStatus: 200,
      tokenBody: { code: 0, tenant_access_token: 'tenant-token' },
      listStatus: 200,
      listBody: { code: 1069701, msg: 'tenant token expired' },
      message: 'tenant token expired'
    }
  ])(
    '$name：真实传输与 JSON 错误返回',
    async ({ tokenStatus, tokenBody, listStatus, listBody, message }, { skip }) => {
      proxyEnvKeys.forEach((key) => delete process.env[key]);

      // 取一个非 loopback 的本机地址：loopback/metadata 在开关关闭时也会被拦截，无法验证私网放行行为。
      const privateHost = Object.values(os.networkInterfaces())
        .flatMap((items) => items ?? [])
        .find((item) => item.family === 'IPv4' && !item.internal)?.address;
      if (!privateHost) {
        skip('当前运行器没有非 loopback IPv4，无法验证私网传输');
        return;
      }

      const requestedPaths: string[] = [];
      const server = http.createServer((req, res) => {
        requestedPaths.push((req.url ?? '').split('?')[0]);
        res.setHeader('content-type', 'application/json');
        res.statusCode = req.url?.includes('/tenant_access_token/') ? tokenStatus : listStatus;
        res.end(
          JSON.stringify(
            req.url?.includes('/tenant_access_token/')
              ? tokenBody
              : (listBody ?? {
                  code: 0,
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
                })
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

        const request = useFeishuDatasetRequest({
          feishuServer: { appId: 'app-id', appSecret: 'app-secret', folderToken: 'folder-token' }
        });
        if (message) {
          const error = await request.listFiles({}).catch((error: unknown) => error);
          // 绕过全局响应 mock，用实际序列化结果验证前端可读 message 和登录状态。
          const { jsonRes } = await vi.importActual<
            typeof import('@fastgpt/service/common/response')
          >('@fastgpt/service/common/response');
          const res = { status: vi.fn().mockReturnThis(), json: vi.fn(), setHeader: vi.fn() };
          jsonRes(res as unknown as Parameters<typeof jsonRes>[0], { code: 500, error });
          const payload = JSON.parse(JSON.stringify(res.json.mock.calls[0][0]));
          const { getErrText } = await import('@fastgpt/global/common/error/utils');
          expect(getErrText(payload)).toBe(message);
          expect(payload.code).toBe(500);
          expect(payload.data).toBeNull();
          expect(JSON.stringify(payload)).not.toContain('app-secret');
          expect(res.setHeader).not.toHaveBeenCalled();
        } else {
          expect(await request.listFiles({})).toHaveLength(1);
        }
        expect(requestedPaths).toEqual([
          '/open-apis/auth/v3/tenant_access_token/internal',
          ...(tokenStatus === 200 && tokenBody.code === 0 ? ['/open-apis/drive/v1/files'] : [])
        ]);
      } finally {
        await new Promise<void>((resolve, reject) =>
          server.close((err) => (err ? reject(err) : resolve()))
        );
      }
    }
  );
});
