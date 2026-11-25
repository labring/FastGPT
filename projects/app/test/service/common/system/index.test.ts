import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveSystemInstanceConfig } from '@fastgpt/global/common/system/config/schema';

vi.unmock('@/service/common/system');

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  reload: vi.fn(),
  storage: vi.fn(),
  buckets: vi.fn(),
  refreshTTL: vi.fn()
}));
vi.mock('@fastgpt/service/common/system/systemInstanceConfig/service', () => ({
  systemInstanceConfig: { initialize: mocks.reload, setFrontendContext: vi.fn() }
}));
vi.mock('@fastgpt/service/common/s3/config/constants', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  applyRuntimeStorageConfig: mocks.storage
}));
vi.mock('@fastgpt/service/common/s3', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  initS3Buckets: mocks.buckets
}));
vi.mock('@fastgpt/service/core/ai/record/service', () => ({
  refreshLLMRequestRecordTTL: mocks.refreshTTL
}));
vi.mock('@fastgpt/service/thirdProvider/fastgptPlugin', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  pluginClient: { getPluginServiceFeatures: vi.fn().mockResolvedValue({}) }
}));

const configWithRetentionHours = (retentionHours: number) => {
  const config = resolveSystemInstanceConfig({});
  config.performance.tracking.retentionHours = retentionHours;
  return config;
};

describe('initSystemConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (globalThis as { systemConfigInitState?: unknown }).systemConfigInitState;
    mocks.getConfig.mockResolvedValue({ fastgptConfig: { feConfigs: {}, systemEnv: {} } });
    mocks.reload.mockResolvedValue(resolveSystemInstanceConfig({}));
    mocks.storage.mockReturnValue(false);
    mocks.buckets.mockReset();
    mocks.refreshTTL.mockResolvedValue(true);
  });

  it('retries failed bucket creation on the next refresh and then stops rebuilding unchanged storage', async () => {
    // 全局 setup 提供了兼容 init mock；此处必须加载真实实现验证资源刷新重试。
    vi.resetModules();
    const { initSystemConfig } =
      await vi.importActual<typeof import('@/service/common/system')>('@/service/common/system');
    mocks.storage.mockReturnValueOnce(true).mockReturnValue(false);
    mocks.buckets.mockImplementationOnce(() => {
      throw new Error('temporary bucket failure');
    });
    const reload = () => initSystemConfig({ refreshLLMRequestRecordTTL: false });
    await expect(reload()).rejects.toThrow('temporary bucket failure');
    await reload();
    expect(mocks.buckets).toHaveBeenCalledTimes(2);
    await reload();
    expect(mocks.buckets).toHaveBeenCalledTimes(2);
  });

  it('runs LLM request record TTL refresh in background and skips unchanged retentionHours', async () => {
    vi.resetModules();
    const { initSystemConfig } =
      await vi.importActual<typeof import('@/service/common/system')>('@/service/common/system');

    let releaseTTL!: (value: boolean) => void;
    mocks.refreshTTL.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          releaseTTL = resolve;
        })
    );
    mocks.reload.mockResolvedValue(configWithRetentionHours(6));

    // 慢日志库不能阻塞 initSystemConfig 返回
    await initSystemConfig();
    await vi.waitFor(() => expect(mocks.refreshTTL).toHaveBeenCalledTimes(1));
    releaseTTL(true);
    await vi.waitFor(() =>
      expect(
        (
          globalThis as {
            systemConfigInitState?: { appliedLLMRequestRecordRetentionHours?: number };
          }
        ).systemConfigInitState?.appliedLLMRequestRecordRetentionHours
      ).toBe(6)
    );

    // retentionHours 未变时不重复查询日志库
    await initSystemConfig();
    expect(mocks.refreshTTL).toHaveBeenCalledTimes(1);

    // retentionHours 变更后触发更新；失败后下次重载会重试
    mocks.reload.mockResolvedValue(configWithRetentionHours(48));
    mocks.refreshTTL.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await initSystemConfig();
    await vi.waitFor(() => expect(mocks.refreshTTL).toHaveBeenCalledTimes(2));

    await initSystemConfig();
    await vi.waitFor(() => expect(mocks.refreshTTL).toHaveBeenCalledTimes(3));
    await vi.waitFor(() =>
      expect(
        (
          globalThis as {
            systemConfigInitState?: { appliedLLMRequestRecordRetentionHours?: number };
          }
        ).systemConfigInitState?.appliedLLMRequestRecordRetentionHours
      ).toBe(48)
    );

    // 再次保存无关变更时不再调用日志库
    await initSystemConfig();
    expect(mocks.refreshTTL).toHaveBeenCalledTimes(3);
  });

  it('re-applies reverted retentionHours when a TTL refresh is already in flight', async () => {
    vi.resetModules();
    const { initSystemConfig } =
      await vi.importActual<typeof import('@/service/common/system')>('@/service/common/system');

    mocks.reload.mockResolvedValue(configWithRetentionHours(6));
    await initSystemConfig();
    await vi.waitFor(() => expect(mocks.refreshTTL).toHaveBeenCalledTimes(1));

    let releaseFirst!: (value: boolean) => void;
    mocks.refreshTTL.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          releaseFirst = resolve;
        })
    );
    mocks.reload.mockResolvedValueOnce(configWithRetentionHours(48));
    await initSystemConfig();
    await vi.waitFor(() => expect(mocks.refreshTTL).toHaveBeenCalledTimes(2));

    // 48h 校准尚在进行时切回 6h，仍需排队在 48h 完成后把 TTL 改回 6h
    mocks.reload.mockResolvedValueOnce(configWithRetentionHours(6));
    await initSystemConfig();
    releaseFirst(true);

    await vi.waitFor(() => expect(mocks.refreshTTL).toHaveBeenCalledTimes(3));
    await vi.waitFor(() =>
      expect(
        (
          globalThis as {
            systemConfigInitState?: { appliedLLMRequestRecordRetentionHours?: number };
          }
        ).systemConfigInitState?.appliedLLMRequestRecordRetentionHours
      ).toBe(6)
    );
  });
});
