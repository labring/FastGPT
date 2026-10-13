import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createApiEntry: vi.fn(() => vi.fn()),
  withNextCors: vi.fn().mockResolvedValue(undefined),
  checkCsrf: vi.fn().mockResolvedValue(undefined),
  getSystemInstanceConfig: vi.fn()
}));
vi.mock('@fastgpt/service/common/http/entry', () => ({ createApiEntry: mocks.createApiEntry }));
vi.mock('@fastgpt/next/middle/cors', () => ({
  parseAllowedOrigins: vi.fn(),
  withNextCors: mocks.withNextCors
}));
vi.mock('@fastgpt/next/middle/csrf', () => ({ checkCsrf: mocks.checkCsrf }));
vi.mock('@fastgpt/service/common/system/systemInstanceConfig/controller', () => ({
  getSystemInstanceConfig: mocks.getSystemInstanceConfig
}));
const { NextAPI } = await import('@/service/middleware/entry');

const securitySnapshot = (security: Record<string, unknown>) =>
  mocks.getSystemInstanceConfig.mockReturnValue({ security });

const runBefore = async (api: unknown, req: unknown = {}, res: unknown = {}) => {
  const options = mocks.createApiEntry.mock.calls.at(-1)![0] as unknown as {
    beforeCallback: Array<(r: unknown, s: unknown) => Promise<unknown>>;
  };
  await options.beforeCallback[0](req, res);
};

describe('NextAPI', () => {
  beforeEach(() => {
    mocks.createApiEntry.mockClear();
    mocks.withNextCors.mockClear();
    mocks.checkCsrf.mockClear();
    securitySnapshot({ allowedOrigins: [], csrfEnabled: true });
  });

  it('only registers CORS/CSRF guard, with no model refresh or request context wrapper', async () => {
    NextAPI(async () => undefined);

    const options = mocks.createApiEntry.mock.calls[0][0] as unknown as {
      beforeCallback: Array<(req: unknown, res: unknown) => Promise<unknown>>;
    };
    expect(options.beforeCallback).toHaveLength(1);
    const req = { method: 'OPTIONS', url: '/api/core/ai/model/list' };
    const res = {};
    await options.beforeCallback[0](req, res);
    expect(mocks.withNextCors).toHaveBeenCalledWith(expect.objectContaining({ req, res }));
  });

  it('forwards sensitive query parameters to the shared API entry', () => {
    NextAPI(async () => undefined, {
      csrf: false,
      redactQueryParams: ['ticket']
    });

    expect(mocks.createApiEntry).toHaveBeenCalledWith(
      expect.objectContaining({ redactQueryParams: ['ticket'] })
    );
  });

  it('treats instance config as the sole authority for allowed origins', async () => {
    securitySnapshot({ allowedOrigins: ['https://trusted.example.com'], csrfEnabled: true });

    NextAPI(async () => undefined);
    await runBefore(mocks);

    expect(mocks.withNextCors).toHaveBeenCalledWith(
      expect.objectContaining({ allowedOrigins: ['https://trusted.example.com'] })
    );
  });

  it('passes undefined origins when the admin cleared the list so CORS allows all (no env resurrection)', async () => {
    // 管理员清空白名单后落库 []；若这里回落 env ALLOWED_ORIGINS，清空操作会被静默复活
    securitySnapshot({ allowedOrigins: [], csrfEnabled: true });

    NextAPI(async () => undefined);
    await runBefore(mocks);

    expect(mocks.withNextCors).toHaveBeenCalledWith(
      expect.objectContaining({ allowedOrigins: undefined })
    );
    // 不得再引用 env 解析器
    expect(mocks.getSystemInstanceConfig).toHaveBeenCalled();
  });

  it('honors csrfEnabled from instance config only', async () => {
    securitySnapshot({ allowedOrigins: [], csrfEnabled: false });
    NextAPI(async () => undefined);
    await runBefore(mocks);
    expect(mocks.checkCsrf).not.toHaveBeenCalled();

    securitySnapshot({ allowedOrigins: [], csrfEnabled: true });
    NextAPI(async () => undefined);
    await runBefore(mocks);
    expect(mocks.checkCsrf).toHaveBeenCalledTimes(1);
  });

  it('skips CSRF only when the handler opts out', async () => {
    securitySnapshot({ allowedOrigins: [], csrfEnabled: true });
    NextAPI(async () => undefined, { csrf: false });
    await runBefore(mocks);
    expect(mocks.checkCsrf).not.toHaveBeenCalled();
  });
});
