import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
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

export const ValidReasoningEffortListSchema = z.array(ReasoningEffortLevelSchema).min(1);

export const getMaxFailedRecords = (batchSize: number) => batchSize * 10;

const LLM_BACKFILL_PROJECTION = {
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

/** 按 `_id` 升序游标分批遍历匹配的 LLM 文档，单次内存消耗恒定为 `O(batchSize)`。 */
const iterateLlmModelBatches = async ({
  filter,
  projection,
  endId,
  batchSize,
  signal,
  assertActive,
  onBatch
}: {
  filter: Record<string, unknown>;
  projection: Record<string, 1>;
  endId?: string;
  batchSize: number;
  signal: AbortSignal;
  assertActive: () => Promise<void>;
  onBatch: (records: RawLlmModelRecord[]) => boolean | void;
}) => {
  const upperBound = endId ? new Types.ObjectId(endId) : undefined;
  let lastId: Types.ObjectId | undefined;

  while (true) {
    signal.throwIfAborted();
    await assertActive();

    const idFilter =
      upperBound || lastId
        ? {
            ...(upperBound ? { $lte: upperBound } : {}),
            ...(lastId ? { $gt: lastId } : {})
          }
        : undefined;

    const records = (await MongoAIModel.collection
      .find(
        {
          type: ModelTypeEnum.llm,
          ...filter,
          ...(idFilter ? { _id: idFilter } : {})
        },
        { projection }
      )
      .sort({ _id: 1 })
      .limit(batchSize)
      .toArray()) as RawLlmModelRecord[];

    if (records.length === 0) break;
    if (onBatch(records) === false) break;

    lastId = records.at(-1)!._id;
  }
};

/** 查询当前 LLM 模型集合的最大 `_id`，用作本次迁移的扫描上界。 */
export const findLastLlmModelId = async (): Promise<string | null> => {
  const lastDoc = await MongoAIModel.collection.findOne(
    { type: ModelTypeEnum.llm },
    { projection: { _id: 1 }, sort: { _id: -1 } }
  );
  return lastDoc ? String(lastDoc._id) : null;
};

/** 按 ID 列表批量查询待重试的 LLM 文档。 */
export const findLlmModelsByIds = async (ids: readonly string[]): Promise<RawLlmModelRecord[]> => {
  const validObjectIds = ids
    .filter((id) => Types.ObjectId.isValid(id))
    .map((id) => new Types.ObjectId(id));
  if (validObjectIds.length === 0) return [];

  return (await MongoAIModel.collection
    .find(
      { _id: { $in: validObjectIds }, type: ModelTypeEnum.llm },
      { projection: LLM_BACKFILL_PROJECTION }
    )
    .sort({ _id: 1 })
    .toArray()) as RawLlmModelRecord[];
};

/** 读取断点游标之后的下一批待回填 LLM 文档。 */
export const findNextLlmModelBatch = async ({
  endId,
  lastId,
  batchSize
}: {
  endId: string;
  lastId: string | null;
  batchSize: number;
}): Promise<RawLlmModelRecord[]> =>
  (await MongoAIModel.collection
    .find(
      {
        type: ModelTypeEnum.llm,
        _id: {
          $lte: new Types.ObjectId(endId),
          ...(lastId ? { $gt: new Types.ObjectId(lastId) } : {})
        }
      },
      { projection: LLM_BACKFILL_PROJECTION }
    )
    .sort({ _id: 1 })
    .limit(batchSize)
    .toArray()) as RawLlmModelRecord[];

/**
 * 复用官方插件模板解析边界提取显式声明了思考等级预设的 `model -> reasoningEffortList` 映射。
 * 模板文档转换层保留未配置字段为 `undefined`，旧版插件未返回预设时结果为空并由迁移显式失败。
 */
export const loadPluginReasoningEffortPresets = async (): Promise<
  Map<string, ReasoningEffortLevel[]>
> => {
  const documents = await getPluginModelDocuments();
  const presetMap = new Map<string, ReasoningEffortLevel[]>();

  for (const doc of documents) {
    if (
      doc.type !== ModelTypeEnum.llm ||
      !doc.config.reasoning ||
      !doc.config.reasoningEffort ||
      !doc.config.reasoningEffortList?.length
    ) {
      continue;
    }
    if (!presetMap.has(doc.model)) {
      presetMap.set(doc.model, doc.config.reasoningEffortList);
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
 * - 已有非空 `reasoningEffortList` 必须通过严格等级枚举校验才视为合法人工配置并保留；
 * - 缺失、null 或空数组均视为未配置，校验目录归属后进入回填候选。
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
  const isUnsetOrEmpty =
    existingList === undefined ||
    existingList === null ||
    (Array.isArray(existingList) && existingList.length === 0);

  if (!isUnsetOrEmpty) {
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

/** 按 `_id` 稳定游标分批预检所有待扫描 LLM 源记录，在首次写入前拦截损坏数据。 */
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

  const maxFailedRecords = getMaxFailedRecords(batchSize);
  const failures: SystemMigrationFailedRecord[] = [];

  await iterateLlmModelBatches({
    filter: {},
    projection: LLM_BACKFILL_PROJECTION,
    endId,
    batchSize,
    signal,
    assertActive,
    onBatch: (records) => {
      for (const record of records) {
        const verdict = inspectModelReasoningEffortRecord(record, presetMap);
        if (verdict.kind === 'invalid') {
          failures.push({
            stageKey: 'backfill',
            data: { id: String(record._id) },
            reason: { message: verdict.message }
          });
          if (failures.length >= maxFailedRecords) {
            return false;
          }
        }
      }
    }
  });

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
  resolvedIds: string[];
  failures: SystemMigrationFailedRecord[];
}> => {
  const grouped = new Map<string, ScopedBackfillGroup>();
  const failures: SystemMigrationFailedRecord[] = [];
  const resolvedIds: string[] = [];

  for (const record of records) {
    const id = String(record._id);
    const verdict = inspectModelReasoningEffortRecord(record, presetMap);
    if (verdict.kind === 'skip') {
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
                { 'config.reasoningEffortList': null },
                { 'config.reasoningEffortList': [] }
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
    resolvedIds,
    failures
  };
};

/**
 * 按 `_id` 稳定游标分批校验所有命中插件预设且开启思考配置的存量 LLM 均具备合法的非空 `config.reasoningEffortList`，
 * 并返回本次复验通过的确定性模型总数。
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
}): Promise<{
  verifiedCount: number;
  failures: SystemMigrationFailedRecord[];
}> => {
  const presetModels = [...presetMap.keys()];
  if (presetModels.length === 0) return { verifiedCount: 0, failures: [] };

  const maxFailedRecords = getMaxFailedRecords(batchSize);
  const failures: SystemMigrationFailedRecord[] = [];
  let verifiedCount = 0;

  await iterateLlmModelBatches({
    filter: {
      'config.reasoning': true,
      'config.reasoningEffort': true,
      model: { $in: presetModels }
    },
    projection: {
      _id: 1,
      'config.reasoningEffortList': 1
    },
    batchSize,
    signal,
    assertActive,
    onBatch: (records) => {
      for (const record of records) {
        const rawList = record.config?.reasoningEffortList;
        if (!ValidReasoningEffortListSchema.safeParse(rawList).success) {
          failures.push({
            stageKey: 'validation',
            data: { id: String(record._id) },
            reason: {
              message: 'Model reasoningEffortList is missing or invalid; repair before retrying'
            }
          });
          if (failures.length >= maxFailedRecords) {
            return false;
          }
        } else {
          verifiedCount += 1;
        }
      }
    }
  });

  return { verifiedCount, failures };
};
