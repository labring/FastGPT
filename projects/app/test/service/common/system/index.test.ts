import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveSystemInstanceConfig } from '@fastgpt/global/common/system/config/schema';

vi.unmock('@/service/common/system');

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  reload: vi.fn(),
  storage: vi.fn(),
  buckets: vi.fn()
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
vi.mock('@fastgpt/service/thirdProvider/fastgptPlugin', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  pluginClient: { getPluginServiceFeatures: vi.fn().mockResolvedValue({}) }
}));

describe('initSystemConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getConfig.mockResolvedValue({ fastgptConfig: { feConfigs: {}, systemEnv: {} } });
    mocks.reload.mockResolvedValue(resolveSystemInstanceConfig({}));
    mocks.storage.mockReturnValue(false);
    mocks.buckets.mockReset();
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
});
