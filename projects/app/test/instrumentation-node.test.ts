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
  tracks: vi.fn()
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
  loadSystemModels: vi.fn(),
  loadInstalledModels: vi.fn()
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

import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import { calculateModelPrice } from '@fastgpt/global/core/ai/model/pricing';
import { MongoAIModel } from '@fastgpt/service/core/ai/model/schema';
import { registerNodeInstrumentation } from '@/instrumentation-node';
import { systemMigrations } from '@/migration/registry';
import { MongoSystemMigrationState } from '@/migration/mongoSchema';

afterEach(async () => {
  const runner = global.systemMigrationRunner;
  runner?.stop();
  await runner?.tick();
  global.systemMigrationRunner = undefined;
  vi.restoreAllMocks();
});

describe('registerNodeInstrumentation', () => {
  it('starts business consumers while the real price migration is still running in the background', async () => {
    vi.clearAllMocks();
    mocks.postHealth.mockResolvedValue({ auth: true, data: 'success' });
    global.feConfigs = { ...global.feConfigs, isPlus: true };
    const migration = systemMigrations.find(
      ({ id }) => id === '20261025_token_prices_per_million'
    )!;
    // 历史任务已完成，仅让本次新增任务走真实生产 runner 和事务。
    await MongoSystemMigrationState.insertMany(
      systemMigrations
        .filter(({ id }) => id !== migration.id)
        .map(({ id }) => ({ _id: id, status: SystemMigrationStatusEnum.succeeded }))
    );
    const { insertedId } = await MongoAIModel.collection.insertOne({
      type: ModelTypeEnum.llm,
      scope: ModelScopeEnum.system,
      model: 'startup-migration',
      name: 'Startup migration',
      provider: 'openai',
      config: {},
      inputPrice: 2,
      outputPrice: 4
    });

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const bulkWrite = MongoAIModel.collection.bulkWrite.bind(MongoAIModel.collection);
    // 暂停真实事务写入，确定性验证迁移尚未完成时业务消费者已可启动。
    vi.spyOn(MongoAIModel.collection, 'bulkWrite').mockImplementation(
      async (operations, options) => {
        await gate;
        return bulkWrite(operations, options);
      }
    );
    const registration = registerNodeInstrumentation();
    try {
      // 真实启动包含动态导入和 Mongo I/O，不使用 waitFor 默认的一秒期限。
      await vi.waitFor(() => expect(mocks.watch).toHaveBeenCalledTimes(1), { timeout: 10000 });
      expect((await MongoSystemMigrationState.findById(migration.id).lean())?.status).not.toBe(
        SystemMigrationStatusEnum.succeeded
      );
      expect(await MongoAIModel.collection.findOne({ _id: insertedId })).not.toHaveProperty(
        'pricing'
      );
      release();
      await registration;
      await global.systemMigrationRunner!.tick();
      expect((await MongoSystemMigrationState.findById(migration.id).lean())?.status).toBe(
        SystemMigrationStatusEnum.succeeded
      );
      const saved = await MongoAIModel.collection.findOne({ _id: insertedId });
      expect(saved).toMatchObject({
        inputPrice: 2,
        outputPrice: 4,
        pricing: { tiers: [{ inputPrice: 2000, outputPrice: 4000 }] }
      });
      expect(
        calculateModelPrice({
          config: {
            type: ModelTypeEnum.llm,
            scope: ModelScopeEnum.system,
            pricing: saved!.pricing
          },
          inputTokens: 1000
        }).totalPoints
      ).toBe(2);
      expect(mocks.postHealth).toHaveBeenCalledTimes(1);
      for (const consumer of [mocks.watch, mocks.workers, mocks.cron, mocks.training, mocks.tracks])
        expect(consumer).toHaveBeenCalledTimes(1);
      expect(mocks.exit).not.toHaveBeenCalled();
    } finally {
      release();
      await registration;
    }
  });
});
