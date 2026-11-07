import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  afterEach(() => vi.useRealTimers());

  it('explicitly requests plans using the current buffer instead of inspecting the browser path', async () => {
    mocks.getSystemInitData.mockResolvedValueOnce({ subPlans: { extraDatasetSize: { price: 4 } } });
    await clientInitData({ includeSubPlans: true });
    expect(mocks.getSystemInitData).toHaveBeenCalledExactlyOnceWith({
      bufferId: 'buffer_1',
      includeSubPlans: true
    });
  });

  it('preserves an explicit plans request through a retry', async () => {
    vi.useFakeTimers();
    mocks.getSystemInitData
      .mockRejectedValueOnce(new Error('Temporary failure'))
      .mockResolvedValueOnce({ subPlans: { extraDatasetSize: { price: 4 } } });
    const pending = clientInitData({ includeSubPlans: true, retry: 1 });
    await vi.advanceTimersByTimeAsync(500);
    await pending;
    expect(mocks.getSystemInitData.mock.calls).toEqual([
      [{ bufferId: 'buffer_1', includeSubPlans: true }],
      [{ bufferId: 'buffer_1', includeSubPlans: true }]
    ]);
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
