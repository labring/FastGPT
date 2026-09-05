import { beforeEach, describe, expect, it, vi } from 'vitest';

type Request = { method?: string; url?: string };
type EntryOptions = {
  beforeCallback: Array<(req: Request, res: object) => Promise<unknown>>;
};

const mocks = vi.hoisted(() => ({
  createApiEntry: vi.fn((_options: EntryOptions) => vi.fn()),
  ensureModelCatalogReady: vi.fn(),
  withNextCors: vi.fn(),
  serviceEnv: { ALLOWED_ORIGINS: undefined as string | undefined }
}));

// 全局请求 mock 刻意跳过中间件；本文件捕获注册的真实回调，直接验证读屏障路由契约。
vi.mock('@fastgpt/service/common/http/entry', () => ({
  createApiEntry: mocks.createApiEntry
}));
vi.mock('@fastgpt/service/core/ai/config/runtime', () => ({
  ensureModelCatalogReady: mocks.ensureModelCatalogReady
}));
vi.mock('@fastgpt/next/middle/cors', () => ({ withNextCors: mocks.withNextCors }));
vi.mock('@fastgpt/service/env', async (importOriginal) => {
  const original = await importOriginal<typeof import('@fastgpt/service/env')>();
  return {
    ...original,
    serviceEnv: {
      ...original.serviceEnv,
      get ALLOWED_ORIGINS() {
        return mocks.serviceEnv.ALLOWED_ORIGINS;
      }
    }
  };
});

await import('@/service/middleware/entry');

const entryOptions = mocks.createApiEntry.mock.calls.at(-1)?.[0];

describe('NextAPI model catalog read barrier', () => {
  /** 执行真实注册的屏障；无需伪造完整 Next HTTP 对象或触发网络请求。 */
  const beforeModelRequest = (req: Request) => {
    const callback = entryOptions?.beforeCallback[0];
    if (!callback) throw new Error('Missing registered model catalog read barrier');
    return callback(req, {});
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureModelCatalogReady.mockReset().mockResolvedValue(undefined);
    mocks.withNextCors.mockReset().mockResolvedValue(undefined);
    mocks.serviceEnv.ALLOWED_ORIGINS = undefined;
  });

  it.each([
    '/api/core/ai/model/list',
    '/api/core/ai',
    '/api/core/app/detail',
    '/api/core/chat/init',
    '/api/core/dataset/searchTest',
    '/api/core/workflow/debug',
    '/api/v1/chat/completions',
    '/api/support/audio/speech',
    '/fastgpt/api/core/chat/completions',
    '/fastgpt/api/v1/chat/completions',
    '/api/core/dataset/searchTest?collectionId=test'
  ])('checks the authoritative catalog before serving %s', async (url) => {
    await beforeModelRequest({ method: 'POST', url });

    expect(mocks.ensureModelCatalogReady).toHaveBeenCalledExactlyOnceWith();
  });

  it.each([
    '/api/support/user/account/login',
    '/api/health',
    '/api/healthz',
    '/api/admin/settings/model/create',
    '/api/admin/settings/model/update',
    '/api/admin/settings/model/updateWithJson',
    '/api/admin/settings/model/delete',
    '/fastgpt/api/admin/settings/model/default',
    '/api/core/application/list',
    '/api/core/chatSettings',
    '/api/core/datasets',
    '/api/support/user/login?redirect=/api/core/chat/init',
    '',
    undefined
  ])('keeps recovery and unrelated route %s outside the model barrier', async (url) => {
    await beforeModelRequest({ method: 'POST', url });

    expect(mocks.ensureModelCatalogReady).not.toHaveBeenCalled();
  });

  it('does not block preflight requests on model readiness', async () => {
    mocks.ensureModelCatalogReady.mockRejectedValue(new Error('catalog unavailable'));

    await expect(
      beforeModelRequest({ method: 'OPTIONS', url: '/api/v1/chat/completions' })
    ).resolves.toBeUndefined();

    expect(mocks.ensureModelCatalogReady).not.toHaveBeenCalled();
  });

  it('propagates a failed read barrier so model consumers cannot silently use stale configuration', async () => {
    const error = new Error('authoritative model revision unavailable');
    mocks.ensureModelCatalogReady.mockRejectedValue(error);

    await expect(
      beforeModelRequest({ method: 'GET', url: '/api/core/ai/model/list' })
    ).rejects.toBe(error);
  });

  it.each([undefined, 'https://first.example.com,https://second.example.com'])(
    'preserves the separate CORS callback with allowedOrigins=%s',
    async (allowedOrigins) => {
      mocks.serviceEnv.ALLOWED_ORIGINS = allowedOrigins;
      const corsCallback = entryOptions?.beforeCallback[1];
      if (!corsCallback) throw new Error('Missing registered CORS callback');
      const req = { method: 'OPTIONS', url: '/api/v1/chat/completions' };
      const res = {};

      await corsCallback(req, res);

      expect(mocks.withNextCors).toHaveBeenCalledExactlyOnceWith({
        req,
        res,
        allowedOrigins: allowedOrigins?.split(',')
      });
      expect(mocks.ensureModelCatalogReady).not.toHaveBeenCalled();
    }
  );
});
