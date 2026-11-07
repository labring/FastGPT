import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SYSTEM_INSTANCE_CONFIG_DOMAINS,
  SYSTEM_INSTANCE_CONFIG_SCHEMA_VERSION
} from '@fastgpt/global/common/system/config/schema';
import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import { MongoSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/schema';
import { MongoSystemMigrationState } from '@/migration/mongoSchema';
import { systemMigrations, type SystemMigrationLogger } from '@/migration/registry';
import {
  claimMigrationLease,
  completeMigration,
  ensureMigrationStates,
  failMigration,
  getMigrationFailedRecords,
  getMigrationStates,
  isMigrationLeaseActive,
  renewMigrationLease,
  saveMigrationCheckpoint,
  saveMigrationFailedRecords,
  saveMigrationProgress
} from '@/migration/entity';
import { createSystemMigrationRunner, type SystemMigrationRunnerStore } from '@/migration/runner';

const logger: SystemMigrationLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
};

const migration = systemMigrations.find(({ id }) => id === '20260928_migrate_instance_configs')!;

/** 造出「存量库只迁入了一部分域」的场景：其余域必须由本任务补建。 */
const seedPartialDomains = async (count: number) => {
  await MongoSystemInstanceConfig.deleteMany({});
  await MongoSystemMigrationState.deleteMany({ _id: migration.id });
  await MongoSystemInstanceConfig.insertMany(
    SYSTEM_INSTANCE_CONFIG_DOMAINS.slice(0, count).map((domain) => ({
      domain,
      schemaVersion: SYSTEM_INSTANCE_CONFIG_SCHEMA_VERSION,
      revision: 1,
      overrides: {},
      explicitDefaultPaths: [],
      updatedBy: { actor: 'migration' as const }
    }))
  );
};

/**
 * 用真实 Runner 与真实 Mongo 复现「存量库缺域」场景：进度上报的 current 必须落在 total 内。
 * 分母若只统计有非默认 legacy 值的域，补建默认域时会被 Runner 拒绝并置为 failed。
 */
describe('migrateInstanceConfigs progress with the real runner', () => {
  beforeEach(() => {
    // 第二个用例会故意让 tick 记录扫描异常，不能污染第一个用例的日志断言
    vi.clearAllMocks();
  });

  it('succeeds and backfills every domain when only part of them exist', async () => {
    await seedPartialDomains(8);

    const runner = createSystemMigrationRunner({
      migrations: [migration],
      runnerId: 'runner-instance-config-progress',
      logger
    });

    try {
      await runner.start();
      await runner.tick();
      await runner.waitForBlockingMigrations();

      const state = await MongoSystemMigrationState.findById(migration.id).lean();
      expect(state?.status).toBe(SystemMigrationStatusEnum.succeeded);
      expect(logger.error).not.toHaveBeenCalled();
      expect(await MongoSystemInstanceConfig.countDocuments({})).toBe(
        SYSTEM_INSTANCE_CONFIG_DOMAINS.length
      );
    } finally {
      runner.stop();
      await MongoSystemInstanceConfig.deleteMany({});
      await MongoSystemMigrationState.deleteMany({ _id: migration.id });
    }
  });

  it('keeps the startup gate closed when the resumable re-run fails to claim', async () => {
    await seedPartialDomains(8);
    // 上一轮进程留下的成功态：resumable 不能只凭它放行
    await ensureMigrationStates([migration]);
    await MongoSystemMigrationState.updateOne(
      { _id: migration.id },
      { $set: { status: SystemMigrationStatusEnum.succeeded, runId: 'previous-run' } }
    );

    let claimAttempts = 0;
    const store: SystemMigrationRunnerStore = {
      ensureStates: ensureMigrationStates,
      getStates: getMigrationStates,
      getFailedRecords: getMigrationFailedRecords,
      claimLease: async (params) => {
        claimAttempts += 1;
        if (claimAttempts === 1) throw new Error('claim unavailable');
        return claimMigrationLease(params);
      },
      renewLease: renewMigrationLease,
      isLeaseActive: isMigrationLeaseActive,
      saveCheckpoint: saveMigrationCheckpoint,
      saveFailedRecords: saveMigrationFailedRecords,
      saveProgress: saveMigrationProgress,
      complete: completeMigration,
      fail: failMigration
    };

    const runner = createSystemMigrationRunner({
      migrations: [migration],
      runnerId: 'runner-instance-config-claim-failure',
      timing: { blockingPollIntervalMs: 10 },
      store,
      logger
    });

    try {
      // tick 的 catch 会吞掉扫描异常，start 仍正常返回，因此门禁必须自己守住
      await runner.start();
      expect(await MongoSystemInstanceConfig.countDocuments({})).toBe(8);

      const gate = runner.waitForBlockingMigrations();
      let released = false;
      void gate.then(() => {
        released = true;
      });
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(released).toBe(false);

      // 本轮补建真正跑完之后才放行
      await runner.tick();
      await gate;
      expect(await MongoSystemInstanceConfig.countDocuments({})).toBe(
        SYSTEM_INSTANCE_CONFIG_DOMAINS.length
      );
    } finally {
      runner.stop();
      await MongoSystemInstanceConfig.deleteMany({});
      await MongoSystemMigrationState.deleteMany({ _id: migration.id });
    }
  });
});
