import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSystemInitData: vi.fn(),
  initStaticData: vi.fn()
}));

vi.mock('@/web/common/system/api', () => ({
  getSystemInitData: mocks.getSystemInitData
}));

vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: {
    getState: () => ({
      initDataBufferId: 'buffer_1',
      feConfigs: {
        show_enterprise_auth: true,
        systemTitle: 'cached'
      },
      initStaticData: mocks.initStaticData
    })
  }
}));

const { clientInitData } = await import('@/web/common/system/staticData');

describe('clientInitData runtime feConfigs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('使用 FastGPT 主配置返回的企业认证开关', async () => {
    mocks.getSystemInitData.mockResolvedValueOnce({
      feConfigs: {
        show_enterprise_auth: true,
        systemTitle: 'FastGPT'
      }
    });

    const result = await clientInitData();

    expect(result.feConfigs.show_enterprise_auth).toBe(true);
    expect(mocks.initStaticData).toHaveBeenCalledWith(
      expect.objectContaining({
        feConfigs: expect.objectContaining({
          show_enterprise_auth: true,
          systemTitle: 'FastGPT'
        })
      })
    );
  });

  it('主配置没有返回 feConfigs 时沿用缓存配置', async () => {
    mocks.getSystemInitData.mockResolvedValueOnce({
      bufferId: 'buffer_1'
    });

    const result = await clientInitData();

    expect(result.feConfigs.show_enterprise_auth).toBe(true);
    expect(result.feConfigs.systemTitle).toBe('cached');
  });
});
