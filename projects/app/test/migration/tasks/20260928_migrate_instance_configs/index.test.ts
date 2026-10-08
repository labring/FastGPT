import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import type { SystemMigrationContext } from '@/migration/registry';

const mocks = vi.hoisted(() => ({
  inspectInstanceConfigMigration: vi.fn(),
  applyInstanceConfigMigration: vi.fn()
}));

vi.mock('@/migration/tasks/20260928_migrate_instance_configs/service', () => ({
  inspectInstanceConfigMigration: mocks.inspectInstanceConfigMigration,
  applyInstanceConfigMigration: mocks.applyInstanceConfigMigration
}));

import { migrateInstanceConfigs } from '@/migration/tasks/20260928_migrate_instance_configs';

const createContext = () =>
  ({
    reportProgress: vi.fn(),
    assertActive: vi.fn(),
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }
  }) as unknown as SystemMigrationContext;

describe('migrateInstanceConfigs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips writes when target collection already initialized (idempotent)', async () => {
    mocks.inspectInstanceConfigMigration.mockResolvedValue({
      existingDomainCount: 5,
      hasLegacyConfig: true,
      hasLegacyProConfig: true,
      envRehomedWarnings: [],
      overrides: { site: { name: 'ignored' } }
    });

    const context = createContext();
    const result = await migrateInstanceConfigs(context);

    expect(result).toEqual({ migratedDomainCount: 0, skipped: true });
    // 已初始化时绝不写入，避免覆盖管理员配置
    expect(mocks.applyInstanceConfigMigration).not.toHaveBeenCalled();
    expect(context.logger.info).toHaveBeenCalled();

    // 跳过分支同样要把三个声明阶段全部置为 succeeded，否则 Runner 判定任务未完成
    const succeededKeys = (context.reportProgress as any).mock.calls
      .map(([arg]: any[]) => arg)
      .filter((arg: any) => arg.status === SystemMigrationStatusEnum.succeeded)
      .map((arg: any) => arg.key);
    expect(succeededKeys).toEqual(expect.arrayContaining(['inspect', 'migrate', 'validate']));
  });

  it('logs warnings for fields re-homed to environment variables', async () => {
    mocks.inspectInstanceConfigMigration.mockResolvedValue({
      existingDomainCount: 0,
      hasLegacyConfig: true,
      hasLegacyProConfig: false,
      envRehomedWarnings: ['customApiDomain -> 请配置环境变量 CUSTOM_API_DOMAIN'],
      overrides: { site: { name: 'My Site' } }
    });
    mocks.applyInstanceConfigMigration.mockResolvedValue({
      domains: ['site'],
      migratedCount: 1
    });

    const context = createContext();
    await migrateInstanceConfigs(context);

    expect(context.logger.warn).toHaveBeenCalledWith(expect.stringContaining('CUSTOM_API_DOMAIN'));
  });

  it('applies migrations and reports each stage when collection is empty', async () => {
    mocks.inspectInstanceConfigMigration.mockResolvedValue({
      existingDomainCount: 0,
      hasLegacyConfig: true,
      hasLegacyProConfig: true,
      envRehomedWarnings: [],
      overrides: { site: { name: 'My Site' }, auth: { teamMode: 'multi' } }
    });
    mocks.applyInstanceConfigMigration.mockResolvedValue({
      domains: ['site', 'auth'],
      migratedCount: 2
    });

    const context = createContext();
    const result = await migrateInstanceConfigs(context);

    expect(result).toEqual({ migratedDomainCount: 2, skipped: false });
    expect(mocks.applyInstanceConfigMigration).toHaveBeenCalledTimes(1);

    // 三个声明阶段都应被标记为成功
    const succeededKeys = (context.reportProgress as any).mock.calls
      .map(([arg]: any[]) => arg)
      .filter((arg: any) => arg.status === SystemMigrationStatusEnum.succeeded)
      .map((arg: any) => arg.key);
    expect(succeededKeys).toEqual(expect.arrayContaining(['inspect', 'migrate', 'validate']));

    // 长任务必须检查 lease
    expect(context.assertActive).toHaveBeenCalled();
  });

  it('applies migrations even when only legacy fastgptPro config exists', async () => {
    mocks.inspectInstanceConfigMigration.mockResolvedValue({
      existingDomainCount: 0,
      hasLegacyConfig: false,
      hasLegacyProConfig: true,
      envRehomedWarnings: [],
      overrides: { auth: { teamMode: 'multi' } }
    });
    mocks.applyInstanceConfigMigration.mockResolvedValue({
      domains: ['auth'],
      migratedCount: 1
    });

    const context = createContext();
    const result = await migrateInstanceConfigs(context);

    expect(result).toEqual({ migratedDomainCount: 1, skipped: false });
    expect(mocks.applyInstanceConfigMigration).toHaveBeenCalledTimes(1);
  });
});
