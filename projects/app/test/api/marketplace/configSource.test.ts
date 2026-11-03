import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveSystemInstanceConfig } from '@fastgpt/global/common/system/config/schema';

vi.mock('@/service/middleware/entry', () => ({ NextAPI: (handler: unknown) => handler }));
vi.mock('@fastgpt/service/support/permission/user/auth', () => ({
  authSystemAdmin: async () => ({}),
  authUserPer: async () => ({})
}));
import handler from '@/pages/api/marketplace/[...path]';

describe('Marketplace config source', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    global.systemInstanceConfig = resolveSystemInstanceConfig({
      site: { marketplaceUrl: 'https://configured.example.com' }
    });
    vi.stubEnv('MARKETPLACE_URL', 'https://retired-env.example.com');
    fetchMock.mockReset().mockResolvedValue({ headers: new Headers(), status: 200, body: null });
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('forwards requests to the configured host instead of the retired ENV', async () => {
    const response = { status: vi.fn().mockReturnThis(), end: vi.fn(), setHeader: vi.fn() };
    await handler(
      { query: { path: ['api', 'models'] }, headers: {}, method: 'GET' } as any,
      response as any
    );
    expect(fetchMock.mock.calls[0][0].url).toBe('https://configured.example.com/api/models');
    expect(response.status).toHaveBeenCalledWith(200);
  });
});
