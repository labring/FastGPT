import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { redisCacheAdapter } from '@fastgpt/dal/redis/adapter';
import { SYSTEM_INSTANCE_CONFIG_DOMAINS } from '@fastgpt/global/common/system/config/schema';
import { SystemConfigsTypeEnum } from '@fastgpt/global/common/system/config/constants';
import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import { MongoSystemConfigs } from '@fastgpt/service/common/system/config/schema';
import { MongoSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/schema';
import { decryptDomainSecrets } from '@fastgpt/service/common/system/systemInstanceConfig/secrets';
import { systemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/service';
import { getSystemConfigRuntimeState } from '@fastgpt/service/common/system/systemInstanceConfig/runtime';
import { validateFileUrlDomain } from '@fastgpt/service/common/security/fileUrlValidator';
import { passwordVerificationService } from '@fastgpt/service/support/user/account/verification/password/service';
import { resolveAllowedOrigins } from '@fastgpt/global/common/system/config/security';
import {
  getModelStatusProbeConfig,
  updateModelStatusProbeConfig
} from '@fastgpt/service/core/ai/modelStatus/service';
import { SecurityConfigSchema } from '@fastgpt/global/common/system/config/schemas/security';
import { ModelStatusProbeConfigSchema } from '@fastgpt/global/common/system/config/modelStatus';
import { MongoSystemMigrationState } from '@/migration/mongoSchema';
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
        auth: {
          email: { port: '2525', secure: 0, register: 1 },
          sms: { MODEL_DEPRECATION: 'LEGACY_SMS_TEMPLATE' }
        }
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
      const state = await MongoSystemMigrationState.findById(migration.id).lean();
      if (state?.status === SystemMigrationStatusEnum.failed) {
        throw new Error(
          `Migration failed unexpectedly at ${state.lastError?.stageKey}: ${state.lastError?.message}`
        );
      }
      expect(state).toMatchObject({
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
      expect(doc('auth')?.overrides.loginProviders.email).toMatchObject({
        port: 2525,
        secure: false,
        register: true
      });
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

  it('migrates anomalous legacy values and lets a commercial administrator read and repair security', async () => {
    await seedLegacySources();
    const token = 't'.repeat(2049);
    expect(ModelStatusProbeConfigSchema.shape.webhookToken.safeParse(token).success).toBe(false);
    await MongoSystemConfigs.create({
      type: SystemConfigsTypeEnum.modelStatusProbe,
      value: { enabled: false, webhookToken: token }
    });
    const damaged = await MongoSystemInstanceConfig.collection.insertOne({
      domain: 'security',
      schemaVersion: 1,
      revision: 7,
      explicitDefaultPaths: ['useIpLimit'],
      overrides: null as unknown as Record<string, unknown>
    });

    const runner = createRunner('system-config-damaged-security');
    const state = getSystemConfigRuntimeState();
    const previousContext = state.frontendContext;
    const { setCookie } = await vi.importActual<
      typeof import('@fastgpt/service/support/permission/auth/common')
    >('@fastgpt/service/support/permission/auth/common');
    try {
      await runner.start();
      await waitForSuccess(runner);

      const stored = await MongoSystemInstanceConfig.collection.findOne({
        _id: damaged.insertedId
      });
      expect(stored).toMatchObject({ overrides: null, revision: 8, explicitDefaultPaths: [] });
      const credential = await MongoSystemInstanceConfig.findOne({
        domain: 'modelStatusProbe'
      }).lean();
      expect(typeof credential?.overrides.webhookToken?.secret).toBe('string');
      expect(
        decryptDomainSecrets('modelStatusProbe', credential?.overrides).webhookToken === token
      ).toBe(true);
      expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toContain(token);

      systemInstanceConfig.setFrontendContext({ commercialService: true });
      const snapshot = await systemInstanceConfig.refresh();
      expect(snapshot.modelStatusProbe.webhookToken === token).toBe(true);
      expect(await getModelStatusProbeConfig()).toEqual({
        enabled: false,
        intervalMinutes: 5,
        webhookTokenConfigured: true
      });
      await expect(
        updateModelStatusProbeConfig({
          enabled: false,
          intervalMinutes: 5,
          clearWebhookToken: false,
          webhookToken: 'replacement-token'
        })
      ).resolves.toEqual({ enabled: false, intervalMinutes: 5, webhookTokenConfigured: true });
      expect(systemInstanceConfig.get().modelStatusProbe.webhookToken).toBe('replacement-token');
      expect(snapshot.security.passwordLoginMinuteLimitCount).toBe(
        SecurityConfigSchema.shape.passwordLoginMinuteLimitCount.parse(undefined)
      );
      expect(snapshot.security.csrfEnabled).toBe(true);
      expect(
        resolveAllowedOrigins({
          enabled: snapshot.security.allowedOriginsEnabled,
          origins: snapshot.security.allowedOrigins
        })
      ).toEqual([]);
      expect(validateFileUrlDomain('https://files.example.test/file.txt')).toBe(false);
      await expect(
        passwordVerificationService.issuePreLoginCode({
          username: 'root',
          purpose: 'login'
        })
      ).resolves.toEqual({ code: expect.any(String) });
      const setHeader = vi.fn();
      setCookie({ setHeader } as unknown as Parameters<typeof setCookie>[0], 'test-session');
      expect(setHeader).toHaveBeenCalledWith('Set-Cookie', expect.stringContaining('HttpOnly'));

      const view = await systemInstanceConfig.readForEdit('security', 'pro');
      const site = await systemInstanceConfig.readForEdit('site');
      expect(view).toMatchObject({ overrides: {}, revision: 8 });
      await expect(
        systemInstanceConfig.update({
          items: [
            { domain: 'site', expectedRevision: site.revision, overrides: { name: 'uncommitted' } },
            { domain: 'security', expectedRevision: view.revision, overrides: { csrfEnabled: 0 } }
          ],
          actor: { actor: 'admin' }
        })
      ).rejects.toMatchObject({
        cause: { issues: [expect.objectContaining({ path: ['security', 'csrfEnabled'] })] }
      });
      expect(
        await MongoSystemInstanceConfig.collection.findOne({ _id: damaged.insertedId })
      ).toEqual(stored);
      expect(await systemInstanceConfig.readForEdit('site')).toEqual(site);

      await systemInstanceConfig.update({
        items: [
          {
            domain: 'security',
            expectedRevision: view.revision,
            overrides: {
              csrfEnabled: true,
              checkExternalFile: true,
              fileUrlWhitelist: ['files.example.test']
            }
          }
        ],
        actor: { actor: 'admin' }
      });
      expect(await systemInstanceConfig.readForEdit('security', 'pro')).toMatchObject({
        revision: 9,
        effectiveConfig: { csrfEnabled: true, fileUrlWhitelist: ['files.example.test'] }
      });
      await systemInstanceConfig.refresh();
      expect(validateFileUrlDomain('https://files.example.test/file.txt')).toBe(true);
    } finally {
      state.frontendContext = previousContext;
      await runner.stop();
    }
  });

  it('blocks startup on migration failure and preserves administrator values after owner restart', async () => {
    await seedLegacySources();
    const collection = MongoSystemInstanceConfig.collection;
    const updateOne = collection.updateOne.bind(collection);
    const backfillFailure = vi
      .spyOn(collection, 'updateOne')
      .mockImplementation(async (filter, update, options) => {
        if ((filter as any).domain === 'storage') {
          throw new Error('Synthetic database failure');
        }
        return updateOne(filter, update, options);
      });
    const failedOwner = createRunner('system-config-failed-owner');
    const retry = createRunner('system-config-retry');
    const startupReady = vi.fn();
    let startupWait: Promise<PromiseSettledResult<void>[]> | undefined;

    try {
      await failedOwner.start();
      expect(failedOwner.hasBlockingMigrations).toBe(true);
      startupWait = Promise.allSettled([
        failedOwner.waitForBlockingMigrations().then(startupReady)
      ]);
      await vi.waitFor(
        async () => {
          expect(await MongoSystemMigrationState.findById(migration.id).lean()).toMatchObject({
            status: SystemMigrationStatusEnum.failed,
            lastError: { stageKey: expect.any(String) }
          });
        },
        { timeout: 30_000, interval: 100 }
      );
      expect(startupReady).not.toHaveBeenCalled();
      expect(() => failedOwner.startBackgroundMigrations()).toThrow(
        'Startup migrations have not completed'
      );
      const failed = await MongoSystemMigrationState.findById(migration.id).lean();
      expect(failed?.lastError?.message).toContain('Synthetic database failure');
      backfillFailure.mockRestore();
      expect(failed?.progress?.find(({ key }) => key === 'validate')).toBeUndefined();

      failedOwner.stop();
      await failedOwner.tick();
      expect((await startupWait)[0].status).toBe('rejected');
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
      // 启动失败保留 lease；停止旧 owner 后模拟租约到期，由重启节点接管原任务。
      await MongoSystemMigrationState.updateOne(
        { _id: migration.id },
        { $set: { leaseExpireAt: new Date(0) } }
      );
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
      backfillFailure.mockRestore();
      failedOwner.stop();
      retry.stop();
      await failedOwner.tick();
      await startupWait;
    }
  });

  it('migrates 4.17 env with enabled agentSandbox without dropping subservice before proxy backfill', async () => {
    await seedLegacySources();
    vi.stubEnv('AGENT_SANDBOX_PROVIDER', 'opensandbox');
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_BASEURL', 'https://sandbox.example.test');
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_API_KEY', 'opensandbox-api-key');
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_IMAGE', 'fastgpt-agent-sandbox:latest');
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_URL', 'https://volume.example.test');
    const runner = createRunner('system-config-417-enabled-sandbox');
    try {
      await runner.start();
      await waitForSuccess(runner);
      const subservice = await MongoSystemInstanceConfig.findOne({ domain: 'subservice' }).lean();
      expect(decryptDomainSecrets('subservice', subservice?.overrides)).toMatchObject({
        agentSandbox: {
          enabled: true,
          opensandbox: { baseUrl: 'https://sandbox.example.test' },
          proxy: {
            wsUrl: 'wss://proxy.example.test',
            previewUrl: 'https://preview.example.test',
            secret: proxySecret
          }
        }
      });
    } finally {
      runner.stop();
      await runner.tick();
    }
  });

  it('migrates existing pre-proxy subservice with enabled sandbox and deprecated fields', async () => {
    await seedLegacySources();
    await MongoSystemInstanceConfig.collection.insertOne({
      domain: 'subservice',
      schemaVersion: 1,
      revision: 6,
      overrides: {
        plugin: { remoteDebug: true },
        agentSandbox: {
          enabled: true,
          opensandbox: { baseUrl: 'https://sandbox.example.test' },
          common: { entrypointTimeoutSeconds: 15 }
        }
      },
      explicitDefaultPaths: []
    });
    const runner = createRunner('system-config-existing-enabled-sandbox');
    try {
      await runner.start();
      await waitForSuccess(runner);
      const subservice = await MongoSystemInstanceConfig.findOne({ domain: 'subservice' }).lean();
      expect(subservice?.overrides).not.toHaveProperty('plugin');
      expect(decryptDomainSecrets('subservice', subservice?.overrides)).toMatchObject({
        codeSandbox: {
          enabled: true,
          url: 'https://code.example.test',
          token: 'synthetic-code-token'
        },
        agentSandbox: {
          enabled: true,
          opensandbox: { baseUrl: 'https://sandbox.example.test' },
          proxy: {
            wsUrl: 'wss://proxy.example.test',
            previewUrl: 'https://preview.example.test',
            secret: proxySecret
          }
        }
      });
    } finally {
      runner.stop();
      await runner.tick();
    }
  });
});
