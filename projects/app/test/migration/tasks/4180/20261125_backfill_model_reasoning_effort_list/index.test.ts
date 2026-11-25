import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import type {
  SystemMigrationFailedRecord,
  SystemMigrationFailureInput
} from '@fastgpt/global/migration/schema';
import { Types } from '@fastgpt/service/common/mongo';
import { readModelCatalogRevision } from '@fastgpt/service/core/ai/model/catalog/entity';
import { MongoAIModelCatalog } from '@fastgpt/service/core/ai/model/catalog/schema';
import { MongoAIModel } from '@fastgpt/service/core/ai/model/schema';
import {
  MongoSystemMigrationFailedRecord,
  MongoSystemMigrationState
} from '@/migration/mongoSchema';
import {
  systemMigrations,
  type SystemMigration,
  type SystemMigrationContext
} from '@/migration/registry';
import { createSystemMigrationRunner } from '@/migration/runner';
import { getSystemMigrationList, startManualSystemMigration } from '@/migration/service';
import { backfillModelReasoningEffortListMigration } from '@/migration/tasks/4180/20261125_backfill_model_reasoning_effort_list';

vi.unmock('@fastgpt/service/common/mongo/sessionRun');

const mocks = vi.hoisted(() => ({
  listModels: vi.fn(),
  updatedReloadSystemModel: vi.fn(),
  invalidateTeamModelCatalog: vi.fn()
}));

vi.mock('@fastgpt/service/thirdProvider/fastgptPlugin', () => ({
  pluginClient: {
    listModels: mocks.listModels
  }
}));

vi.mock('@fastgpt/service/core/ai/model/catalog/service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/ai/model/catalog/service')>()),
  updatedReloadSystemModel: mocks.updatedReloadSystemModel
}));

vi.mock('@fastgpt/service/core/ai/model/catalog/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/ai/model/catalog/cache')>()),
  invalidateTeamModelCatalog: mocks.invalidateTeamModelCatalog
}));

const createContext = () => {
  let failures: SystemMigrationFailedRecord[] = [];
  const progressCalls: Array<{ key: string; status: SystemMigrationStatusEnum }> = [];
  const context = {
    migrationId: '20261125_backfill_model_reasoning_effort_list',
    runId: 'test-run',
    signal: new AbortController().signal,
    getCheckpoint: vi.fn(async () => undefined),
    saveCheckpoint: vi.fn(async () => undefined),
    getFailedRecords: async () => structuredClone(failures),
    reportFailedRecords: vi.fn(async (value: SystemMigrationFailedRecord[]) => {
      failures = structuredClone(value);
    }),
    assertActive: vi.fn(async () => undefined),
    reportProgress: vi.fn<SystemMigrationContext['reportProgress']>(async (progress) => {
      progressCalls.push({ key: progress.key, status: progress.status });
    }),
    fail: vi.fn(async (input: SystemMigrationFailureInput): Promise<never> => {
      failures = structuredClone(input.failedRecords ?? failures);
      throw new Error(input.message);
    }),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  } satisfies SystemMigrationContext;

  return { context, progressCalls, failures: () => failures };
};

const pluginPresets = [
  {
    type: ModelTypeEnum.llm,
    provider: 'ChatGLM',
    model: 'glm-5',
    name: 'GLM-5',
    maxContext: 128000,
    maxTokens: 16000,
    quoteMaxToken: 100000,
    reasoning: true,
    reasoningEffort: true,
    reasoningEffortList: ['high', 'none', 'high']
  },
  {
    type: ModelTypeEnum.llm,
    provider: 'Gemini',
    model: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    maxContext: 1000000,
    maxTokens: 64000,
    quoteMaxToken: 500000,
    reasoning: true,
    reasoningEffort: true,
    reasoningEffortList: ['low', 'high']
  },
  {
    type: ModelTypeEnum.llm,
    provider: 'OpenAI',
    model: 'gpt-4o',
    name: 'GPT-4o',
    maxContext: 128000,
    maxTokens: 16000,
    quoteMaxToken: 100000,
    reasoning: false,
    reasoningEffort: false
  }
];

const seedModel = async (overrides: Record<string, unknown> = {}) => {
  const _id = new Types.ObjectId();
  const raw = {
    _id,
    type: ModelTypeEnum.llm,
    scope: ModelScopeEnum.system,
    model: `model-${_id}`,
    name: 'Test LLM',
    provider: 'OpenAI',
    requestAuth: 'secret-token-must-not-leak',
    config: {
      maxContext: 128000,
      maxResponse: 16000,
      quoteMaxToken: 100000,
      reasoning: true,
      reasoningEffort: true
    },
    ...overrides
  };
  await MongoAIModel.collection.insertOne(raw as any);
  return raw;
};

describe('20261125_backfill_model_reasoning_effort_list', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.listModels.mockResolvedValue(pluginPresets);
    mocks.updatedReloadSystemModel.mockResolvedValue(undefined);
    await Promise.all([
      MongoAIModel.deleteMany({}),
      MongoAIModelCatalog.deleteMany({}),
      MongoSystemMigrationState.deleteMany({}),
      MongoSystemMigrationFailedRecord.deleteMany({})
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('backfills missing presets for system and team models, preserves manual configs, and is idempotent on rerun', async () => {
    const teamId = new Types.ObjectId();
    const systemLegacy = await seedModel({ model: 'glm-5' });
    const teamLegacy = await seedModel({
      model: 'gemini-2.5-pro',
      scope: ModelScopeEnum.team,
      teamId,
      tmbId: new Types.ObjectId()
    });
    const manualSubset = await seedModel({
      model: 'glm-5',
      scope: ModelScopeEnum.team,
      teamId: new Types.ObjectId(),
      tmbId: new Types.ObjectId(),
      config: {
        maxContext: 128000,
        maxResponse: 16000,
        quoteMaxToken: 100000,
        reasoning: true,
        reasoningEffort: true,
        reasoningEffortList: ['high']
      }
    });
    const manualEmpty = await seedModel({
      model: 'gemini-2.5-pro',
      config: {
        maxContext: 128000,
        maxResponse: 16000,
        quoteMaxToken: 100000,
        reasoning: true,
        reasoningEffort: true,
        reasoningEffortList: []
      }
    });
    const disabledEffort = await seedModel({
      model: 'glm-5',
      scope: ModelScopeEnum.team,
      teamId: new Types.ObjectId(),
      tmbId: new Types.ObjectId(),
      config: {
        maxContext: 128000,
        maxResponse: 16000,
        quoteMaxToken: 100000,
        reasoning: true,
        reasoningEffort: false
      }
    });
    const customModel = await seedModel({ model: 'private-reasoning-model' });
    await seedModel({ type: ModelTypeEnum.stt, model: 'whisper-1', config: {} });

    const { context, progressCalls } = createContext();
    const firstResult = await backfillModelReasoningEffortListMigration(context);

    expect(firstResult).toEqual({
      presetCount: 2,
      scannedCount: 6,
      backfilledCount: 2,
      skippedCount: 4
    });
    expect(context.saveCheckpoint).not.toHaveBeenCalled();
    expect(progressCalls).toEqual([
      { key: 'loadPresets', status: SystemMigrationStatusEnum.running },
      { key: 'loadPresets', status: SystemMigrationStatusEnum.succeeded },
      { key: 'backfill', status: SystemMigrationStatusEnum.running },
      { key: 'backfill', status: SystemMigrationStatusEnum.succeeded },
      { key: 'validation', status: SystemMigrationStatusEnum.running },
      { key: 'validation', status: SystemMigrationStatusEnum.succeeded }
    ]);

    expect((await MongoAIModel.findById(systemLegacy._id).lean())?.config).toMatchObject({
      reasoning: true,
      reasoningEffort: true,
      reasoningEffortList: ['none', 'high']
    });
    expect((await MongoAIModel.findById(teamLegacy._id).lean())?.config).toMatchObject({
      reasoning: true,
      reasoningEffort: true,
      reasoningEffortList: ['low', 'high']
    });
    // 人工配置（子集与空数组）、关闭项与自定义模型均保持不变
    expect((await MongoAIModel.findById(manualSubset._id).lean())?.config).toMatchObject({
      reasoningEffortList: ['high']
    });
    expect((await MongoAIModel.findById(manualEmpty._id).lean())?.config).toMatchObject({
      reasoningEffortList: []
    });
    expect(
      ((await MongoAIModel.findById(disabledEffort._id).lean())?.config as any)?.reasoningEffortList
    ).toBeUndefined();
    expect(
      ((await MongoAIModel.findById(customModel._id).lean())?.config as any)?.reasoningEffortList
    ).toBeUndefined();

    expect(await readModelCatalogRevision({ scope: ModelScopeEnum.system })).toBe(1);
    expect(
      await readModelCatalogRevision({ scope: ModelScopeEnum.team, teamId: String(teamId) })
    ).toBe(1);
    expect(mocks.updatedReloadSystemModel).toHaveBeenCalledTimes(1);
    expect(mocks.invalidateTeamModelCatalog).toHaveBeenCalledWith(String(teamId));

    // 二次重跑完全幂等，不重复写入也不再递增目录修订号
    vi.clearAllMocks();
    mocks.listModels.mockResolvedValue(pluginPresets);
    const secondRun = createContext();
    const secondResult = await backfillModelReasoningEffortListMigration(secondRun.context);
    expect(secondResult).toEqual({
      presetCount: 2,
      scannedCount: 6,
      backfilledCount: 0,
      skippedCount: 6
    });
    expect(await readModelCatalogRevision({ scope: ModelScopeEnum.system })).toBe(1);
    expect(
      await readModelCatalogRevision({ scope: ModelScopeEnum.team, teamId: String(teamId) })
    ).toBe(1);
    expect(mocks.updatedReloadSystemModel).not.toHaveBeenCalled();
    expect(mocks.invalidateTeamModelCatalog).not.toHaveBeenCalled();
  });

  it('fails without modifying data when plugin returns no reasoningEffortList presets', async () => {
    const legacy = await seedModel({ model: 'glm-5' });
    mocks.listModels.mockResolvedValue([
      {
        type: ModelTypeEnum.llm,
        provider: 'ChatGLM',
        model: 'glm-5',
        name: 'GLM-5',
        maxContext: 128000,
        maxTokens: 16000,
        quoteMaxToken: 100000,
        reasoning: true,
        reasoningEffort: true
      }
    ]);

    const { context } = createContext();
    await expect(backfillModelReasoningEffortListMigration(context)).rejects.toThrow(
      'upgrade fastgpt-plugin'
    );
    expect(
      ((await MongoAIModel.findById(legacy._id).lean())?.config as any)?.reasoningEffortList
    ).toBeUndefined();
  });

  it('aborts before partial writes and reports sanitized failed records when source data is invalid', async () => {
    const validSystem = await seedModel({ model: 'glm-5' });
    const invalidScope = await seedModel({
      model: 'gemini-2.5-pro',
      scope: ModelScopeEnum.team,
      teamId: 'not-an-object-id'
    });
    const invalidExistingField = await seedModel({
      model: 'glm-5',
      scope: ModelScopeEnum.team,
      teamId: new Types.ObjectId(),
      config: {
        maxContext: 128000,
        maxResponse: 16000,
        quoteMaxToken: 100000,
        reasoning: true,
        reasoningEffort: true,
        reasoningEffortList: 'high'
      }
    });

    const { context, failures } = createContext();
    await expect(backfillModelReasoningEffortListMigration(context)).rejects.toThrow(
      'could not be backfilled'
    );

    // 校验前置失败时不得留下局部写入
    expect(
      ((await MongoAIModel.findById(validSystem._id).lean())?.config as any)?.reasoningEffortList
    ).toBeUndefined();

    const reported = failures();
    expect(reported).toHaveLength(2);
    expect(reported.every((item) => item.stageKey === 'backfill')).toBe(true);
    expect(reported.map((item) => item.data.id).sort()).toEqual(
      [String(invalidScope._id), String(invalidExistingField._id)].sort()
    );
    expect(JSON.stringify(reported)).not.toContain('secret-token-must-not-leak');
  });

  it('fails in validation stage when an existing matched model contains invalid reasoning effort values', async () => {
    const corrupted = await seedModel({
      model: 'glm-5',
      config: {
        maxContext: 128000,
        maxResponse: 16000,
        quoteMaxToken: 100000,
        reasoning: true,
        reasoningEffort: true,
        reasoningEffortList: ['invalid_level']
      }
    });

    const { context, failures } = createContext();
    await expect(backfillModelReasoningEffortListMigration(context)).rejects.toThrow(
      'validation failed'
    );
    expect(failures()).toEqual([
      {
        stageKey: 'validation',
        data: { id: String(corrupted._id) },
        reason: {
          message: 'Model reasoningEffortList is missing or invalid; repair before retrying'
        }
      }
    ]);
  });

  it('stays waiting until manually started and publishes structured result through the real migration runner', async () => {
    const legacy = await seedModel({ model: 'glm-5' });
    const registered = systemMigrations.find(
      ({ id }) => id === '20261125_backfill_model_reasoning_effort_list'
    )!;
    const registry: readonly SystemMigration[] = [registered];
    const runner = createSystemMigrationRunner({
      migrations: registry,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    });

    try {
      await runner.start();
      await runner.waitForBlockingMigrations();
      runner.startBackgroundMigrations();
      await runner.tick();

      // 手动任务默认处于 waiting，不会被后台队列自动执行
      expect((await MongoSystemMigrationState.findById(registered.id).lean())?.status).toBe(
        SystemMigrationStatusEnum.waiting
      );
      expect(
        ((await MongoAIModel.findById(legacy._id).lean())?.config as any)?.reasoningEffortList
      ).toBeUndefined();

      // 管理员手动入队后执行成功并持久化标量结果参数
      await startManualSystemMigration(registered.id, registry);
      await runner.tick();

      const list = await getSystemMigrationList(registry);
      expect(list.migrations[0]).toMatchObject({
        id: registered.id,
        status: SystemMigrationStatusEnum.succeeded,
        failedRecordCount: 0,
        result: {
          key: 'system_migration:migrations.20261125_backfill_model_reasoning_effort_list.result',
          params: {
            presetCount: 2,
            scannedCount: 1,
            backfilledCount: 1,
            skippedCount: 0
          }
        }
      });
      expect((await MongoAIModel.findById(legacy._id).lean())?.config).toMatchObject({
        reasoningEffortList: ['none', 'high']
      });
    } finally {
      await runner.stop();
    }
  });
});
