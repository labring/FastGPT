import {
  getTestInstanceConfig,
  createDefaultInstanceConfig
} from '@test/utils/instanceConfigSnapshot';
import { describe, expect, it, vi } from 'vitest';

/** 验证运行时 helper 只读完整配置快照，未加载时使用 Schema 默认值。 */
type HelperModule = {
  getWorkflowMaxRunTimes: () => number;
  getStorageFileUrlExpiredDays: () => number;
  getStorageFileUrlExpiredTime: (now?: Date) => Date;
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
    getStorageFileUrlExpiredTime: s3.getStorageFileUrlExpiredTime,
    getServiceRequestMaxContentLength: sys.getServiceRequestMaxContentLength,
    getSystemMaxStringLength: str.getSystemMaxStringLength
  };
};

const makeSnapshot = (values: {
  maxRunTimes?: number;
  fileUrlExpiredDays?: number;
  serviceRequestMaxContentLength?: number;
  systemMaxStringLengthM?: number;
}) => {
  const snapshot = createDefaultInstanceConfig();
  if (values.maxRunTimes !== undefined)
    snapshot.performance.workflow.maxRunTimes = values.maxRunTimes;
  if (values.fileUrlExpiredDays !== undefined)
    snapshot.storage.fileUrlExpiredDays = values.fileUrlExpiredDays;
  if (values.serviceRequestMaxContentLength !== undefined)
    snapshot.resource.serviceRequestMaxContentLength = values.serviceRequestMaxContentLength;
  if (values.systemMaxStringLengthM !== undefined)
    snapshot.resource.systemMaxStringLengthM = values.systemMaxStringLengthM;
  return snapshot;
};

describe('runtime config helpers (instance config only)', () => {
  it('reads instance config values when present', async () => {
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
    expect(getTestInstanceConfig().resource.systemMaxStringLengthM).toBeGreaterThan(0);
  });

  it('uses Schema defaults before a snapshot is published', async () => {
    vi.stubEnv('WORKFLOW_MAX_RUN_TIMES', '999999');
    const defaults = createDefaultInstanceConfig();
    const helpers = await loadHelpersWithSnapshot(undefined as any);

    expect(helpers.getWorkflowMaxRunTimes()).toBe(defaults.performance.workflow.maxRunTimes);
    vi.unstubAllEnvs();
    expect(helpers.getStorageFileUrlExpiredDays()).toBe(defaults.storage.fileUrlExpiredDays);
    expect(helpers.getServiceRequestMaxContentLength()).toBe(
      defaults.resource.serviceRequestMaxContentLength * 1024 * 1024
    );
    expect(helpers.getSystemMaxStringLength()).toBe(
      defaults.resource.systemMaxStringLengthM * 1_000_000
    );
  });

  it('preserves legacy zero semantics through the helper chain', async () => {
    // 0 是合法的"禁用/不限"取值（见 performance schema 注释），helper 不得用 || 吃掉
    const helpers = await loadHelpersWithSnapshot(makeSnapshot({ maxRunTimes: 0 }));
    expect(helpers.getWorkflowMaxRunTimes()).toBe(0);
  });

  it('computes file expiration in milliseconds so fractional days are not truncated to zero', async () => {
    const base = new Date('2026-11-12T00:00:00.000Z');
    const halfDayHelpers = await loadHelpersWithSnapshot(makeSnapshot({ fileUrlExpiredDays: 0.5 }));
    expect(halfDayHelpers.getStorageFileUrlExpiredTime(base).toISOString()).toBe(
      '2026-11-12T12:00:00.000Z'
    );

    const ninetyDayHelpers = await loadHelpersWithSnapshot(
      makeSnapshot({ fileUrlExpiredDays: 90 })
    );
    expect(ninetyDayHelpers.getStorageFileUrlExpiredTime(base).getTime() - base.getTime()).toBe(
      90 * 24 * 60 * 60 * 1000
    );
  });
});
