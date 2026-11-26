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
  flatModelToDocumentData,
  formatDbModelToDocumentData
} from '@fastgpt/service/core/ai/model/transform';
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
import {
  backfillModelReasoningEffortListMigration,
  createBackfillModelReasoningEffortListMigration
} from '@/migration/tasks/4180/20261125_backfill_model_reasoning_effort_list';

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

const createContext = (initial?: {
  checkpoint?: unknown;
  failures?: SystemMigrationFailedRecord[];
  assertActive?: () => Promise<void>;
  onSaveCheckpoint?: (value: unknown, count: number) => Promise<void> | void;
}) => {
  let checkpoint: unknown = structuredClone(initial?.checkpoint);
  let failures: SystemMigrationFailedRecord[] = structuredClone(initial?.failures ?? []);
  let saveCheckpointCount = 0;
  const callOrder: string[] = [];
  const progressCalls: Array<{ key: string; status: SystemMigrationStatusEnum }> = [];

  const context = {
    migrationId: '20261125_backfill_model_reasoning_effort_list',
    runId: 'test-run',
    signal: new AbortController().signal,
    getCheckpoint: vi.fn(async (schema) => {
      if (checkpoint === undefined) return undefined;
      return schema.parse(structuredClone(checkpoint));
    }),
    saveCheckpoint: vi.fn(async (value: unknown) => {
      saveCheckpointCount += 1;
      callOrder.push('saveCheckpoint');
      await initial?.onSaveCheckpoint?.(value, saveCheckpointCount);
      checkpoint = structuredClone(value);
    }),
    getFailedRecords: vi.fn(async () => structuredClone(failures)),
    reportFailedRecords: vi.fn(async (value: SystemMigrationFailedRecord[]) => {
      callOrder.push('reportFailedRecords');
      failures = structuredClone(value);
    }),
    assertActive: vi.fn(initial?.assertActive ?? (async () => undefined)),
    reportProgress: vi.fn<SystemMigrationContext['reportProgress']>(async (progress) => {
      progressCalls.push({ key: progress.key, status: progress.status });
    }),
    fail: vi.fn(async (input: SystemMigrationFailureInput): Promise<never> => {
      callOrder.push('fail');
      failures = structuredClone(input.failedRecords ?? failures);
      throw new Error(input.message);
    }),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  } satisfies SystemMigrationContext;

  return {
    context,
    progressCalls,
    callOrder,
    checkpoint: () => structuredClone(checkpoint),
    failures: () => structuredClone(failures)
  };
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
  const scope = (overrides.scope as ModelScopeEnum | undefined) ?? ModelScopeEnum.system;
  const raw = {
    _id,
    type: ModelTypeEnum.llm,
    scope,
    ...(scope === ModelScopeEnum.team ? { tmbId: new Types.ObjectId() } : {}),
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

  it('backfills missing or empty presets in bounded batches across scopes, preserves non-empty manual configs, and is idempotent on rerun', async () => {
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
    const emptyListModel = await seedModel({
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

    const runWithSmallBatch = createBackfillModelReasoningEffortListMigration(2);
    const { context, progressCalls, checkpoint } = createContext();
    const firstResult = await runWithSmallBatch(context);

    expect(firstResult).toEqual({
      presetCount: 2,
      verifiedCount: 4
    });
    expect(checkpoint()).toMatchObject({
      precheckPassed: true,
      backfillCompleted: true,
      scannedCount: 6
    });
    expect(context.saveCheckpoint).toHaveBeenCalledTimes(5);
    expect(progressCalls.at(0)).toEqual({
      key: 'loadPresets',
      status: SystemMigrationStatusEnum.running
    });
    expect(progressCalls.at(1)).toEqual({
      key: 'loadPresets',
      status: SystemMigrationStatusEnum.succeeded
    });
    expect(progressCalls.at(-2)).toEqual({
      key: 'validation',
      status: SystemMigrationStatusEnum.running
    });
    expect(progressCalls.at(-1)).toEqual({
      key: 'validation',
      status: SystemMigrationStatusEnum.succeeded
    });

    expect((await MongoAIModel.findById(systemLegacy._id).lean())?.config).toMatchObject({
      reasoningEffortList: ['none', 'high']
    });
    expect((await MongoAIModel.findById(teamLegacy._id).lean())?.config).toMatchObject({
      reasoningEffortList: ['low', 'high']
    });
    expect((await MongoAIModel.findById(manualSubset._id).lean())?.config).toMatchObject({
      reasoningEffortList: ['high']
    });
    // 空数组视作未配置，同样由插件预设回填
    expect((await MongoAIModel.findById(emptyListModel._id).lean())?.config).toMatchObject({
      reasoningEffortList: ['low', 'high']
    });
    expect(
      ((await MongoAIModel.findById(disabledEffort._id).lean())?.config as any)?.reasoningEffortList
    ).toBeUndefined();
    expect(
      ((await MongoAIModel.findById(customModel._id).lean())?.config as any)?.reasoningEffortList
    ).toBeUndefined();

    expect(await readModelCatalogRevision({ scope: ModelScopeEnum.system })).toBe(2);
    expect(
      await readModelCatalogRevision({ scope: ModelScopeEnum.team, teamId: String(teamId) })
    ).toBe(1);
    expect(mocks.updatedReloadSystemModel).toHaveBeenCalledTimes(2);
    expect(mocks.invalidateTeamModelCatalog).toHaveBeenCalledWith(String(teamId));

    // 二次重跑完全幂等，不重复写入也不再递增目录修订号，且终态计数保持一致
    vi.clearAllMocks();
    mocks.listModels.mockResolvedValue(pluginPresets);
    const secondRun = createContext();
    const secondResult = await runWithSmallBatch(secondRun.context);
    expect(secondResult).toEqual({
      presetCount: 2,
      verifiedCount: 4
    });
    expect(await readModelCatalogRevision({ scope: ModelScopeEnum.system })).toBe(2);
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
    expect(await readModelCatalogRevision({ scope: ModelScopeEnum.system })).toBe(0);
  });

  it('aborts in batched precheck before any write or revision bump when valid records coexist with invalid existing arrays or scopes', async () => {
    const validSystem = await seedModel({ model: 'glm-5' });
    const invalidArrayValue = await seedModel({
      model: 'glm-5',
      scope: ModelScopeEnum.team,
      teamId: new Types.ObjectId(),
      config: {
        maxContext: 128000,
        maxResponse: 16000,
        quoteMaxToken: 100000,
        reasoning: true,
        reasoningEffort: true,
        reasoningEffortList: ['high', 'future_level']
      }
    });
    const invalidNonArray = await seedModel({
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
    const invalidScope = await seedModel({
      model: 'gemini-2.5-pro',
      scope: ModelScopeEnum.team,
      teamId: 'not-an-object-id'
    });

    const runWithSmallBatch = createBackfillModelReasoningEffortListMigration(2);
    const first = createContext();
    await expect(runWithSmallBatch(first.context)).rejects.toThrow(
      'invalid scope or reasoningEffortList'
    );

    // 预检拦截后不得留下任何局部写入或目录修订号递增
    expect(
      ((await MongoAIModel.findById(validSystem._id).lean())?.config as any)?.reasoningEffortList
    ).toBeUndefined();
    expect(await readModelCatalogRevision({ scope: ModelScopeEnum.system })).toBe(0);
    expect(mocks.updatedReloadSystemModel).not.toHaveBeenCalled();

    const reported = first.failures();
    expect(reported).toHaveLength(3);
    expect(reported.every((item) => item.stageKey === 'backfill')).toBe(true);
    expect(reported.map((item) => item.data.id).sort()).toEqual(
      [String(invalidArrayValue._id), String(invalidNonArray._id), String(invalidScope._id)].sort()
    );
    expect(JSON.stringify(reported)).not.toContain('secret-token-must-not-leak');

    // 管理员修复坏数据后重试，预检通过并完成全部回填
    const repairedTeamId = new Types.ObjectId();
    await Promise.all([
      MongoAIModel.collection.updateOne(
        { _id: invalidArrayValue._id },
        { $set: { 'config.reasoningEffortList': ['high'] } }
      ),
      MongoAIModel.collection.updateOne(
        { _id: invalidNonArray._id },
        { $unset: { 'config.reasoningEffortList': '' } }
      ),
      MongoAIModel.collection.updateOne(
        { _id: invalidScope._id },
        { $set: { teamId: repairedTeamId } }
      )
    ]);

    const retry = createContext({ checkpoint: first.checkpoint(), failures: first.failures() });
    const result = await runWithSmallBatch(retry.context);
    expect(result).toEqual({
      presetCount: 2,
      verifiedCount: 4
    });
    expect((await MongoAIModel.findById(validSystem._id).lean())?.config).toMatchObject({
      reasoningEffortList: ['none', 'high']
    });
    expect((await MongoAIModel.findById(invalidArrayValue._id).lean())?.config).toMatchObject({
      reasoningEffortList: ['high']
    });
    expect(await readModelCatalogRevision({ scope: ModelScopeEnum.system })).toBe(1);
  });

  it('produces identical verifiedCount after crash-before-checkpoint and failed-snapshot replay without double counting', async () => {
    const teamA = new Types.ObjectId();
    const teamB = new Types.ObjectId();
    const m1 = await seedModel({ model: 'glm-5', scope: ModelScopeEnum.team, teamId: teamA });
    const m2 = await seedModel({
      model: 'gemini-2.5-pro',
      scope: ModelScopeEnum.team,
      teamId: teamA
    });
    const m3 = await seedModel({ model: 'glm-5', scope: ModelScopeEnum.team, teamId: teamB });
    const m4 = await seedModel({
      model: 'glm-5',
      scope: ModelScopeEnum.team,
      teamId: teamB,
      config: {
        maxContext: 128000,
        maxResponse: 16000,
        quoteMaxToken: 100000,
        reasoning: true,
        reasoningEffort: true,
        reasoningEffortList: ['invalid_level']
      }
    });

    const runWithSmallBatch = createBackfillModelReasoningEffortListMigration(2);

    // 场景 1：模拟业务事务已提交 m1/m2，但在保存第一批 checkpoint 前崩溃
    const crashAfterCommit = createContext({
      checkpoint: {
        endId: String(m2._id),
        lastId: null,
        scannedCount: 0,
        precheckPassed: true,
        backfillCompleted: false
      },
      onSaveCheckpoint: (_value, count) => {
        if (count === 1) throw new Error('Crash before saveCheckpoint');
      }
    });
    await expect(runWithSmallBatch(crashAfterCommit.context)).rejects.toThrow(
      'Crash before saveCheckpoint'
    );
    expect((await MongoAIModel.findById(m1._id).lean())?.config).toMatchObject({
      reasoningEffortList: ['none', 'high']
    });
    expect(
      await readModelCatalogRevision({ scope: ModelScopeEnum.team, teamId: String(teamA) })
    ).toBe(1);

    // 接管重放同一批次：CAS 不重复递增修订号；遇到第二批坏记录 m4 时先持久化错误快照再保存断点
    const resumedRun = createContext({
      checkpoint: {
        endId: String(m4._id),
        lastId: null,
        scannedCount: 0,
        precheckPassed: true,
        backfillCompleted: false
      }
    });
    await expect(runWithSmallBatch(resumedRun.context)).rejects.toThrow('could not be backfilled');
    expect(
      await readModelCatalogRevision({ scope: ModelScopeEnum.team, teamId: String(teamA) })
    ).toBe(1);
    expect(
      await readModelCatalogRevision({ scope: ModelScopeEnum.team, teamId: String(teamB) })
    ).toBe(1);
    expect(resumedRun.callOrder).toEqual([
      'saveCheckpoint',
      'reportFailedRecords',
      'saveCheckpoint',
      'fail'
    ]);
    expect(resumedRun.failures()).toEqual([
      {
        stageKey: 'backfill',
        data: { id: String(m4._id) },
        reason: {
          message: 'Existing reasoningEffortList is invalid; repair before retrying'
        }
      }
    ]);

    // 场景 2：模拟 reportFailedRecords 已写入但游标尚未越过 m4，修复 m4 后重试不会重复计数
    await MongoAIModel.collection.updateOne(
      { _id: m4._id },
      { $unset: { 'config.reasoningEffortList': '' } }
    );
    const replayAfterFailureSnapshot = createContext({
      checkpoint: {
        endId: String(m4._id),
        lastId: String(m2._id),
        scannedCount: 2,
        precheckPassed: true,
        backfillCompleted: false
      },
      failures: resumedRun.failures()
    });
    const finalResult = await runWithSmallBatch(replayAfterFailureSnapshot.context);
    expect(finalResult).toEqual({
      presetCount: 2,
      verifiedCount: 4
    });
    expect(replayAfterFailureSnapshot.failures()).toEqual([]);
    expect((await MongoAIModel.findById(m3._id).lean())?.config).toMatchObject({
      reasoningEffortList: ['none', 'high']
    });
    expect((await MongoAIModel.findById(m4._id).lean())?.config).toMatchObject({
      reasoningEffortList: ['none', 'high']
    });
    expect(
      await readModelCatalogRevision({ scope: ModelScopeEnum.team, teamId: String(teamA) })
    ).toBe(1);
    expect(
      await readModelCatalogRevision({ scope: ModelScopeEnum.team, teamId: String(teamB) })
    ).toBe(2);
  });

  it('stops without starting further batches or wiping reported failures when lease is lost', async () => {
    const m1 = await seedModel({ model: 'glm-5' });
    const m2 = await seedModel({ model: 'gemini-2.5-pro' });
    const existingFailure: SystemMigrationFailedRecord = {
      stageKey: 'backfill',
      data: { id: String(m1._id) },
      reason: { message: 'Existing reasoningEffortList is invalid; repair before retrying' }
    };

    let activeChecks = 0;
    const { context, failures } = createContext({
      checkpoint: {
        endId: String(m2._id),
        lastId: String(m1._id),
        scannedCount: 1,
        precheckPassed: true,
        backfillCompleted: false
      },
      failures: [existingFailure],
      assertActive: async () => {
        activeChecks += 1;
        // loadPresets(1), backfill start(2), retry chunk(3) -> 模拟在进入重试写入前丢失租约
        if (activeChecks >= 3) {
          throw new Error('Lease lost');
        }
      }
    });

    const runWithSmallBatch = createBackfillModelReasoningEffortListMigration(1);
    await expect(runWithSmallBatch(context)).rejects.toThrow('Lease lost');
    expect(failures()).toEqual([existingFailure]);
    expect(
      ((await MongoAIModel.findById(m2._id).lean())?.config as any)?.reasoningEffortList
    ).toBeUndefined();
    expect(context.saveCheckpoint).not.toHaveBeenCalled();
  });

  it('catches models inserted after endId during batched validation and backfills them on retry', async () => {
    const initialModel = await seedModel({ model: 'glm-5' });
    const lateInserted = await seedModel({ model: 'gemini-2.5-pro' });

    const runWithSmallBatch = createBackfillModelReasoningEffortListMigration(1);
    await MongoAIModel.collection.updateOne(
      { _id: initialModel._id },
      { $set: { 'config.reasoningEffortList': ['none', 'high'] } }
    );
    const first = createContext({
      checkpoint: {
        endId: String(initialModel._id),
        lastId: String(initialModel._id),
        scannedCount: 1,
        precheckPassed: true,
        backfillCompleted: true
      }
    });

    await expect(runWithSmallBatch(first.context)).rejects.toThrow('validation failed');
    expect(first.failures()).toEqual([
      {
        stageKey: 'validation',
        data: { id: String(lateInserted._id) },
        reason: {
          message: 'Model reasoningEffortList is missing or invalid; repair before retrying'
        }
      }
    ]);

    // 重试时优先处理 validation 留下的失败记录并补齐回填，最终返回确定的复验总数 2
    const retry = createContext({
      checkpoint: first.checkpoint(),
      failures: first.failures()
    });
    const retryResult = await runWithSmallBatch(retry.context);
    expect(retryResult).toEqual({
      presetCount: 2,
      verifiedCount: 2
    });
    expect((await MongoAIModel.findById(lateInserted._id).lean())?.config).toMatchObject({
      reasoningEffortList: ['low', 'high']
    });
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

      // 管理员手动入队后执行成功并持久化确定性结果参数
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
            verifiedCount: 1
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

  it('still backfills upgraded plugin presets after JSON export/resave or legacy plugin template installation', async () => {
    // 1) 管理员导出 JSON 并原样保存存量模型，不得固化运行期六档默认值
    const legacy = await seedModel({ model: 'glm-5' });
    const rawFromDb = await MongoAIModel.findById(legacy._id).lean();
    const exportedDoc = formatDbModelToDocumentData(rawFromDb as Record<string, unknown>);
    expect(exportedDoc.type).toBe(ModelTypeEnum.llm);
    if (exportedDoc.type === ModelTypeEnum.llm) {
      expect(exportedDoc.config.reasoningEffortList).toBeUndefined();
      await MongoAIModel.collection.updateOne(
        { _id: legacy._id },
        { $set: { config: exportedDoc.config } }
      );
    }

    // 2) 旧版插件未携带 reasoningEffortList 时安装新模板，也不得写入兜底六档
    const installedFromLegacyPlugin = flatModelToDocumentData({
      type: ModelTypeEnum.llm,
      provider: 'ChatGLM',
      model: 'glm-5.3',
      name: 'GLM-5.3',
      maxContext: 1000000,
      maxTokens: 128000,
      quoteMaxToken: 900000,
      reasoning: true,
      reasoningEffort: true
    });
    expect(installedFromLegacyPlugin.type).toBe(ModelTypeEnum.llm);
    if (installedFromLegacyPlugin.type === ModelTypeEnum.llm) {
      expect(installedFromLegacyPlugin.config.reasoningEffortList).toBeUndefined();
    }
    const inserted = await MongoAIModel.collection.insertOne(installedFromLegacyPlugin as any);

    // 3) 升级插件后执行手动回填，两条记录均可准确回填插件预设（而非停留在含 none 的六档）
    mocks.listModels.mockResolvedValue([
      ...pluginPresets,
      {
        type: ModelTypeEnum.llm,
        provider: 'ChatGLM',
        model: 'glm-5.3',
        name: 'GLM-5.3',
        maxContext: 1000000,
        maxTokens: 128000,
        quoteMaxToken: 900000,
        reasoning: true,
        reasoningEffort: true,
        reasoningEffortList: ['low', 'high', 'xhigh']
      }
    ]);

    const { context } = createContext();
    const result = await backfillModelReasoningEffortListMigration(context);
    expect(result).toEqual({
      presetCount: 3,
      verifiedCount: 2
    });
    expect((await MongoAIModel.findById(legacy._id).lean())?.config).toMatchObject({
      reasoningEffortList: ['none', 'high']
    });
    expect((await MongoAIModel.findById(inserted.insertedId).lean())?.config).toMatchObject({
      reasoningEffortList: ['low', 'high', 'xhigh']
    });
  });
});
