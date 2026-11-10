import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SYSTEM_INSTANCE_CONFIG_DOMAINS,
  SYSTEM_INSTANCE_CONFIG_SCHEMA_VERSION
} from '@fastgpt/global/common/system/config/schema';
import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import { MongoSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/schema';
import { MongoSystemMigrationState } from '@/migration/mongoSchema';
import { systemMigrations, type SystemMigrationLogger } from '@/migration/registry';
import { createSystemMigrationRunner } from '@/migration/runner';
import * as legacyEnv from '@/migration/tasks/4180/20260928_migrate_instance_configs/env';

const logger: SystemMigrationLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
};

const migration = systemMigrations.find(({ id }) => id === '20260928_migrate_instance_configs')!;
const cleanup = systemMigrations.find(
  ({ id }) => id === '20260929_cleanup_instance_config_deprecated_fields'
)!;

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

  it('does not re-import completed ENV migration but still reruns deprecated-field cleanup', async () => {
    await seedPartialDomains(0);
    vi.stubEnv('CSRF_ENABLED', 'false');
    const readLegacyEnv = vi.spyOn(legacyEnv, 'readLegacyInstanceConfigEnv');
    const firstRunner = createSystemMigrationRunner({
      migrations: [migration, cleanup],
      runnerId: 'runner-instance-config-first-start',
      logger
    });
    const restartedRunner = createSystemMigrationRunner({
      migrations: [migration, cleanup],
      runnerId: 'runner-instance-config-restart',
      logger
    });

    try {
      await firstRunner.start();
      expect(await MongoSystemMigrationState.findById(migration.id).lean()).toMatchObject({
        status: SystemMigrationStatusEnum.succeeded
      });
      expect(await MongoSystemMigrationState.findById(cleanup.id).lean()).toMatchObject({
        status: SystemMigrationStatusEnum.succeeded
      });
      await firstRunner.waitForBlockingMigrations();
      const previousState = await MongoSystemMigrationState.findById(migration.id).lean();
      const previousConfig = await MongoSystemInstanceConfig.findOne({ domain: 'security' }).lean();
      expect(previousConfig?.overrides).toMatchObject({ csrfEnabled: false });
      expect(readLegacyEnv).toHaveBeenCalled();
      readLegacyEnv.mockClear();
      firstRunner.stop();

      // 新增的废弃字段仍需清理，但已完成的 ENV 导入不能受后来配置变化影响。
      await MongoSystemInstanceConfig.updateOne(
        { domain: 'vector' },
        { $set: { 'overrides.vqLevel': 32 }, $inc: { revision: 1 } }
      );
      vi.stubEnv('CSRF_ENABLED', 'true');
      vi.stubEnv('WORKFLOW_MAX_RUN_TIMES', 'not-a-number');
      await restartedRunner.start();

      const state = await MongoSystemMigrationState.findById(migration.id).lean();
      const cleanupState = await MongoSystemMigrationState.findById(cleanup.id).lean();
      expect(state?.status).toBe(SystemMigrationStatusEnum.succeeded);
      expect(state?.lastStartedAt).toEqual(previousState?.lastStartedAt);
      expect(readLegacyEnv).not.toHaveBeenCalled();
      expect(cleanupState?.status).toBe(SystemMigrationStatusEnum.succeeded);
      expect(await MongoSystemInstanceConfig.findOne({ domain: 'security' }).lean()).toEqual(
        previousConfig
      );
      expect(
        (await MongoSystemInstanceConfig.findOne({ domain: 'vector' }).lean())?.overrides
      ).not.toHaveProperty('vqLevel');
      await restartedRunner.waitForBlockingMigrations();
    } finally {
      firstRunner.stop();
      restartedRunner.stop();
      readLegacyEnv.mockRestore();
      vi.unstubAllEnvs();
      await MongoSystemInstanceConfig.deleteMany({});
      await MongoSystemMigrationState.deleteMany({ _id: { $in: [migration.id, cleanup.id] } });
    }
  });
});
