import { describe, expect, it, vi } from 'vitest';

/**
 * 动态运行时 helper 的契约测试：
 * 这些 helper 把模块级 env 常量替换为"实例配置快照优先、快照缺省回落 env"的读取，
 * 保证 Admin 保存配置后无需重启即可生效，且启动加载完成前行为与旧常量一致。
 *
 * 这里不 mock controller 模块，而是通过 global.systemInstanceConfig 注入快照：
 * getSystemInstanceConfig 首次调用时优先采纳 global 上已挂载的快照并缓存，
 * vi.resetModules 保证每个用例拿到全新的 controller 模块状态。
 */
type HelperModule = {
  getWorkflowMaxRunTimes: () => number;
  getStorageFileUrlExpiredDays: () => number;
  getServiceRequestMaxContentLength: () => number;
  getSystemMaxStringLength: () => number;
};

const loadHelpersWithSnapshot = async (snapshot: Record<string, any>): Promise<HelperModule> => {
  vi.resetModules();
  (global as any).systemInstanceConfig = snapshot;

  const workflow = await import('../../../core/workflow/constants');
  const s3 = await import('../../../common/s3/config/constants');
  const sys = await import('../../../common/system/constants');
  const str = await import('../../../common/string/replaceVariable');
  return {
    getWorkflowMaxRunTimes: workflow.getWorkflowMaxRunTimes,
    getStorageFileUrlExpiredDays: s3.getStorageFileUrlExpiredDays,
    getServiceRequestMaxContentLength: sys.getServiceRequestMaxContentLength,
    getSystemMaxStringLength: str.getSystemMaxStringLength
  };
};

const makeSnapshot = (values: {
  maxRunTimes?: number;
  fileUrlExpiredDays?: number;
  serviceRequestMaxContentLength?: number;
  systemMaxStringLengthM?: number;
}) =>
  ({
    performance: { workflow: { maxRunTimes: values.maxRunTimes } },
    storage: { fileUrlExpiredDays: values.fileUrlExpiredDays },
    resource: {
      serviceRequestMaxContentLength: values.serviceRequestMaxContentLength,
      systemMaxStringLengthM: values.systemMaxStringLengthM
    }
  }) as any;

describe('runtime config helpers (instance config first, env fallback)', () => {
  it('reads instance config values when present', async () => {
    const { serviceEnv } = await import('../../../env');
    const helpers = await loadHelpersWithSnapshot(
      makeSnapshot({
        maxRunTimes: 777,
        fileUrlExpiredDays: 15,
        serviceRequestMaxContentLength: 32,
        systemMaxStringLengthM: 50
      })
    );

    expect(helpers.getWorkflowMaxRunTimes()).toBe(777);
    expect(helpers.getStorageFileUrlExpiredDays()).toBe(15);
    expect(helpers.getServiceRequestMaxContentLength()).toBe(32 * 1024 * 1024);
    expect(helpers.getSystemMaxStringLength()).toBe(50 * 1_000_000);
    expect(serviceEnv.SYSTEM_MAX_STRING_LENGTH_M).toBeGreaterThan(0);
  });

  it('falls back to serviceEnv when snapshot field is missing', async () => {
    const { serviceEnv } = await import('../../../env');
    const helpers = await loadHelpersWithSnapshot(makeSnapshot({}));

    expect(helpers.getWorkflowMaxRunTimes()).toBe(serviceEnv.WORKFLOW_MAX_RUN_TIMES);
    expect(helpers.getStorageFileUrlExpiredDays()).toBe(serviceEnv.FILE_URL_EXPIRED_DAYS);
    expect(helpers.getServiceRequestMaxContentLength()).toBe(
      serviceEnv.SERVICE_REQUEST_MAX_CONTENT_LENGTH * 1024 * 1024
    );
    expect(helpers.getSystemMaxStringLength()).toBe(
      serviceEnv.SYSTEM_MAX_STRING_LENGTH_M * 1_000_000
    );
  });

  it('preserves legacy zero semantics through the helper chain', async () => {
    // 0 是合法的"禁用/不限"取值（见 performance schema 注释），helper 不得用 || 吃掉
    const helpers = await loadHelpersWithSnapshot(makeSnapshot({ maxRunTimes: 0 }));
    expect(helpers.getWorkflowMaxRunTimes()).toBe(0);
  });
});
