import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { MongoSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/schema';
import {
  SYSTEM_INSTANCE_CONFIG_DOMAINS,
  resolveDomainEffectiveConfig,
  type SystemInstanceConfigDomainKey
} from '@fastgpt/global/common/system/config/schema';
import {
  applyInstanceConfigMigration,
  buildLegacyDomainOverrides,
  inspectInstanceConfigMigration,
  sanitizeOverridesForSchema,
  type SchemaSanitizedIssue
} from '@/migration/tasks/4180/20260928_migrate_instance_configs/service';
import { readLegacyInstanceConfigEnv } from '@/migration/tasks/4180/20260928_migrate_instance_configs/env';

const logger = {
  info: () => {},
  warn: () => {},
  error: () => {}
};

describe('legacy CORS allowlist migration', () => {
  beforeEach(async () => {
    await MongoSystemInstanceConfig.deleteMany({});
  });

  it.each([100, 101])(
    'preserves all %i configured origins instead of allowing every origin',
    async (count) => {
      const origins = Array.from(
        { length: count },
        (_, index) => `https://origin-${index}.example.test`
      );
      const warnings: string[] = [];
      const raw = buildLegacyDomainOverrides({
        feConfigs: {},
        systemEnv: {},
        legacyEnv: { ...readLegacyInstanceConfigEnv(), ALLOWED_ORIGINS: origins.join(',') }
      });
      const overrides = sanitizeOverridesForSchema({ overrides: raw, warnings });
      await applyInstanceConfigMigration({ overrides, logger });
      const doc = await MongoSystemInstanceConfig.findOne({ domain: 'security' }).lean();
      const effective = resolveDomainEffectiveConfig({
        domain: 'security',
        overrides: doc?.overrides
      });
      expect(effective.allowedOrigins).toEqual(origins);
      expect(warnings).toEqual([]);
    }
  );
});

describe('sanitizeOverridesForSchema', () => {
  it('drops undersized sandbox storage while keeping other values refreshable', () => {
    const warnings: string[] = [];
    const issues: SchemaSanitizedIssue[] = [];
    const overrides = sanitizeOverridesForSchema({
      overrides: {
        subservice: {
          agentSandbox: { common: { storageSizeGi: 0.1, memoryMiB: 4096 } }
        }
      },
      warnings,
      issues
    });

    expect(issues).toContainEqual({
      domain: 'subservice',
      path: 'agentSandbox.common.storageSizeGi'
    });
    expect(warnings.some((warning) => warning.includes('agentSandbox.common.storageSizeGi'))).toBe(
      true
    );
    const config = resolveDomainEffectiveConfig({
      domain: 'subservice',
      overrides: overrides.subservice
    });
    expect(config.agentSandbox.common.storageSizeGi).toBe(1);
    expect(config.agentSandbox.common.memoryMiB).toBe(4096);
  });

  it('drops values that violate the tightened schema and keeps the rest', () => {
    const warnings: string[] = [];
    const issues: SchemaSanitizedIssue[] = [];
    // maxLoginSession 收紧为 positiveInteger，历史 env 允许 0
    const result = sanitizeOverridesForSchema({
      overrides: {
        security: { maxLoginSession: 0, csrfEnabled: false }
      },
      warnings,
      issues
    });

    expect(result.security?.maxLoginSession).toBeUndefined();
    // 合法项保留
    expect(result.security?.csrfEnabled).toBe(false);
    expect(warnings.some((w) => w.includes('maxLoginSession'))).toBe(true);
    expect(issues).toContainEqual({ domain: 'security', path: 'maxLoginSession' });
  });

  it('keeps valid overrides untouched with no warnings', () => {
    const warnings: string[] = [];
    const issues: SchemaSanitizedIssue[] = [];
    const result = sanitizeOverridesForSchema({
      overrides: { security: { maxLoginSession: 20, csrfEnabled: true } },
      warnings,
      issues
    });

    expect(result.security).toEqual({ maxLoginSession: 20, csrfEnabled: true });
    expect(warnings).toEqual([]);
    expect(issues).toEqual([]);
  });

  it('resolves cross-field conflicts by dropping the offending leaf', () => {
    const warnings: string[] = [];
    const issues: SchemaSanitizedIssue[] = [];
    // performance superRefine：parallelMaxConcurrency 不得大于 maxLoopTimes。
    // maxLoopTimes=200 合法（默认并发 10 仍满足约束），仅提交的 500 越界。
    const result = sanitizeOverridesForSchema({
      overrides: {
        performance: { workflow: { maxLoopTimes: 200, parallelMaxConcurrency: 500 } }
      },
      warnings,
      issues
    });

    const workflow = (result.performance as any)?.workflow ?? {};
    expect(workflow.maxLoopTimes).toBe(200);
    // 冲突项被剔除，回落默认值，迁移不阻塞启动
    expect(workflow.parallelMaxConcurrency).toBeUndefined();
    expect(warnings.some((w) => w.includes('parallelMaxConcurrency'))).toBe(true);
    expect(issues).toContainEqual({
      domain: 'performance',
      path: 'workflow.parallelMaxConcurrency'
    });
  });

  it('reports the whole domain when no removable leaf can be located', () => {
    const warnings: string[] = [];
    const issues: SchemaSanitizedIssue[] = [];
    const result = sanitizeOverridesForSchema({
      overrides: { site: 'not-an-object' } as any,
      warnings,
      issues
    });

    expect(result.site).toBeUndefined();
    expect(issues).toEqual([{ domain: 'site' }]);
    expect(warnings.some((w) => w.includes('site'))).toBe(true);
  });
});

describe('applyInstanceConfigMigration (per-domain idempotency)', () => {
  beforeEach(async () => {
    await MongoSystemInstanceConfig.deleteMany({});
  });

  afterEach(() => vi.unstubAllEnvs());

  it('creates missing domains and never overwrites existing documents on rerun', async () => {
    const overrides = {
      site: { name: 'Migrated Site' },
      auth: { teamMode: 'multi' as const }
    };

    const first = await applyInstanceConfigMigration({ overrides, logger });
    expect(first.migratedCount).toBe(SYSTEM_INSTANCE_CONFIG_DOMAINS.length);

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

    // apply 按域补写缺失的 auth，而不是整体跳过；其余空 domain 也要初始化，满足 Pro 启动断言。
    const result = await applyInstanceConfigMigration({ overrides, logger });
    expect(result.domains).toHaveLength(SYSTEM_INSTANCE_CONFIG_DOMAINS.length - 1);
    expect(result.domains).toContain('auth');

    const authDoc = await MongoSystemInstanceConfig.findOne({ domain: 'auth' }).lean();
    expect(authDoc?.overrides.teamMode).toBe('multi');
    expect(authDoc?.updatedBy?.actor).toBe('migration');
  });

  it('inspect reports missingDomainCount against migration target domains', async () => {
    // 显式提供待迁移连接，避免测试依赖运行环境里的可选配置。
    vi.stubEnv('CODE_SANDBOX_URL', 'https://sandbox.example.test');
    const before = await inspectInstanceConfigMigration();
    expect(before.existingDomainCount).toBe(0);
    const targetDomainCount = Object.keys(before.overrides).length;
    expect(targetDomainCount).toBeGreaterThan(0);
    // 完成条件按全部 Domain 判断：没有 legacy overrides 的默认域也必须落库，
    // 否则 Pro 的 11 域启动断言会失败。
    expect(before.missingDomainCount).toBe(SYSTEM_INSTANCE_CONFIG_DOMAINS.length);

    // 写入目标集合为空时 inspect 统计出的缺失域
    await applyInstanceConfigMigration({ overrides: before.overrides, logger });
    const after = await inspectInstanceConfigMigration();
    expect(after.existingDomainCount).toBe(SYSTEM_INSTANCE_CONFIG_DOMAINS.length);
    expect(after.missingDomainCount).toBe(0);
    // 迁移写完后不应再有待补字段，否则任务每轮启动都会重复写入
    expect(after.pendingBackfillDomainCount).toBe(0);
    expect(after.pendingBackfillPaths).toEqual([]);
  });

  it('inspect reports field-level gaps inside an existing domain', async () => {
    vi.stubEnv('CODE_SANDBOX_URL', 'https://sandbox.example.test');
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
    // 该域已存在，但其余默认域仍未落库：缺失域计数覆盖全部 Domain
    expect(inspection.missingDomainCount).toBe(SYSTEM_INSTANCE_CONFIG_DOMAINS.length - 1);
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

    // site 只补缺，auth 与其他空 domain 初始化
    expect(result.createdDomains).toHaveLength(SYSTEM_INSTANCE_CONFIG_DOMAINS.length - 1);
    expect(result.createdDomains).toContain('auth');
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

    // site 无写入；其余空 domain 只做初始化，不影响该域的 revision 与幂等判定。
    expect(result.domains).toHaveLength(SYSTEM_INSTANCE_CONFIG_DOMAINS.length - 1);
    expect(result.domains).not.toContain('site');
    expect(result.backfilledPaths).toEqual([]);

    const doc = await MongoSystemInstanceConfig.findOne({ domain: 'site' }).lean();
    // 无写入就不递增 revision，避免无意义地打断管理员的乐观锁
    expect(doc?.revision).toBe(7);
    expect(doc?.overrides).toEqual({ name: 'Keep', docUrl: 'https://keep.example.com' });
  });

  it('drops conflicting leaves, backfills valid siblings, and marks skipped paths in explicitDefaultPaths', async () => {
    // 管理员既有 parallelMaxConcurrency=100（自身合法：默认 maxLoopTimes=100），
    // 待补的 maxLoopTimes=20 合并后违反 superRefine（100 > 20）；
    // 但合法的独立同胞字段 maxRunTimes=600 以及独立对象字段 parseMaxProcess=12 应正常迁入，
    // 只有真正的冲突项 maxLoopTimes 记入 explicitDefaultPaths 防死锁
    await MongoSystemInstanceConfig.create({
      domain: 'performance',
      schemaVersion: 1,
      revision: 1,
      overrides: { workflow: { parallelMaxConcurrency: 100 } }
    });

    const warn = vi.fn();
    const inspection = await inspectInstanceConfigMigration();
    const result = await applyInstanceConfigMigration({
      overrides: {
        ...inspection.overrides,
        performance: {
          ...inspection.overrides.performance,
          workflow: { maxRunTimes: 600, maxLoopTimes: 20 },
          dataset: { parseMaxProcess: 12 }
        }
      },
      logger: { ...logger, warn }
    });

    // 冲突项 maxLoopTimes 被剔除，同胞项 maxRunTimes 与独立项 parseMaxProcess 成功回填
    expect(result.backfilledDomains).toEqual(['performance']);
    expect(result.backfilledPaths).toContain('performance.workflow.maxRunTimes');
    expect(result.backfilledPaths).toContain('performance.dataset.parseMaxProcess');
    expect(result.backfilledPaths).not.toContain('performance.workflow.maxLoopTimes');
    expect(result.backfillSkippedPaths).toContain('performance.workflow.maxLoopTimes');
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('conflicts with existing values'),
      expect.objectContaining({ domain: 'performance', field: 'workflow.maxLoopTimes' })
    );

    const doc = await MongoSystemInstanceConfig.findOne({ domain: 'performance' }).lean();
    expect(doc?.overrides.workflow).toEqual({ parallelMaxConcurrency: 100, maxRunTimes: 600 });
    expect((doc?.overrides as any).dataset?.parseMaxProcess).toBe(12);
    // 冲突项被登记入 explicitDefaultPaths，同胞项绝不被误伤
    expect(doc?.explicitDefaultPaths).toContain('workflow.maxLoopTimes');
    expect(doc?.explicitDefaultPaths).not.toContain('workflow.maxRunTimes');

    // 终验：inspect 不再认为该字段缺失
    const inspect = await inspectInstanceConfigMigration();
    expect(inspect.pendingBackfillDomainCount).toBe(0);
    expect(inspect.pendingBackfillPaths).toEqual([]);
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
