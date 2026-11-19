import { setTestLicenseActive } from '@test/utils/instanceConfigSnapshot';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  postHealth: vi.fn(),
  exit: vi.fn(() => {
    throw new Error('App exited before readiness');
  }),
  watch: vi.fn(),
  configPolling: vi.fn(),
  workers: vi.fn(),
  cron: vi.fn(),
  training: vi.fn(),
  tracks: vi.fn(),
  loadModels: vi.fn(),
  reloadModels: vi.fn(),
  getInitConfig: vi.fn(),
  actualGetInitConfig: undefined as undefined | ((options?: any) => Promise<void>)
}));

// 隔离外部依赖和消费者；启动编排、迁移 runner 与 MongoDB 事务使用实际实现。
vi.mock('process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('process')>()),
  exit: mocks.exit
}));
vi.unmock('@fastgpt/service/common/mongo/sessionRun');
vi.mock('@fastgpt/service/common/proxy', () => ({}));
vi.mock('@fastgpt/service/thirdProvider/fastgptPro/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/thirdProvider/fastgptPro/api')>()),
  postHealth: mocks.postHealth
}));
vi.mock('@/service/common/system', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/service/common/system')>();
  mocks.actualGetInitConfig = actual.getInitConfig;
  return {
    ...actual,
    getInitConfig: mocks.getInitConfig,
    initSystemPluginTags: vi.fn(),
    initAppTemplateTypes: vi.fn()
  };
});
vi.mock('@fastgpt/service/common/system/tools', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/common/system/tools')>()),
  systemStartCb: vi.fn()
}));
vi.mock('@fastgpt/service/common/vectorDB/controller', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/common/vectorDB/controller')>()),
  initVectorStore: vi.fn()
}));
vi.mock('@fastgpt/service/support/user/systemUser', () => ({ initSystemUser: vi.fn() }));
vi.mock('@fastgpt/service/core/ai/model/catalog/service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/ai/model/catalog/service')>()),
  loadSystemModels: mocks.loadModels,
  loadInstalledModels: mocks.reloadModels
}));
vi.mock('@fastgpt/service/core/ai/model/template', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/ai/model/template')>()),
  getPluginModelDocuments: vi.fn(async () => [])
}));
vi.mock('@fastgpt/service/core/ai/model/provider/controller', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/ai/model/provider/controller')>()),
  preloadModelProviders: vi.fn()
}));
vi.mock('@fastgpt/service/thirdProvider/fastgptPlugin/model', () => ({
  loadModelProviders: vi.fn()
}));
vi.mock('@fastgpt/service/thirdProvider/codeSandbox', () => ({
  codeSandbox: { runCode: vi.fn() },
  isCodeSandboxConfigured: vi.fn(() => false)
}));
vi.mock('@fastgpt/dal/redis', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/dal/redis')>()),
  checkRedisHealth: vi.fn()
}));
vi.mock('@fastgpt/service/common/s3', async () => {
  const { S3Buckets } = await import('@fastgpt/service/common/s3/config/constants');
  const { S3PublicBucket } = await import('@fastgpt/service/common/s3/buckets/public');
  const { S3PrivateBucket } = await import('@fastgpt/service/common/s3/buckets/private');
  return {
    initS3Buckets: vi.fn(() => {
      global.s3BucketMap = {
        [S3Buckets.public]: Object.assign(new S3PublicBucket(), { checkBucketHealth: vi.fn() }),
        [S3Buckets.private]: Object.assign(new S3PrivateBucket(), { checkBucketHealth: vi.fn() })
      };
    })
  };
});
vi.mock('@/service/common/system/sync', () => ({ startSystemSync: mocks.watch }));
vi.mock('@/service/common/system/configPolling', () => ({
  startAppConfigPolling: mocks.configPolling
}));
vi.mock('@/service/common/bullmq', () => ({ initBullMQWorkers: mocks.workers }));
vi.mock('@/service/common/system/cron', () => ({ startCron: mocks.cron }));
vi.mock('@/service/core/dataset/training/utils', () => ({ startTrainingQueue: mocks.training }));
vi.mock('@fastgpt/service/common/middle/tracks/processor', () => ({
  trackTimerProcess: mocks.tracks
}));
vi.mock('@fastgpt/service/worker/preload', () => ({ preLoadWorker: vi.fn() }));
vi.mock('@fastgpt/service/common/geo', () => ({ initGeo: vi.fn() }));
vi.mock('@fastgpt/service/common/tracing', () => ({ configureTracing: vi.fn() }));
vi.mock('@fastgpt/service/common/metrics', () => ({
  configureMetrics: vi.fn(),
  createRedisRuntimeMetrics: vi.fn()
}));

import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoAIModel } from '@fastgpt/service/core/ai/model/schema';
import { formatDbModelToRuntimeModel } from '@fastgpt/service/core/ai/model/runtime';
import { Types } from '@fastgpt/service/common/mongo';
import { redisCacheAdapter } from '@fastgpt/dal/redis/adapter';
import { registerNodeInstrumentation } from '@/instrumentation-node';
import { MongoSystemMigrationState } from '@/migration/mongoSchema';
import { MongoSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/schema';
import { getSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/runtime';
import { FastGPTPluginClient } from '@fastgpt/global/sdk/fastgpt-plugin';

afterEach(async () => {
  const runner = global.systemMigrationRunner;
  runner?.stop();
  await runner?.tick();
  global.systemMigrationRunner = undefined;
  mocks.getInitConfig.mockReset();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('registerNodeInstrumentation', () => {
  it('ignores retired migration failures and starts business while current background work runs', async () => {
    vi.clearAllMocks();
    mocks.postHealth.mockResolvedValue({ auth: true, data: 'success' });
    setTestLicenseActive(true);
    const migrationId = '20261104_backfill_chat_publish_source';
    const legacyMigrationId = '20260903_migrate_legacy_system_models';
    await MongoSystemMigrationState.insertMany([
      {
        _id: legacyMigrationId,
        status: SystemMigrationStatusEnum.failed,
        checkpoint: { retired: true }
      },
      {
        _id: '20261022_initialize_dataset_vector_indexes',
        status: SystemMigrationStatusEnum.succeeded
      },
      {
        _id: '20261112_backfill_stt_pricing_type',
        status: SystemMigrationStatusEnum.succeeded
      }
    ]);
    // 开发期已有部分实例域；统一配置迁移必须在业务启动前清理残留并补齐全部域。
    await MongoSystemInstanceConfig.collection.insertOne({
      domain: 'subservice',
      schemaVersion: 1,
      revision: 1,
      overrides: { plugin: { remoteDebug: true }, aiProxy: { enabled: true } },
      explicitDefaultPaths: []
    });
    const legacyState = await MongoSystemMigrationState.findById(legacyMigrationId).lean();
    const { insertedId } = await MongoChat.collection.insertOne({
      teamId: new Types.ObjectId(),
      appId: new Types.ObjectId(),
      source: 'api'
    } as any);

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    // 仅替代 Redis Lua 边界，并暂停真实回填写入；Runner、启动编排和 Mongo 事务均真实执行。
    const redisScripts = vi.spyOn(redisCacheAdapter, 'evalScript').mockResolvedValue(1);
    const bulkWrite = MongoChat.collection.bulkWrite.bind(MongoChat.collection);
    const write = vi
      .spyOn(MongoChat.collection, 'bulkWrite')
      .mockImplementation(async (operations, options) => {
        await gate;
        return bulkWrite(operations, options);
      });
    const registration = registerNodeInstrumentation();
    try {
      await registration;
      // 当前注册表仍声明实例配置启动迁移；该标记表示注册表存在阻塞任务，不表示迁移尚未完成。
      expect(global.systemMigrationRunner!.hasBlockingMigrations).toBe(true);
      for (const consumer of [
        mocks.configPolling,
        mocks.watch,
        mocks.workers,
        mocks.cron,
        mocks.training,
        mocks.tracks
      ])
        expect(consumer).toHaveBeenCalledTimes(1);
      await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(1), { timeout: 10000 });
      expect(redisScripts).toHaveBeenCalled();
      expect((await MongoSystemMigrationState.findById(migrationId).lean())?.status).toBe(
        SystemMigrationStatusEnum.running
      );
      expect(await MongoChat.collection.findOne({ _id: insertedId })).not.toHaveProperty(
        'publishSource'
      );

      release();
      await global.systemMigrationRunner!.tick();
      expect((await MongoSystemMigrationState.findById(migrationId).lean())?.status).toBe(
        SystemMigrationStatusEnum.succeeded
      );
      expect(await MongoChat.collection.findOne({ _id: insertedId })).toMatchObject({
        publishSource: { type: 'api' }
      });
      expect(await MongoSystemMigrationState.findById(legacyMigrationId).lean()).toEqual(
        legacyState
      );
      expect(mocks.postHealth).toHaveBeenCalledTimes(1);
      expect(mocks.exit).not.toHaveBeenCalled();
    } finally {
      release();
      global.systemMigrationRunner?.stop();
      await registration.catch(() => undefined);
    }
  });

  it.each([
    { pricing: { unitPrice: 0.2 }, expected: { type: 'duration', unitPrice: 0.2 } },
    { pricing: {}, expected: { type: 'duration' } },
    { pricing: null, expected: undefined },
    { pricing: { type: 'unknown', unitPrice: 0.2 }, expected: undefined },
    { pricing: { unitPrice: -1 }, expected: undefined }
  ])(
    'starts business with failed STT backfill and legacy pricing $pricing',
    async ({ pricing, expected }) => {
      vi.clearAllMocks();
      const { insertedId: modelId } = await MongoAIModel.collection.insertOne({
        model: 'legacy-stt',
        name: 'STT',
        provider: 'openai',
        scope: 'system',
        type: 'stt',
        config: {},
        pricing
      });
      mocks.loadModels.mockImplementation(async () => {
        const model = await MongoAIModel.findById(modelId).lean();
        expect(formatDbModelToRuntimeModel(model!, { fallbackProvider: true }).pricing).toEqual(
          expected
        );
      });
      mocks.postHealth.mockResolvedValue({ auth: true, data: 'success' });
      setTestLicenseActive(true);
      const migrationId = '20261104_backfill_chat_publish_source';
      const legacyMigrationId = '20260903_migrate_legacy_system_models';
      await MongoSystemMigrationState.insertMany([
        {
          _id: legacyMigrationId,
          status: SystemMigrationStatusEnum.failed,
          checkpoint: { retired: true }
        },
        {
          _id: '20261022_initialize_dataset_vector_indexes',
          status: SystemMigrationStatusEnum.succeeded
        },
        {
          _id: '20261116_migrate_system_configs',
          status: SystemMigrationStatusEnum.succeeded
        },
        {
          _id: '20261112_backfill_stt_pricing_type',
          status: SystemMigrationStatusEnum.failed
        }
      ]);
      const legacyState = await MongoSystemMigrationState.findById(legacyMigrationId).lean();
      const { insertedId } = await MongoChat.collection.insertOne({
        teamId: new Types.ObjectId(),
        appId: new Types.ObjectId(),
        source: 'api'
      } as any);

      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      // 仅替代 Redis Lua 边界，并暂停真实回填写入；Runner、启动编排和 Mongo 事务均真实执行。
      const redisScripts = vi.spyOn(redisCacheAdapter, 'evalScript').mockResolvedValue(1);
      const bulkWrite = MongoChat.collection.bulkWrite.bind(MongoChat.collection);
      const write = vi
        .spyOn(MongoChat.collection, 'bulkWrite')
        .mockImplementation(async (operations, options) => {
          await gate;
          return bulkWrite(operations, options);
        });
      const registration = registerNodeInstrumentation();
      try {
        await registration;
        expect(global.systemMigrationRunner!.hasBlockingMigrations).toBe(true);
        expect(mocks.loadModels).toHaveBeenCalledTimes(1);
        expect(mocks.reloadModels).toHaveBeenCalledTimes(1);
        expect(
          (await MongoSystemMigrationState.findById('20261112_backfill_stt_pricing_type').lean())
            ?.status
        ).toBe(SystemMigrationStatusEnum.failed);
        expect((await MongoAIModel.findById(modelId).lean())?.pricing).toEqual(pricing);
        for (const consumer of [
          mocks.configPolling,
          mocks.watch,
          mocks.workers,
          mocks.cron,
          mocks.training,
          mocks.tracks
        ])
          expect(consumer).toHaveBeenCalledTimes(1);
        await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(1), { timeout: 10000 });
        expect(redisScripts).toHaveBeenCalled();
        expect((await MongoSystemMigrationState.findById(migrationId).lean())?.status).toBe(
          SystemMigrationStatusEnum.running
        );
        expect(await MongoChat.collection.findOne({ _id: insertedId })).not.toHaveProperty(
          'publishSource'
        );

        release();
        await global.systemMigrationRunner!.tick();
        expect((await MongoSystemMigrationState.findById(migrationId).lean())?.status).toBe(
          SystemMigrationStatusEnum.succeeded
        );
        expect(await MongoChat.collection.findOne({ _id: insertedId })).toMatchObject({
          publishSource: { type: 'api' }
        });
        expect(await MongoSystemMigrationState.findById(legacyMigrationId).lean()).toEqual(
          legacyState
        );
        expect(mocks.postHealth).toHaveBeenCalledTimes(1);
        expect(mocks.exit).not.toHaveBeenCalled();
      } finally {
        release();
        global.systemMigrationRunner?.stop();
        await registration.catch(() => undefined);
      }
    }
  );

  it('loads configuration before migration and refreshes it after backfill without blocking on missing proxy', async () => {
    vi.clearAllMocks();
    mocks.loadModels.mockReset();
    mocks.reloadModels.mockReset();
    const previousSnapshot = global.systemInstanceConfig;
    mocks.postHealth.mockResolvedValue({ auth: true, data: 'success' });
    setTestLicenseActive(true);
    vi.stubEnv('AGENT_SANDBOX_PROXY_URL', 'wss://proxy.example.test');
    vi.stubEnv('AGENT_SANDBOX_PREVIEW_PROXY_URL', 'https://preview.example.test');
    vi.stubEnv('AGENT_SANDBOX_PROXY_SECRET', 'synthetic-proxy-secret-32-characters');
    vi.spyOn(FastGPTPluginClient.prototype, 'getPluginServiceFeatures').mockResolvedValue({
      remoteDebug: false
    } as any);
    // 只有 Redis 分布式锁脚本使用假实现；配置加载与 Mongo 迁移全程真实执行。
    vi.spyOn(redisCacheAdapter, 'evalScript').mockResolvedValue(1);
    mocks.getInitConfig.mockImplementation(async (options) => {
      // 首次读取允许旧配置缺少 proxy，迁移完成后再刷新快照。
      const state = await MongoSystemMigrationState.findById(
        '20261116_migrate_system_configs'
      ).lean();
      if (mocks.getInitConfig.mock.calls.length > 1) {
        expect(state?.status).toBe(SystemMigrationStatusEnum.succeeded);
      }
      return mocks.actualGetInitConfig!(options);
    });

    await MongoSystemMigrationState.insertMany([
      {
        _id: '20261022_initialize_dataset_vector_indexes',
        status: SystemMigrationStatusEnum.succeeded
      },
      {
        _id: '20261104_backfill_chat_publish_source',
        status: SystemMigrationStatusEnum.succeeded
      },
      {
        _id: '20261112_backfill_stt_pricing_type',
        status: SystemMigrationStatusEnum.succeeded
      }
    ]);
    await MongoSystemInstanceConfig.collection.insertOne({
      domain: 'subservice',
      schemaVersion: 1,
      revision: 6,
      overrides: {
        plugin: { remoteDebug: true },
        agentSandbox: {
          provider: 'sealosdevbox',
          sealosdevbox: { baseUrl: 'https://devbox.example.test' }
        }
      },
      explicitDefaultPaths: []
    });

    try {
      await registerNodeInstrumentation();
      expect(mocks.getInitConfig).toHaveBeenCalledTimes(2);
      expect(mocks.exit).not.toHaveBeenCalled();
      expect(getSystemInstanceConfig().subservice.agentSandbox).toMatchObject({
        provider: 'sealosdevbox',
        proxy: {
          wsUrl: 'wss://proxy.example.test',
          previewUrl: 'https://preview.example.test',
          secret: 'synthetic-proxy-secret-32-characters'
        }
      });
    } finally {
      global.systemInstanceConfig = previousSnapshot;
    }
  });
});
