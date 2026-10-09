import { describe, expect, it, beforeEach } from 'vitest';
import { MongoSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/schema';
import {
  applyInstanceConfigMigration,
  inspectInstanceConfigMigration,
  sanitizeOverridesForSchema
} from '@/migration/tasks/4180/20260928_migrate_instance_configs/service';

const logger = {
  info: () => {},
  warn: () => {},
  error: () => {}
};

describe('sanitizeOverridesForSchema', () => {
  it('drops values that violate the tightened schema and keeps the rest', () => {
    const warnings: string[] = [];
    // maxLoginSession 收紧为 positiveInteger，历史 env 允许 0
    const result = sanitizeOverridesForSchema({
      overrides: {
        security: { maxLoginSession: 0, csrfEnabled: false }
      },
      warnings
    });

    expect(result.security?.maxLoginSession).toBeUndefined();
    // 合法项保留
    expect(result.security?.csrfEnabled).toBe(false);
    expect(warnings.some((w) => w.includes('maxLoginSession'))).toBe(true);
  });

  it('keeps valid overrides untouched with no warnings', () => {
    const warnings: string[] = [];
    const result = sanitizeOverridesForSchema({
      overrides: { security: { maxLoginSession: 20, csrfEnabled: true } },
      warnings
    });

    expect(result.security).toEqual({ maxLoginSession: 20, csrfEnabled: true });
    expect(warnings).toEqual([]);
  });

  it('resolves cross-field conflicts by dropping the offending leaf', () => {
    const warnings: string[] = [];
    // performance superRefine：parallelMaxConcurrency 不得大于 maxLoopTimes。
    // maxLoopTimes=200 合法（默认并发 10 仍满足约束），仅提交的 500 越界。
    const result = sanitizeOverridesForSchema({
      overrides: {
        performance: { workflow: { maxLoopTimes: 200, parallelMaxConcurrency: 500 } }
      },
      warnings
    });

    const workflow = (result.performance as any)?.workflow ?? {};
    expect(workflow.maxLoopTimes).toBe(200);
    // 冲突项被剔除，回落默认值，迁移不阻塞启动
    expect(workflow.parallelMaxConcurrency).toBeUndefined();
    expect(warnings.some((w) => w.includes('parallelMaxConcurrency'))).toBe(true);
  });
});

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
