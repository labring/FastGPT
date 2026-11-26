import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { normalizeReasoningEffortList } from '@fastgpt/global/core/ai/llm/utils';
import {
  ReasoningEffortLevelSchema,
  type ReasoningEffortLevel
} from '@fastgpt/global/core/ai/model/schema';
import type { SystemMigrationFailedRecord } from '@fastgpt/global/migration/schema';
import { Types } from '@fastgpt/service/common/mongo';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { invalidateTeamModelCatalog } from '@fastgpt/service/core/ai/model/catalog/cache';
import {
  incrementModelCatalogRevision,
  type ModelCatalogScope
} from '@fastgpt/service/core/ai/model/catalog/entity';
import { updatedReloadSystemModel } from '@fastgpt/service/core/ai/model/catalog/service';
import { MongoAIModel } from '@fastgpt/service/core/ai/model/schema';
import { getPluginModelDocuments } from '@fastgpt/service/core/ai/model/template';
import { z } from 'zod';
import { systemMigrationBatchSize } from '@/migration/constants';

export const ValidReasoningEffortListSchema = z.array(ReasoningEffortLevelSchema);

export const LLM_BACKFILL_PROJECTION = {
  _id: 1,
  scope: 1,
  teamId: 1,
  model: 1,
  'config.reasoning': 1,
  'config.reasoningEffort': 1,
  'config.reasoningEffortList': 1
} as const;

export type RawLlmModelRecord = {
  _id: Types.ObjectId;
  scope?: unknown;
  teamId?: unknown;
  model?: unknown;
  config?: Record<string, unknown>;
};

type BackfillCandidate = {
  _id: Types.ObjectId;
  model: string;
  levels: ReasoningEffortLevel[];
};

type ScopedBackfillGroup = {
  scope: ModelCatalogScope;
  candidates: BackfillCandidate[];
};

type RecordInspectionResult =
  | { kind: 'skip' }
  | { kind: 'backfill'; scopeKey: string; scope: ModelCatalogScope; candidate: BackfillCandidate }
  | { kind: 'invalid'; message: string };

/**
 * 从 fastgpt-plugin 实时拉取 LLM 模板，提取配置了思考等级预设的 `model -> reasoningEffortList` 映射。
 * 仅收录开启深度思考且声明了非空合法思考等级列表的 LLM 模板。
 */
export const loadPluginReasoningEffortPresets = async (): Promise<
  Map<string, ReasoningEffortLevel[]>
> => {
  const templates = await getPluginModelDocuments();
  const presetMap = new Map<string, ReasoningEffortLevel[]>();

  for (const template of templates) {
    if (template.type !== ModelTypeEnum.llm) continue;
    if (!template.config.reasoning || template.config.reasoningEffort === false) continue;
    const normalizedLevels = normalizeReasoningEffortList(template.config.reasoningEffortList);
    if (normalizedLevels.length === 0) continue;
    if (!presetMap.has(template.model)) {
      presetMap.set(template.model, normalizedLevels);
    }
  }

  return presetMap;
};

const resolveCatalogScope = (
  scope: unknown,
  teamId: unknown
): { key: string; scope: ModelCatalogScope } | undefined => {
  if (scope === ModelScopeEnum.system) {
    return { key: 'system', scope: { scope: ModelScopeEnum.system } };
  }
  if (scope === ModelScopeEnum.team && Types.ObjectId.isValid(String(teamId))) {
    const normalizedTeamId = String(teamId);
    return {
      key: `team:${normalizedTeamId}`,
      scope: { scope: ModelScopeEnum.team, teamId: normalizedTeamId }
    };
  }
  return undefined;
};

/**
 * 预检、回填与完成校验共用的单条记录判定逻辑：
 * - 非目标 LLM 或未命中插件预设直接跳过；
 * - 已有 `reasoningEffortList` 必须通过严格等级枚举校验才视为合法人工配置并保留；
 * - 缺失或为 null 的记录校验目录归属后进入回填候选。
 */
export const inspectModelReasoningEffortRecord = (
  record: RawLlmModelRecord,
  presetMap: ReadonlyMap<string, ReasoningEffortLevel[]>
): RecordInspectionResult => {
  const config = record.config;
  const presetLevels = typeof record.model === 'string' ? presetMap.get(record.model) : undefined;

  if (config?.reasoning !== true || config?.reasoningEffort !== true || !presetLevels) {
    return { kind: 'skip' };
  }

  const existingList = config.reasoningEffortList;
  if (existingList !== undefined && existingList !== null) {
    if (ValidReasoningEffortListSchema.safeParse(existingList).success) {
      return { kind: 'skip' };
    }
    return {
      kind: 'invalid',
      message: 'Existing reasoningEffortList is invalid; repair before retrying'
    };
  }

  const resolvedScope = resolveCatalogScope(record.scope, record.teamId);
  if (!resolvedScope) {
    return {
      kind: 'invalid',
      message: 'Invalid LLM model scope; repair before retrying'
    };
  }

  return {
    kind: 'backfill',
    scopeKey: resolvedScope.key,
    scope: resolvedScope.scope,
    candidate: {
      _id: record._id,
      model: record.model as string,
      levels: presetLevels
    }
  };
};

/**
 * 按 `_id` 稳定游标分批预检所有待扫描 LLM 源记录，在首次写入前拦截损坏数据，
 * 内存消耗恒定为 `O(batchSize)`。
 */
export const precheckModelReasoningEffortBatch = async ({
  presetMap,
  endId,
  batchSize = systemMigrationBatchSize,
  signal,
  assertActive
}: {
  presetMap: ReadonlyMap<string, ReasoningEffortLevel[]>;
  endId: string | null;
  batchSize?: number;
  signal: AbortSignal;
  assertActive: () => Promise<void>;
}): Promise<SystemMigrationFailedRecord[]> => {
  if (!endId) return [];

  const maxFailedRecords = batchSize * 10;
  const failures: SystemMigrationFailedRecord[] = [];
  let lastId: Types.ObjectId | undefined;
  const upperBound = new Types.ObjectId(endId);

  while (true) {
    signal.throwIfAborted();
    await assertActive();

    const records = (await MongoAIModel.collection
      .find(
        {
          type: ModelTypeEnum.llm,
          _id: {
            $lte: upperBound,
            ...(lastId ? { $gt: lastId } : {})
          }
        },
        { projection: LLM_BACKFILL_PROJECTION }
      )
      .sort({ _id: 1 })
      .limit(batchSize)
      .toArray()) as RawLlmModelRecord[];

    if (records.length === 0) break;

    for (const record of records) {
      const verdict = inspectModelReasoningEffortRecord(record, presetMap);
      if (verdict.kind === 'invalid') {
        failures.push({
          stageKey: 'backfill',
          data: { id: String(record._id) },
          reason: { message: verdict.message }
        });
        if (failures.length >= maxFailedRecords) {
          return failures;
        }
      }
    }

    lastId = records.at(-1)!._id;
  }

  return failures;
};

/**
 * 对单个有界批次执行分类与按目录作用域的 CAS 快照事务回填：
 * - 单次事务内最多写入 `batchSize` 条记录；
 * - 仅当 `modifiedCount > 0` 时递增目录修订号并刷新缓存，保证崩溃重放零冗余写。
 */
export const processBackfillModelBatch = async ({
  records,
  presetMap,
  signal,
  assertActive
}: {
  records: readonly RawLlmModelRecord[];
  presetMap: ReadonlyMap<string, ReasoningEffortLevel[]>;
  signal: AbortSignal;
  assertActive: () => Promise<void>;
}): Promise<{
  backfilledCount: number;
  skippedCount: number;
  resolvedIds: string[];
  failures: SystemMigrationFailedRecord[];
}> => {
  const grouped = new Map<string, ScopedBackfillGroup>();
  const failures: SystemMigrationFailedRecord[] = [];
  const resolvedIds: string[] = [];
  let skippedCount = 0;

  for (const record of records) {
    const id = String(record._id);
    const verdict = inspectModelReasoningEffortRecord(record, presetMap);
    if (verdict.kind === 'skip') {
      skippedCount += 1;
      resolvedIds.push(id);
      continue;
    }
    if (verdict.kind === 'invalid') {
      failures.push({
        stageKey: 'backfill',
        data: { id },
        reason: { message: verdict.message }
      });
      continue;
    }

    const group = grouped.get(verdict.scopeKey) ?? {
      scope: verdict.scope,
      candidates: []
    };
    group.candidates.push(verdict.candidate);
    grouped.set(verdict.scopeKey, group);
  }

  let backfilledCount = 0;
  const sortedGroups = [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));

  for (const [, group] of sortedGroups) {
    signal.throwIfAborted();
    await assertActive();

    const modifiedCount = await mongoSessionRun(
      async (session) => {
        const operations = group.candidates.map((candidate) => ({
          updateOne: {
            filter: {
              _id: candidate._id,
              type: ModelTypeEnum.llm,
              model: candidate.model,
              'config.reasoning': true,
              'config.reasoningEffort': true,
              $or: [
                { 'config.reasoningEffortList': { $exists: false } },
                { 'config.reasoningEffortList': null }
              ]
            },
            update: {
              $set: { 'config.reasoningEffortList': candidate.levels }
            }
          }
        }));

        const result = await MongoAIModel.collection.bulkWrite(operations, {
          session,
          ordered: true
        });
        if (result.modifiedCount > 0) {
          await incrementModelCatalogRevision(group.scope, session);
        }
        return result.modifiedCount;
      },
      { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } }
    );

    backfilledCount += modifiedCount;
    skippedCount += group.candidates.length - modifiedCount;
    for (const candidate of group.candidates) {
      resolvedIds.push(String(candidate._id));
    }

    if (modifiedCount > 0) {
      if (group.scope.scope === ModelScopeEnum.system) {
        await updatedReloadSystemModel();
      } else {
        invalidateTeamModelCatalog(group.scope.teamId);
      }
    }
  }

  return {
    backfilledCount,
    skippedCount,
    resolvedIds,
    failures
  };
};

/**
 * 按 `_id` 稳定游标分批校验所有命中插件预设且开启思考配置的存量 LLM 均具备合法的 `config.reasoningEffortList`。
 */
export const validateBackfilledModelReasoningEffortList = async ({
  presetMap,
  batchSize = systemMigrationBatchSize,
  signal,
  assertActive
}: {
  presetMap: ReadonlyMap<string, ReasoningEffortLevel[]>;
  batchSize?: number;
  signal: AbortSignal;
  assertActive: () => Promise<void>;
}): Promise<SystemMigrationFailedRecord[]> => {
  const presetModels = [...presetMap.keys()];
  if (presetModels.length === 0) return [];

  const maxFailedRecords = batchSize * 10;
  const failures: SystemMigrationFailedRecord[] = [];
  let lastId: Types.ObjectId | undefined;

  while (true) {
    signal.throwIfAborted();
    await assertActive();

    const records = await MongoAIModel.collection
      .find(
        {
          type: ModelTypeEnum.llm,
          'config.reasoning': true,
          'config.reasoningEffort': true,
          model: { $in: presetModels },
          ...(lastId ? { _id: { $gt: lastId } } : {})
        },
        {
          projection: {
            _id: 1,
            'config.reasoningEffortList': 1
          }
        }
      )
      .sort({ _id: 1 })
      .limit(batchSize)
      .toArray();

    if (records.length === 0) break;

    for (const record of records) {
      const rawList = (record.config as Record<string, unknown> | undefined)?.reasoningEffortList;
      if (!ValidReasoningEffortListSchema.safeParse(rawList).success) {
        failures.push({
          stageKey: 'validation',
          data: { id: String(record._id) },
          reason: {
            message: 'Model reasoningEffortList is missing or invalid; repair before retrying'
          }
        });
        if (failures.length >= maxFailedRecords) {
          return failures;
        }
      }
    }

    lastId = records.at(-1)!._id as Types.ObjectId;
  }

  return failures;
};
