import { describe, expect, it, beforeEach, vi } from 'vitest';
import { MongoSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/schema';
import type { SystemInstanceConfigDomainKey } from '@fastgpt/global/common/system/config/schema';
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
      { domain: 'site' },
      { $set: { 'overrides.name': 'Admin Edited' }, $inc: { revision: 1 } }
    );

    // 重跑：绝不覆盖已存在文档，返回值只统计真正新建的域
    const rerun = await applyInstanceConfigMigration({ overrides, logger });
    expect(rerun.migratedCount).toBe(0);
    expect(rerun.domains).toEqual([]);

    const siteDoc = await MongoSystemInstanceConfig.findOne({ domain: 'site' }).lean();
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
      domain: 'site',
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

    const authDoc = await MongoSystemInstanceConfig.findOne({ domain: 'auth' }).lean();
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
    // 迁移写完后不应再有待补字段，否则任务每轮启动都会重复写入
    expect(after.pendingBackfillDomainCount).toBe(0);
    expect(after.pendingBackfillPaths).toEqual([]);
  });

  it('inspect reports field-level gaps inside an existing domain', async () => {
    const target = await inspectInstanceConfigMigration();
    const [domain] = Object.keys(target.overrides) as SystemInstanceConfigDomainKey[];
    expect(domain).toBeDefined();

    // 该域已落库但 overrides 为空：客户已配置的环境变量还没进库
    await MongoSystemInstanceConfig.create({
      domain,
      schemaVersion: 1,
      revision: 1,
      overrides: {}
    });

    const inspection = await inspectInstanceConfigMigration();
    // 整域存在，因此不计入 missingDomainCount，但缺字段要单独暴露给任务停止跳过
    expect(inspection.missingDomainCount).toBe(0);
    expect(inspection.pendingBackfillDomainCount).toBe(1);
    expect(inspection.pendingBackfillPaths.length).toBeGreaterThan(0);
    expect(inspection.pendingBackfillPaths.every((path) => path.startsWith(`${domain}.`))).toBe(
      true
    );
  });
});

describe('applyInstanceConfigMigration (field-level backfill)', () => {
  beforeEach(async () => {
    await MongoSystemInstanceConfig.deleteMany({});
  });

  it('backfills only missing fields into an existing domain and keeps existing values', async () => {
    await MongoSystemInstanceConfig.create({
      domain: 'site',
      schemaVersion: 1,
      revision: 1,
      overrides: { name: 'Admin Site', favicon: '/admin.ico' },
      updatedBy: { actor: 'admin' }
    });

    const result = await applyInstanceConfigMigration({
      overrides: {
        site: { name: 'Env Site', favicon: '/env.ico', docUrl: 'https://env.example.com' },
        auth: { teamMode: 'multi' }
      },
      logger
    });

    // site 只补缺，auth 整域新建
    expect(result.createdDomains).toEqual(['auth']);
    expect(result.backfilledDomains).toEqual(['site']);
    expect(result.backfilledPaths).toEqual(['site.docUrl']);

    const siteDoc = await MongoSystemInstanceConfig.findOne({ domain: 'site' }).lean();
    expect(siteDoc?.overrides).toEqual({
      name: 'Admin Site',
      favicon: '/admin.ico',
      docUrl: 'https://env.example.com'
    });
    expect(siteDoc?.revision).toBe(2);
    // 回填不抢署名：该域最后仍是管理员保存的
    expect(siteDoc?.updatedBy?.actor).toBe('admin');
  });

  it('backfills nested missing leaves and treats arrays as atomic values', async () => {
    await MongoSystemInstanceConfig.create({
      domain: 'security',
      schemaVersion: 1,
      revision: 1,
      overrides: { censor: { baiduClientId: 'admin-id' }, fileUrlWhitelist: [] }
    });

    await applyInstanceConfigMigration({
      overrides: {
        security: {
          censor: { baiduClientId: 'env-id', customCensorUrl: 'https://censor.example.com' },
          fileUrlWhitelist: ['https://cdn.example.com'],
          skipFileTypeCheck: true
        }
      },
      logger
    });

    const doc = await MongoSystemInstanceConfig.findOne({ domain: 'security' }).lean();
    // 嵌套对象逐叶子补缺：已有叶子保持原值，缺失叶子补写
    expect(doc?.overrides.censor).toEqual({
      baiduClientId: 'admin-id',
      customCensorUrl: 'https://censor.example.com'
    });
    // 数组按原子值处理：管理员显式清空后不会被迁移重新填回
    expect(doc?.overrides.fileUrlWhitelist).toEqual([]);
    expect(doc?.overrides.skipFileTypeCheck).toBe(true);
  });

  it('does not touch a domain when nothing is missing (no revision bump)', async () => {
    await MongoSystemInstanceConfig.create({
      domain: 'site',
      schemaVersion: 1,
      revision: 7,
      overrides: { name: 'Keep', docUrl: 'https://keep.example.com' }
    });

    const result = await applyInstanceConfigMigration({
      overrides: { site: { name: 'Env', docUrl: 'https://env.example.com' } },
      logger
    });

    expect(result.domains).toEqual([]);
    expect(result.backfilledPaths).toEqual([]);

    const doc = await MongoSystemInstanceConfig.findOne({ domain: 'site' }).lean();
    // 无写入就不递增 revision，避免无意义地打断管理员的乐观锁
    expect(doc?.revision).toBe(7);
    expect(doc?.overrides).toEqual({ name: 'Keep', docUrl: 'https://keep.example.com' });
  });

  it('skips backfill and warns when merged values break a cross-field constraint', async () => {
    // 管理员既有 parallelMaxConcurrency=100（自身合法：默认 maxLoopTimes=100），
    // 待补的 maxLoopTimes=20 合并后违反 superRefine（100 > 20）
    await MongoSystemInstanceConfig.create({
      domain: 'performance',
      schemaVersion: 1,
      revision: 1,
      overrides: { workflow: { parallelMaxConcurrency: 100 } }
    });

    const warn = vi.fn();
    const result = await applyInstanceConfigMigration({
      overrides: { performance: { workflow: { maxLoopTimes: 20 } } },
      logger: { ...logger, warn }
    });

    // 无法在不改管理员值的前提下消解冲突：跳过该域回填、告警，但不抛错阻塞启动
    expect(result.backfilledDomains).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('conflict with existing values'),
      expect.objectContaining({ domain: 'performance' })
    );

    const doc = await MongoSystemInstanceConfig.findOne({ domain: 'performance' }).lean();
    expect(doc?.overrides.workflow).toEqual({ parallelMaxConcurrency: 100 });
  });

  it('is idempotent: rerunning after a backfill writes nothing', async () => {
    await MongoSystemInstanceConfig.create({
      domain: 'site',
      schemaVersion: 1,
      revision: 1,
      overrides: { name: 'Admin' }
    });

    const first = await applyInstanceConfigMigration({
      overrides: { site: { name: 'Env', docUrl: 'https://env.example.com' } },
      logger
    });
    expect(first.backfilledDomains).toEqual(['site']);

    const afterFirst = await MongoSystemInstanceConfig.findOne({ domain: 'site' }).lean();
    const second = await applyInstanceConfigMigration({
      overrides: { site: { name: 'Env', docUrl: 'https://env.example.com' } },
      logger
    });

    expect(second.domains).toEqual([]);
    const afterSecond = await MongoSystemInstanceConfig.findOne({ domain: 'site' }).lean();
    expect(afterSecond?.revision).toBe(afterFirst?.revision);
    expect(afterSecond?.overrides).toEqual(afterFirst?.overrides);
  });
});
