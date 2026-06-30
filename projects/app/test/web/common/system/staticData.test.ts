import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSystemInitData: vi.fn(),
  getProRuntimeFeConfigs: vi.fn(),
  initStaticData: vi.fn()
}));

vi.mock('@/web/common/system/api', () => ({
  getSystemInitData: mocks.getSystemInitData,
  getProRuntimeFeConfigs: mocks.getProRuntimeFeConfigs
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

  it('用 pro 运行时配置覆盖主应用存储中的企业认证开关', async () => {
    mocks.getSystemInitData.mockResolvedValueOnce({
      feConfigs: {
        show_enterprise_auth: false,
        systemTitle: 'FastGPT'
      }
    });
    mocks.getProRuntimeFeConfigs.mockResolvedValueOnce({
      feConfigs: {
        show_enterprise_auth: true
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

  it('pro 运行时配置不可用时关闭企业认证入口', async () => {
    mocks.getSystemInitData.mockResolvedValueOnce({
      feConfigs: {
        show_enterprise_auth: true,
        systemTitle: 'FastGPT'
      }
    });
    mocks.getProRuntimeFeConfigs.mockRejectedValueOnce(new Error('pro unavailable'));

    const result = await clientInitData();

    expect(result.feConfigs.show_enterprise_auth).toBe(false);
  });
});
