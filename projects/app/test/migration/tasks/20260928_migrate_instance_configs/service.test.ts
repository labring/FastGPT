import { describe, expect, it, beforeEach } from 'vitest';
import { MongoSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/schema';
import {
  applyInstanceConfigMigration,
  inspectInstanceConfigMigration
} from '@/migration/tasks/20260928_migrate_instance_configs/service';

const logger = {
  info: () => {},
  warn: () => {},
  error: () => {}
};

describe('applyInstanceConfigMigration (per-domain idempotency)', () => {
  beforeEach(async () => {
    await MongoSystemInstanceConfig.deleteMany({});
  });

  it('creates missing domains and never overwrites existing documents on rerun', async () => {
    const overrides = {
      site: { name: 'Migrated Site' },
      auth: { teamMode: 'multi' as const }
    };

    const first = await applyInstanceConfigMigration({ overrides, logger });
    expect(first.migratedCount).toBe(2);

    // 模拟管理员在首次迁移后修改了 site 配置
    await MongoSystemInstanceConfig.updateOne(
      { _id: 'site' },
      { $set: { 'overrides.name': 'Admin Edited' }, $inc: { revision: 1 } }
    );

    // 重跑：绝不覆盖已存在文档，返回值只统计真正新建的域
    const rerun = await applyInstanceConfigMigration({ overrides, logger });
    expect(rerun.migratedCount).toBe(0);
    expect(rerun.domains).toEqual([]);

    const siteDoc = await MongoSystemInstanceConfig.findById('site').lean();
    expect(siteDoc?.overrides.name).toBe('Admin Edited');
    expect(siteDoc?.revision).toBe(2);
  });

  it('backfills domains left missing by a partial write failure', async () => {
    const overrides = {
      site: { name: 'Migrated Site' },
      auth: { teamMode: 'multi' as const }
    };

    // 模拟部分写入失败：仅 site 落库
    await MongoSystemInstanceConfig.create({
      _id: 'site',
      schemaVersion: 1,
      revision: 1,
      overrides: overrides.site,
      updatedBy: { actor: 'migration' }
    });

    const inspection = await inspectInstanceConfigMigration();
    expect(inspection.existingDomainCount).toBe(1);

    // apply 按域补写缺失的 auth，而不是整体跳过
    const result = await applyInstanceConfigMigration({ overrides, logger });
    expect(result.domains).toEqual(['auth']);

    const authDoc = await MongoSystemInstanceConfig.findById('auth').lean();
    expect(authDoc?.overrides.teamMode).toBe('multi');
    expect(authDoc?.updatedBy?.actor).toBe('migration');
  });

  it('inspect reports missingDomainCount against migration target domains', async () => {
    // 测试环境变量（如 AIPROXY_API_ENDPOINT）本身也会生成 overrides，
    // 因此不假设具体域数量，只验证 missing 计数与 apply 结果的一致性。
    const before = await inspectInstanceConfigMigration();
    expect(before.existingDomainCount).toBe(0);
    const targetDomainCount = Object.keys(before.overrides).length;
    expect(targetDomainCount).toBeGreaterThan(0);
    expect(before.missingDomainCount).toBe(targetDomainCount);

    // 写入目标集合为空时 inspect 统计出的缺失域
    await applyInstanceConfigMigration({ overrides: before.overrides, logger });
    const after = await inspectInstanceConfigMigration();
    expect(after.existingDomainCount).toBe(targetDomainCount);
    expect(after.missingDomainCount).toBe(0);
  });
});
