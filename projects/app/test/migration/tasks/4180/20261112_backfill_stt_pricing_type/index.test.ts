import { describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoAIModel } from '@fastgpt/service/core/ai/model/schema';
import { MongoAIModelCatalog } from '@fastgpt/service/core/ai/model/catalog/schema';
import { backfillSTTPricingType } from '@/migration/tasks/4180/20261112_backfill_stt_pricing_type';
import { systemMigrations, type SystemMigrationContext } from '@/migration/registry';
import { createSystemMigrationRunner } from '@/migration/runner';
import { getMigrationStates } from '@/migration/entity';
import { startBusinessAfterSystemMigrations } from '@/migration/startup';
import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import { ModelScopeEnum } from '@fastgpt/global/core/ai/constants';
import {
  getCachedSystemModelHandle,
  publishSystemModelHandle
} from '@fastgpt/service/core/ai/model/catalog/cache';
import {
  getSystemModelHandle,
  loadInstalledModels
} from '@fastgpt/service/core/ai/model/catalog/service';
import { runModelTransaction } from '@fastgpt/service/core/ai/model/catalog/transaction';
import getConfigJsonApi from '@/pages/api/core/ai/model/getConfigJson';
import { getRootUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import type {
  SystemMigrationFailedRecord,
  SystemMigrationFailureInput
} from '@fastgpt/global/migration/schema';
vi.unmock('@fastgpt/service/common/mongo/sessionRun');
vi.mock('@/migration/constants', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/migration/constants')>()),
  systemMigrationBatchSize: 2
}));
/** 仅模拟升级框架的持久恢复状态；业务记录读写使用真实隔离 Mongo。 */
const createContext = () => {
  let checkpoint: Record<string, unknown> | undefined;
  let failures: SystemMigrationFailedRecord[] = [];
  const context = {
    migrationId: '20261112_backfill_stt_pricing_type',
    runId: 'test-run',
    signal: new AbortController().signal,
    getCheckpoint: async (schema) =>
      checkpoint ? schema.parse(structuredClone(checkpoint)) : undefined,
    saveCheckpoint: vi.fn(async (value: Record<string, unknown>) => {
      checkpoint = structuredClone(value);
    }),
    getFailedRecords: async () => structuredClone(failures),
    reportFailedRecords: vi.fn(async (value: SystemMigrationFailedRecord[]) => {
      failures = structuredClone(value);
    }),
    assertActive: vi.fn(async () => undefined),
    reportProgress: vi.fn<SystemMigrationContext['reportProgress']>(async () => undefined),
    fail: vi.fn(async (input: SystemMigrationFailureInput): Promise<never> => {
      failures = structuredClone(input.failedRecords ?? failures);
      throw new Error(input.message);
    }),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  } satisfies SystemMigrationContext;
  return { context, failures: () => failures };
};

const seed = async (overrides: Record<string, unknown> = {}) => {
  const _id = new Types.ObjectId();
  const raw = {
    _id,
    type: 'stt',
    scope: 'system',
    model: `stt-${_id}`,
    name: 'STT',
    provider: 'openai',
    config: {},
    requestAuth: 'fixture-secret',
    ...overrides
  };
  await MongoAIModel.collection.insertOne(raw as any);
  return raw;
};

describe('backfillSTTPricingType', () => {
  it('refreshes, exports JSON and cold-starts after an old node replaces pricing following migration success', async () => {
    const raw = await seed({ isActive: true, pricing: { unitPrice: 0.2 } });
    const registered = systemMigrations.find(
      ({ id }) => id === '20261112_backfill_stt_pricing_type'
    )!;
    const run = vi.fn(backfillSTTPricingType);
    const migrations = [{ ...registered, run }];
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const first = createSystemMigrationRunner({ migrations, logger });
    const later = createSystemMigrationRunner({ migrations, logger });
    try {
      await first.start();
      await first.waitForBlockingMigrations();
      const [completed] = await getMigrationStates([registered.id]);
      expect(completed.status).toBe(SystemMigrationStatusEnum.succeeded);
      expect((await MongoAIModel.findById(raw._id).lean())?.pricing).toMatchObject({
        type: 'duration',
        unitPrice: 0.2
      });
      await loadInstalledModels();
      first.stop();

      // 旧版保存会整体替换 pricing 并丢掉 type，同时照常提交目录修订号。
      await runModelTransaction({ scope: ModelScopeEnum.system }, (session) =>
        MongoAIModel.collection.updateOne(
          { _id: raw._id },
          { $set: { name: 'Edited by old node', pricing: { unitPrice: 0.4 } } },
          { session }
        )
      );
      const refreshed = await getSystemModelHandle();
      expect(refreshed.getSystemModels().find(({ model }) => model === raw.model)).toMatchObject({
        name: 'Edited by old node',
        pricing: { type: 'duration', unitPrice: 0.4 }
      });

      const exported = await Call<string>(getConfigJsonApi, { auth: await getRootUser() });
      expect(exported.code).toBe(200);
      expect(JSON.parse(exported.data)).toEqual([
        expect.objectContaining({
          modelId: String(raw._id),
          name: 'Edited by old node',
          requestAuth: 'fixture-secret',
          pricing: { type: 'duration', unitPrice: 0.4 }
        })
      ]);

      // 新节点必须依赖已成功的迁移状态启动，不能靠重跑迁移再次修复旧写入。
      publishSystemModelHandle(undefined);
      await later.start();
      const startBusinessServices = vi.fn(async () => undefined);
      await startBusinessAfterSystemMigrations({
        runner: later,
        reloadModels: loadInstalledModels,
        startBusinessServices
      });
      expect(startBusinessServices).toHaveBeenCalledOnce();
      expect(run).toHaveBeenCalledOnce();
      expect((await getMigrationStates([registered.id]))[0].runId).toBe(completed.runId);
      expect(getCachedSystemModelHandle()?.getSystemModels()[0].pricing).toEqual({
        type: 'duration',
        unitPrice: 0.4
      });
      expect((await MongoAIModel.findById(raw._id).lean())?.pricing).toEqual({ unitPrice: 0.4 });
    } finally {
      first.stop();
      later.stop();
      publishSystemModelHandle(undefined);
    }
  });

  it('fills legacy system/team prices without changing rates, free prices, explicit types or other fields', async () => {
    const records = [];
    for (const pricing of [
      undefined,
      null,
      {},
      { unitPrice: 0.2 },
      { unitPrice: 0 },
      { type: 'tokens', unitPrice: 10 },
      { type: 'duration', unitPrice: 0.3 }
    ])
      records.push(await seed(pricing === undefined ? {} : { pricing }));
    records.push(
      await seed({
        scope: 'team',
        teamId: new Types.ObjectId(),
        pricing: { unitPrice: 0.4, retained: 'value' }
      })
    );
    const other = await seed({ type: 'embedding', pricing: { unitPrice: 2 } });
    const { context } = createContext();
    expect(await backfillSTTPricingType(context)).toEqual({ models: 8 });
    for (const raw of records) {
      const pricing = 'pricing' in raw ? (raw.pricing as Record<string, unknown>) : undefined;
      expect(await MongoAIModel.collection.findOne({ _id: raw._id })).toEqual({
        ...raw,
        pricing: { ...pricing, type: pricing?.type ?? 'duration' }
      });
    }
    expect(await MongoAIModel.collection.findOne({ _id: other._id })).toEqual(other);
    const catalogs = await MongoAIModelCatalog.find({}).lean();
    expect(await backfillSTTPricingType(createContext().context)).toEqual({ models: 8 });
    expect(await MongoAIModelCatalog.find({}).lean()).toEqual(catalogs);
  });

  it('reports invalid prices without copying secrets and retries repaired failures behind the cursor', async () => {
    const bad = await seed({ pricing: { unitPrice: -1 } });
    const good = await seed({ pricing: { unitPrice: 0.2 } });
    const state = createContext();
    await expect(backfillSTTPricingType(state.context)).rejects.toThrow('require repair');
    expect(await MongoAIModel.collection.findOne({ _id: bad._id })).toEqual(bad);
    expect((await MongoAIModel.collection.findOne({ _id: good._id }))?.pricing).toMatchObject({
      type: 'duration',
      unitPrice: 0.2
    });
    expect(state.failures()).toEqual([
      expect.objectContaining({ stageKey: 'models', data: { id: String(bad._id) } })
    ]);
    expect(JSON.stringify(state.failures())).not.toContain('fixture-secret');
    await MongoAIModel.collection.updateOne(
      { _id: bad._id },
      { $set: { pricing: { unitPrice: 0 } } }
    );
    expect(await backfillSTTPricingType(state.context)).toEqual({ models: 2 });
    expect(state.failures()).toEqual([]);
  });

  it('replays committed writes when checkpoint persistence fails', async () => {
    for (let i = 0; i < 3; i++) await seed({ pricing: { unitPrice: 0.2 } });
    const state = createContext();
    const save = state.context.saveCheckpoint.getMockImplementation()!;
    state.context.saveCheckpoint
      .mockImplementationOnce(save)
      .mockRejectedValueOnce(new Error('checkpoint crash'));
    await expect(backfillSTTPricingType(state.context)).rejects.toThrow('checkpoint crash');
    state.context.saveCheckpoint.mockImplementation(save);
    expect(await backfillSTTPricingType(state.context)).toEqual({ models: 3 });
    expect(await MongoAIModel.countDocuments({ 'pricing.type': 'duration' })).toBe(3);
  });

  it('keeps validation failures recoverable after the scan cursor has passed', async () => {
    const raw = await seed({ pricing: { unitPrice: 0.2 } });
    const state = createContext();
    state.context.reportProgress.mockImplementation(async ({ key, status }) => {
      if (key === 'validation' && status === 'running')
        await MongoAIModel.collection.updateOne(
          { _id: raw._id },
          { $unset: { 'pricing.type': 1 } }
        );
    });
    await expect(backfillSTTPricingType(state.context)).rejects.toThrow('incomplete');
    expect(state.failures()).toEqual([
      expect.objectContaining({ stageKey: 'validation', data: { id: String(raw._id) } })
    ]);
    state.context.reportProgress.mockReset();
    expect(await backfillSTTPricingType(state.context)).toEqual({ models: 1 });
    expect(state.failures()).toEqual([]);
  });

  it('finds legacy writes after the frozen scan boundary and repairs them before readiness', async () => {
    await seed();
    const state = createContext();
    let lateId: string;
    state.context.reportProgress.mockImplementation(async ({ key, status }) => {
      if (key === 'validation' && status === 'running')
        lateId = String((await seed({ pricing: { unitPrice: 0.3 } }))._id);
    });
    await expect(backfillSTTPricingType(state.context)).rejects.toThrow('incomplete');
    expect(state.failures()).toEqual([
      expect.objectContaining({ data: { id: lateId! }, stageKey: 'validation' })
    ]);
    state.context.reportProgress.mockReset();
    expect(await backfillSTTPricingType(state.context)).toEqual({ models: 1 });
    expect(await MongoAIModel.countDocuments({ 'pricing.type': 'duration' })).toBe(2);
  });

  it('handles an empty collection and stops before writing after lease loss', async () => {
    expect(await backfillSTTPricingType(createContext().context)).toEqual({ models: 0 });
    const raw = await seed();
    const state = createContext();
    state.context.assertActive.mockRejectedValueOnce(new Error('lease lost'));
    await expect(backfillSTTPricingType(state.context)).rejects.toThrow('lease lost');
    expect(await MongoAIModel.collection.findOne({ _id: raw._id })).toEqual(raw);
  });
});
