import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  postHealth: vi.fn(),
  exit: vi.fn(() => {
    throw new Error('App exited before readiness');
  }),
  watch: vi.fn(),
  workers: vi.fn(),
  cron: vi.fn(),
  training: vi.fn(),
  tracks: vi.fn(),
  loadSystemModels: vi.fn(),
  reloadModels: vi.fn()
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
vi.mock('@/service/common/system', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/service/common/system')>()),
  getInitConfig: vi.fn(),
  initSystemPluginTags: vi.fn(),
  initAppTemplateTypes: vi.fn()
}));
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
  loadSystemModels: mocks.loadSystemModels,
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
  codeSandbox: { runCode: vi.fn() }
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
vi.mock('@/service/common/system/volumnMongoWatch', () => ({ startMongoWatch: mocks.watch }));
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
import { Types } from '@fastgpt/service/common/mongo';
import { redisCacheAdapter } from '@fastgpt/dal/redis/adapter';
import { registerNodeInstrumentation } from '@/instrumentation-node';
import { MongoSystemMigrationState } from '@/migration/mongoSchema';

afterEach(async () => {
  const runner = global.systemMigrationRunner;
  runner?.stop();
  await runner?.tick();
  global.systemMigrationRunner = undefined;
  vi.restoreAllMocks();
});

describe('registerNodeInstrumentation', () => {
  it('ignores retired migration failures and starts business while current background work runs', async () => {
    vi.clearAllMocks();
    mocks.postHealth.mockResolvedValue({ auth: true, data: 'success' });
    global.feConfigs = { ...global.feConfigs, isPlus: true };
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
        _id: '20260928_migrate_instance_configs',
        status: SystemMigrationStatusEnum.succeeded
      },
      {
        _id: '20260929_cleanup_instance_config_deprecated_fields',
        status: SystemMigrationStatusEnum.succeeded
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
      // 当前注册表仍声明实例配置启动迁移；该标记表示注册表存在阻塞任务，不表示迁移尚未完成。
      expect(global.systemMigrationRunner!.hasBlockingMigrations).toBe(true);
      for (const consumer of [mocks.watch, mocks.workers, mocks.cron, mocks.training, mocks.tracks])
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
});
