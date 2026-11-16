import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { redisCacheAdapter } from '@fastgpt/dal/redis/adapter';
import { SYSTEM_INSTANCE_CONFIG_DOMAINS } from '@fastgpt/global/common/system/config/schema';
import { SystemConfigsTypeEnum } from '@fastgpt/global/common/system/config/constants';
import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import { MongoSystemConfigs } from '@fastgpt/service/common/system/config/schema';
import { MongoSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/schema';
import { decryptDomainSecrets } from '@fastgpt/service/common/system/systemInstanceConfig/secrets';
import { MongoSystemMigrationState } from '@/migration/mongoSchema';
import { resetFailedMigration } from '@/migration/entity';
import { systemMigrations, type SystemMigrationLogger } from '@/migration/registry';
import { createSystemMigrationRunner } from '@/migration/runner';
import * as legacyEnv from '@/migration/tasks/4180/20261116_migrate_system_configs/env';
import * as defaultConfig from '@/migration/tasks/4180/20261116_migrate_system_configs/defaultConfig';

// 真实事务覆盖空库初始化、跨域 HTTP 回填及 Runner 状态提交。
vi.unmock('@fastgpt/service/common/mongo/sessionRun');

const migration = systemMigrations.find(({ id }) => id === '20261116_migrate_system_configs')!;
const logger: SystemMigrationLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const timing = {
  scanIntervalMs: 50,
  heartbeatIntervalMs: 500,
  leaseDurationMs: 30_000,
  blockingPollIntervalMs: 50
};

const legacyDomain = {
  kc: { aliyun: 'legacy-kc-a', tencent: 'legacy-kc-t', volcengine: 'legacy-kc-v' },
  issuerServiceName: {
    aliyun: 'legacy-issuer-a',
    tencent: 'legacy-issuer-t',
    volcengine: 'legacy-issuer-v'
  },
  nginxServiceName: {
    aliyun: 'legacy-nginx-a',
    tencent: 'legacy-nginx-t',
    volcengine: 'legacy-nginx-v'
  }
};
const proxySecret = 'synthetic-proxy-secret-32-characters';

/** 用合成来源覆盖原先各任务所迁移的字段，避免读取真实部署变量。 */
const seedLegacySources = async () => {
  const env = {
    CSRF_ENABLED: 'false',
    CODE_SANDBOX_URL: 'https://code.example.test',
    CODE_SANDBOX_TOKEN: 'synthetic-code-token',
    SSE_MCP_SERVER_PROXY_ENDPOINT: 'https://mcp.example.test',
    AGENT_SANDBOX_PROXY_URL: 'wss://proxy.example.test',
    AGENT_SANDBOX_PREVIEW_PROXY_URL: 'https://preview.example.test',
    AGENT_SANDBOX_PROXY_SECRET: proxySecret,
    AGENT_SANDBOX_CPU_OVERCOMMIT_FACTOR: '1.5',
    AGENT_SANDBOX_MEMORY_OVERCOMMIT_FACTOR: '2',
    FILE_DOMAIN: 'https://files.example.test',
    AUTH_COOKIE_SECURE: 'true',
    SERVICE_AXIOS_MAX_CONTENT_LENGTH: '32'
  };
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);

  await MongoSystemConfigs.create([
    {
      type: SystemConfigsTypeEnum.fastgpt,
      value: {
        feConfigs: {
          systemTitle: 'Legacy Platform',
          limit: { uploadFileMaxSize: '900', exportDatasetLimitMinutes: '0.1' }
        },
        systemEnv: {
          datasetParseMaxProcess: '4',
          customPdfParse: { price: '0.5' },
          fileUrlWhitelist: ['https://cdn.example.test'],
          customDomain: legacyDomain
        }
      }
    },
    {
      type: SystemConfigsTypeEnum.fastgptPro,
      value: {
        auth: { email: { port: '2525' }, sms: { MODEL_DEPRECATION: 'LEGACY_SMS_TEMPLATE' } }
      }
    }
  ]);
};

const createRunner = (runnerId: string) =>
  createSystemMigrationRunner({ migrations: [migration], runnerId, timing, logger });

/** 有界等待后台任务持久化成功，避免失败时测试无限等待。 */
const waitForSuccess = async (runner: ReturnType<typeof createRunner>) => {
  await vi.waitFor(
    async () => {
      expect(await MongoSystemMigrationState.findById(migration.id).lean()).toMatchObject({
        status: SystemMigrationStatusEnum.succeeded
      });
    },
    { timeout: 30_000, interval: 100 }
  );
  await runner.waitForBlockingMigrations();
};

beforeEach(() => {
  // 本文件单任务执行，Redis 原子脚本统一放行；集群名额互斥由 runner.test.ts 单独覆盖。
  vi.spyOn(redisCacheAdapter, 'evalScript').mockResolvedValue(1);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** 真实 Runner 与独立 Mongo 库共同验证阶段状态、写入及接管语义。 */
describe('system configuration migration with the real runner', () => {
  it('ignores legacy Langfuse records without creating a scope', async () => {
    await seedLegacySources();
    await MongoSystemConfigs.create({
      type: SystemConfigsTypeEnum.langfuse,
      value: { secretKey: { invalidLegacyValue: true } }
    });
    const runner = createRunner('ignore-legacy-langfuse');
    try {
      await runner.start();
      await waitForSuccess(runner);
      expect(await MongoSystemInstanceConfig.findOne({ domain: 'langfuse' }).lean()).toBeNull();
    } finally {
      await runner.stop();
    }
  });
  it('chooses the same latest _id snapshot for all legacy sources regardless of createTime', async () => {
    await seedLegacySources();
    await MongoSystemInstanceConfig.create({ domain: 'vector', overrides: {}, revision: 1 });
    await MongoSystemConfigs.updateMany({}, { $set: { createTime: new Date('2030-01-01') } });
    await MongoSystemConfigs.create([
      {
        type: SystemConfigsTypeEnum.fastgpt,
        createTime: new Date('2000-01-01'),
        value: {
          feConfigs: { systemTitle: 'Latest by id' },
          systemEnv: {
            customDomain: { kc: { aliyun: 'latest-by-id-kc' } },
            langfuse: { publicKey: 'latest-public', secretKey: 'latest-secret' }
          },
          subPlans: { extraDatasetSize: { price: 7 } }
        }
      },
      {
        type: SystemConfigsTypeEnum.fastgptPro,
        createTime: new Date('2000-01-01'),
        value: { auth: { sms: { MODEL_DEPRECATION: 'LATEST_BY_ID_SMS' } } }
      }
    ]);
    const runner = createRunner('system-config-stable-source');
    try {
      await runner.start();
      await waitForSuccess(runner);
      expect(
        decryptDomainSecrets(
          'site',
          (await MongoSystemInstanceConfig.findOne({ domain: 'site' }).lean())?.overrides
        )
      ).toMatchObject({
        name: 'Latest by id',
        customDomain: { kc: { aliyun: 'latest-by-id-kc' } }
      });
      expect(
        (await MongoSystemInstanceConfig.findOne({ domain: 'auth' }).lean())?.overrides
      ).toMatchObject({
        loginProviders: { sms: { modelDeprecation: { zh: 'LATEST_BY_ID_SMS' } } }
      });
      expect(
        (await MongoSystemInstanceConfig.findOne({ domain: 'commercial' }).lean())?.overrides
          .subPlans.extraDatasetSize
      ).toEqual({ price: 7 });
      expect(await MongoSystemInstanceConfig.findOne({ domain: 'langfuse' }).lean()).toBeNull();
    } finally {
      await runner.stop();
    }
  });

  it('initializes defaultConfig before merging an older standalone plan', async () => {
    await seedLegacySources();
    await MongoSystemConfigs.create({
      type: SystemConfigsTypeEnum.subPlans,
      value: { extraDatasetSize: { price: 99 } }
    });
    vi.spyOn(defaultConfig, 'readDefaultInstanceConfig').mockResolvedValue({
      site: { docUrl: 'https://file-docs.example.test' },
      commercial: {
        payment: { wx: { appId: 'file-payment' } },
        subPlans: { extraDatasetSize: { price: 12 } }
      }
    });
    const runner = createRunner('system-config-file-before-plan');
    try {
      await runner.start();
      await waitForSuccess(runner);
      expect(
        (await MongoSystemInstanceConfig.findOne({ domain: 'site' }).lean())?.overrides
      ).toMatchObject({
        docUrl: 'https://file-docs.example.test'
      });
      expect(
        (await MongoSystemInstanceConfig.findOne({ domain: 'commercial' }).lean())?.overrides
      ).toMatchObject({
        payment: { wx: { appId: 'file-payment' } },
        subPlans: { extraDatasetSize: { price: 12 } }
      });
    } finally {
      await runner.stop();
    }
  });

  it('cleans obsolete commercial fields before validating and merging plans', async () => {
    await seedLegacySources();
    await MongoSystemConfigs.create({
      type: SystemConfigsTypeEnum.subPlans,
      value: { extraDatasetSize: { price: 7 } }
    });
    await MongoSystemInstanceConfig.create({
      domain: 'commercial',
      overrides: { showCoupon: true },
      revision: 1
    });
    await MongoSystemInstanceConfig.collection.updateOne(
      { domain: 'commercial' },
      { $set: { 'overrides.agentSandboxFreeTip': true } }
    );
    const runner = createRunner('system-config-cleanup-before-plan');
    try {
      await runner.start();
      await waitForSuccess(runner);
      const commercial = await MongoSystemInstanceConfig.findOne({ domain: 'commercial' }).lean();
      expect(commercial?.overrides).toMatchObject({
        showCoupon: true,
        subPlans: { extraDatasetSize: { price: 7 } }
      });
      expect(commercial?.overrides).not.toHaveProperty('agentSandboxFreeTip');
      expect(
        (await MongoSystemMigrationState.findById(migration.id).lean())?.progress?.find(
          ({ key }) => key === 'backfill'
        )
      ).toMatchObject({ current: 10, total: 10 });
    } finally {
      await runner.stop();
    }
  });

  it('migrates all supplemental configuration once and ignores ENV changes after success', async () => {
    await seedLegacySources();
    // 部分已有文档意味着必须补建缺失域，而不能把集合非空视为迁移完成。
    await MongoSystemInstanceConfig.create({ domain: 'vector', overrides: {}, revision: 1 });
    await MongoSystemInstanceConfig.collection.updateOne(
      { domain: 'vector' },
      { $set: { 'overrides.vqLevel': 32 } }
    );
    const readLegacyEnv = vi.spyOn(legacyEnv, 'readLegacyInstanceConfigEnv');
    const first = createRunner('system-config-initial');
    const restarted = createRunner('system-config-restarted');

    try {
      await first.start();
      await waitForSuccess(first);

      const state = await MongoSystemMigrationState.findById(migration.id).lean();
      expect(state?.status).toBe(SystemMigrationStatusEnum.succeeded);
      expect(state?.progress?.map(({ key, status }) => [key, status])).toEqual(
        ['inspect', 'migrate', 'cleanup', 'backfill', 'validate'].map((key) => [
          key,
          SystemMigrationStatusEnum.succeeded
        ])
      );
      expect(await MongoSystemInstanceConfig.countDocuments()).toBe(
        SYSTEM_INSTANCE_CONFIG_DOMAINS.length
      );

      const docs = await MongoSystemInstanceConfig.find({}).sort({ domain: 1 }).lean();
      const doc = (domain: string) => docs.find((item) => item.domain === domain);
      // 原始旧库字符串经过完整 Runner 后必须以 number 落库，而不是被静默丢弃。
      expect(doc('performance')?.overrides.dataset.parseMaxProcess).toBe(4);
      expect(doc('resource')?.overrides).toMatchObject({
        uploadFileMaxSize: 900,
        exportDatasetLimitMinutes: 0.1
      });
      expect(doc('providers')?.overrides.documentParse.customPdf.price).toBe(0.5);
      expect(doc('auth')?.overrides.loginProviders.email.port).toBe(2525);
      expect(decryptDomainSecrets('site', doc('site')?.overrides)).toMatchObject({
        name: 'Legacy Platform',
        customDomain: legacyDomain
      });
      expect(doc('auth')?.overrides).toMatchObject({
        loginProviders: { sms: { modelDeprecation: { zh: 'LEGACY_SMS_TEMPLATE' } } }
      });
      expect(doc('security')?.overrides).toMatchObject({
        csrfEnabled: false,
        fileUrlWhitelist: ['https://cdn.example.test'],
        checkExternalFile: true,
        authCookieSecure: true
      });
      expect(doc('resource')?.overrides).toMatchObject({ serviceAxiosMaxContentLength: 32 });
      expect(doc('storage')?.overrides).toMatchObject({ fileDomain: 'https://files.example.test' });
      expect(decryptDomainSecrets('subservice', doc('subservice')?.overrides)).toMatchObject({
        codeSandbox: {
          enabled: true,
          url: 'https://code.example.test',
          token: 'synthetic-code-token'
        },
        mcp: { enabled: true, sseProxyUrl: 'https://mcp.example.test' },
        agentSandbox: {
          proxy: {
            wsUrl: 'wss://proxy.example.test',
            previewUrl: 'https://preview.example.test',
            secret: proxySecret
          },
          opensandbox: { cpuOvercommitFactor: 1.5, memoryOvercommitFactor: 2 }
        }
      });
      expect(doc('vector')?.overrides).not.toHaveProperty('vqLevel');
      expect(readLegacyEnv).toHaveBeenCalled();

      first.stop();
      readLegacyEnv.mockClear();
      vi.stubEnv('CSRF_ENABLED', 'true');
      vi.stubEnv('WORKFLOW_MAX_RUN_TIMES', 'invalid');
      vi.stubEnv('FILE_DOMAIN', 'https://changed.example.test');
      await restarted.start();
      await waitForSuccess(restarted);
      await restarted.tick();

      expect(readLegacyEnv).not.toHaveBeenCalled();
      expect(
        (await MongoSystemMigrationState.findById(migration.id).lean())?.lastStartedAt
      ).toEqual(state?.lastStartedAt);
      expect(await MongoSystemInstanceConfig.find({}).sort({ domain: 1 }).lean()).toEqual(docs);
    } finally {
      first.stop();
      restarted.stop();
    }
  });

  it('allows startup before migration and retries background failure without overwriting administrator values', async () => {
    await seedLegacySources();
    vi.stubEnv('FILE_DOMAIN', 'not a valid url');
    const failedOwner = createRunner('system-config-failed-owner');
    const retry = createRunner('system-config-retry');

    try {
      await failedOwner.start();
      expect(failedOwner.hasBlockingMigrations).toBe(false);
      await failedOwner.waitForBlockingMigrations();
      await vi.waitFor(
        async () => {
          expect(await MongoSystemMigrationState.findById(migration.id).lean()).toMatchObject({
            status: SystemMigrationStatusEnum.failed,
            lastError: { stageKey: 'backfill' }
          });
        },
        { timeout: 30_000, interval: 100 }
      );
      await failedOwner.waitForBlockingMigrations();
      const failed = await MongoSystemMigrationState.findById(migration.id).lean();
      expect(failed?.progress?.find(({ key }) => key === 'backfill')?.status).toBe(
        SystemMigrationStatusEnum.failed
      );
      expect(failed?.progress?.find(({ key }) => key === 'validate')).toBeUndefined();

      failedOwner.stop();
      await failedOwner.tick();
      await MongoSystemInstanceConfig.updateOne(
        { domain: 'site' },
        {
          $set: { 'overrides.customDomain.issuerServiceName.aliyun': 'ADMIN_ISSUER' },
          $addToSet: { explicitDefaultPaths: 'customDomain.kc.aliyun' },
          $unset: { 'overrides.customDomain.kc.aliyun': '' },
          $inc: { revision: 1 }
        }
      );
      await MongoSystemInstanceConfig.updateOne(
        { domain: 'subservice' },
        {
          $set: { 'overrides.agentSandbox.proxy.wsUrl': 'wss://admin.example.test' },
          $inc: { revision: 1 }
        }
      );
      vi.stubEnv('FILE_DOMAIN', 'https://files.example.test');
      vi.stubEnv('AGENT_SANDBOX_PROXY_URL', 'wss://changed.example.test');
      // 独立后台任务失败后由管理员重置再执行，无需等待失败 lease 过期。
      expect(await resetFailedMigration(migration.id)).toBe(true);
      await retry.start();
      await waitForSuccess(retry);

      const site = await MongoSystemInstanceConfig.findOne({ domain: 'site' }).lean();
      const subservice = await MongoSystemInstanceConfig.findOne({ domain: 'subservice' }).lean();
      expect(site?.overrides.customDomain.issuerServiceName.aliyun).toBe('ADMIN_ISSUER');
      expect(site?.overrides.customDomain.kc?.aliyun).toBeUndefined();
      expect(site?.explicitDefaultPaths).toContain('customDomain.kc.aliyun');
      expect(subservice?.overrides.agentSandbox.proxy.wsUrl).toBe('wss://admin.example.test');
      expect(
        (await MongoSystemInstanceConfig.findOne({ domain: 'storage' }).lean())?.overrides
      ).toMatchObject({ fileDomain: 'https://files.example.test' });
      expect(await MongoSystemMigrationState.findById(migration.id).lean()).toMatchObject({
        status: SystemMigrationStatusEnum.succeeded
      });
    } finally {
      failedOwner.stop();
      retry.stop();
    }
  });
});
