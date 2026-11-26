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
vi.mock('@fastgpt/service/common/system/systemInstanceConfig/runtime', () => ({
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

  it.each([
    {
      allowedOriginsEnabled: false,
      allowedOrigins: ['https://trusted.example.com'],
      expected: undefined
    },
    {
      allowedOriginsEnabled: true,
      allowedOrigins: ['https://trusted.example.com'],
      expected: ['https://trusted.example.com']
    },
    {
      allowedOriginsEnabled: undefined,
      allowedOrigins: ['https://trusted.example.com'],
      expected: ['https://trusted.example.com']
    },
    { allowedOriginsEnabled: true, allowedOrigins: [], expected: undefined },
    { allowedOriginsEnabled: true, allowedOrigins: {}, expected: [] },
    { allowedOriginsEnabled: undefined, allowedOrigins: null, expected: [] },
    { allowedOriginsEnabled: 0, allowedOrigins: [], expected: [] },
    {
      allowedOriginsEnabled: true,
      allowedOrigins: [null, 'https://trusted.example.com'],
      expected: ['https://trusted.example.com']
    },
    { allowedOriginsEnabled: true, allowedOrigins: [null, ''], expected: [] }
  ])(
    'honors the origins switch and legacy config: $allowedOriginsEnabled / $allowedOrigins',
    async ({ allowedOriginsEnabled, allowedOrigins, expected }) => {
      securitySnapshot({ allowedOriginsEnabled, allowedOrigins, csrfEnabled: true });

      NextAPI(async () => undefined);
      await runBefore(mocks);

      expect(mocks.withNextCors).toHaveBeenCalledWith(
        expect.objectContaining({ allowedOrigins: expected })
      );
    }
  );

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

  it('keeps CSRF enabled when a retained legacy flag has an invalid false-like type', async () => {
    securitySnapshot({ allowedOrigins: [], csrfEnabled: 0 });
    NextAPI(async () => undefined);
    await runBefore(mocks);
    expect(mocks.checkCsrf).toHaveBeenCalledOnce();
  });
});
