import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SystemMigrationProgressInputSchema } from '@fastgpt/global/migration/schema';
import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import type { SystemMigrationContext } from '@/migration/registry';

const mocks = vi.hoisted(() => ({
  inspect: vi.fn(),
  apply: vi.fn(),
  cleanup: vi.fn(),
  verifyCleanup: vi.fn(),
  migrateScopes: vi.fn(),
  backfillExternal: vi.fn(),
  backfillSms: vi.fn(),
  rehomeFile: vi.fn(),
  rehomeHttp: vi.fn(),
  restoreDomain: vi.fn(),
  rehomeConnections: vi.fn(),
  rehomeProxy: vi.fn(),
  rehomeOvercommit: vi.fn(),
  verifyExternal: vi.fn(),
  verifySms: vi.fn(),
  verifyFile: vi.fn(),
  verifyHttp: vi.fn(),
  verifyDomain: vi.fn(),
  verifyScopes: vi.fn(),
  verifyConnections: vi.fn(),
  verifyProxy: vi.fn(),
  verifyOvercommit: vi.fn(),
  encryptSecrets: vi.fn(),
  verifySecrets: vi.fn()
}));

vi.mock('@/migration/tasks/4180/20261116_migrate_system_configs/scopes', () => ({
  migrateLegacyConfigScopes: mocks.migrateScopes,
  verifyLegacyConfigScopes: mocks.verifyScopes
}));
vi.mock('@/migration/tasks/4180/20261116_migrate_system_configs/service', () => ({
  inspectInstanceConfigMigration: mocks.inspect,
  applyInstanceConfigMigration: mocks.apply
}));
vi.mock('@/migration/tasks/4180/20261116_migrate_system_configs/cleanup', () => ({
  cleanupInstanceConfigDeprecatedFields: mocks.cleanup,
  verifyInstanceConfigDeprecatedFields: mocks.verifyCleanup
}));
vi.mock('@/migration/tasks/4180/20261116_migrate_system_configs/backfill', () => ({
  backfillExternalFileCheck: mocks.backfillExternal,
  backfillModelDeprecationSms: mocks.backfillSms,
  rehomeFileDomain: mocks.rehomeFile,
  rehomeHttpRuntimePolicies: mocks.rehomeHttp,
  restoreCustomDomainConfig: mocks.restoreDomain,
  verifyExternalFileCheck: mocks.verifyExternal,
  verifyModelDeprecationSms: mocks.verifySms,
  verifyFileDomainMigration: mocks.verifyFile,
  verifyHttpRuntimePolicyMigration: mocks.verifyHttp,
  verifyCustomDomainConfig: mocks.verifyDomain
}));
vi.mock('@/migration/tasks/4180/20261116_migrate_system_configs/subservices', () => ({
  rehomeSubserviceConnections: mocks.rehomeConnections,
  rehomeAgentSandboxProxy: mocks.rehomeProxy,
  rehomeSandboxOvercommit: mocks.rehomeOvercommit,
  verifyRehomedSubserviceConnections: mocks.verifyConnections,
  verifyAgentSandboxProxyMigration: mocks.verifyProxy,
  verifySandboxOvercommitMigration: mocks.verifyOvercommit
}));
vi.mock('@/migration/tasks/4180/20261116_migrate_system_configs/secrets', () => ({
  encryptStoredConfigSecrets: mocks.encryptSecrets,
  verifyStoredConfigSecrets: mocks.verifySecrets
}));

import { migrateSystemConfigs } from '@/migration/tasks/4180/20261116_migrate_system_configs';

const createContext = () => {
  const reportProgress = vi.fn(async (input) => {
    // Runner 在持久化进度前也执行此校验，避免测试忽略 current > total。
    SystemMigrationProgressInputSchema.parse(input);
  });
  return {
    reportProgress,
    assertActive: vi.fn(async () => {}),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  };
};

const inspection = {
  existingDomainCount: 11,
  missingDomainCount: 0,
  pendingBackfillDomainCount: 0,
  pendingBackfillPaths: [],
  hasLegacyConfig: true,
  hasLegacyProConfig: true,
  envRehomedWarnings: [],
  schemaSanitizedWarnings: [],
  schemaSanitizedIssues: [],
  overrides: {}
};

describe('migrateSystemConfigs', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.inspect.mockResolvedValue(inspection);
    mocks.apply.mockResolvedValue({
      migratedCount: 1,
      backfilledDomains: [],
      backfilledPaths: [],
      backfillSkippedPaths: []
    });
    mocks.cleanup.mockResolvedValue({
      scannedDocuments: 11,
      updatedDomains: [],
      removedFieldCount: 0
    });
    mocks.verifyCleanup.mockResolvedValue({ remainingDocuments: [], invalidDomains: [] });
  });

  it('executes cleanup and all backfills even when legacy domains are already complete', async () => {
    const context = createContext();
    await migrateSystemConfigs(context as unknown as SystemMigrationContext);

    expect(mocks.apply).not.toHaveBeenCalled();
    for (const backfill of [
      mocks.migrateScopes,
      mocks.backfillExternal,
      mocks.rehomeProxy,
      mocks.rehomeConnections,
      mocks.backfillSms,
      mocks.rehomeOvercommit,
      mocks.rehomeFile,
      mocks.rehomeHttp,
      mocks.restoreDomain,
      mocks.encryptSecrets
    ]) {
      expect(backfill).toHaveBeenCalledOnce();
    }
    expect(mocks.rehomeProxy.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.rehomeConnections.mock.invocationCallOrder[0]
    );
    expect(mocks.rehomeProxy.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.rehomeOvercommit.mock.invocationCallOrder[0]
    );
    for (const verify of [
      mocks.verifyCleanup,
      mocks.verifyExternal,
      mocks.verifyConnections,
      mocks.verifySms,
      mocks.verifyProxy,
      mocks.verifyOvercommit,
      mocks.verifyFile,
      mocks.verifyHttp,
      mocks.verifyDomain,
      mocks.verifyScopes,
      mocks.verifySecrets
    ]) {
      expect(verify).toHaveBeenCalledOnce();
    }
    expect(
      context.reportProgress.mock.calls
        .map(([progress]) => progress)
        .filter(({ status }) => status === SystemMigrationStatusEnum.succeeded)
        .map(({ key }) => key)
    ).toEqual(['inspect', 'migrate', 'cleanup', 'backfill', 'validate']);
    expect(context.reportProgress).toHaveBeenCalledWith({
      key: 'backfill',
      status: SystemMigrationStatusEnum.succeeded,
      current: 10,
      total: 10
    });
  });

  it.each([
    {
      stage: 'inspect',
      fail: () => mocks.inspect.mockRejectedValueOnce(new Error('inspect failed'))
    },
    {
      stage: 'migrate',
      fail: () => {
        mocks.inspect.mockResolvedValueOnce({ ...inspection, missingDomainCount: 1 });
        mocks.apply.mockRejectedValueOnce(new Error('migrate failed'));
      }
    },
    {
      stage: 'cleanup',
      fail: () => mocks.cleanup.mockRejectedValueOnce(new Error('cleanup failed'))
    },
    {
      stage: 'backfill',
      fail: () => mocks.rehomeHttp.mockRejectedValueOnce(new Error('backfill failed'))
    },
    {
      stage: 'validate',
      fail: () => mocks.verifyDomain.mockRejectedValueOnce(new Error('validate failed'))
    }
  ])('does not report $stage as successful when it fails', async ({ stage, fail }) => {
    fail();
    const context = createContext();
    await expect(
      migrateSystemConfigs(context as unknown as SystemMigrationContext)
    ).rejects.toThrow(`${stage} failed`);
    expect(context.reportProgress).toHaveBeenCalledWith(
      expect.objectContaining({ key: stage, status: SystemMigrationStatusEnum.running })
    );
    expect(context.reportProgress).not.toHaveBeenCalledWith(
      expect.objectContaining({ key: stage, status: SystemMigrationStatusEnum.succeeded })
    );
  });

  it('rejects unresolved post-migration gaps before announcing validation success', async () => {
    mocks.inspect
      .mockResolvedValueOnce({ ...inspection, missingDomainCount: 1 })
      .mockResolvedValueOnce({
        ...inspection,
        pendingBackfillDomainCount: 1,
        pendingBackfillPaths: ['site.name']
      });
    const context = createContext();
    await expect(
      migrateSystemConfigs(context as unknown as SystemMigrationContext)
    ).rejects.toThrow(/site\.name failed to migrate/);
    expect(context.reportProgress).not.toHaveBeenCalledWith(
      expect.objectContaining({ key: 'validate', status: SystemMigrationStatusEnum.succeeded })
    );
  });
});
