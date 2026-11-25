import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { normalizeReasoningEffortList } from '@fastgpt/global/core/ai/llm/utils';
import {
  ReasoningEffortLevelSchema,
  type ReasoningEffortLevel
} from '@fastgpt/global/core/ai/model/schema';
import type { SystemMigrationFailedRecord } from '@fastgpt/global/migration/schema';
import { Types } from '@fastgpt/service/common/mongo';
import { invalidateTeamModelCatalog } from '@fastgpt/service/core/ai/model/catalog/cache';
import type { ModelCatalogScope } from '@fastgpt/service/core/ai/model/catalog/entity';
import { updatedReloadSystemModel } from '@fastgpt/service/core/ai/model/catalog/service';
import { runModelTransaction } from '@fastgpt/service/core/ai/model/catalog/transaction';
import { MongoAIModel } from '@fastgpt/service/core/ai/model/schema';
import { getPluginModelDocuments } from '@fastgpt/service/core/ai/model/template';
import { z } from 'zod';

const ValidReasoningEffortListSchema = z.array(ReasoningEffortLevelSchema);

type BackfillCandidate = {
  _id: Types.ObjectId;
  model: string;
  levels: ReasoningEffortLevel[];
};

type ScopedBackfillGroup = {
  scope: ModelCatalogScope;
  candidates: BackfillCandidate[];
};

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
 * 按插件预设为存量 LLM 模型回填缺失的 `config.reasoningEffortList`：
 * - 仅处理 `type=llm`、`config.reasoning=true`、`config.reasoningEffort=true` 且未设置 `reasoningEffortList` 的记录；
 * - 已有人工配置的数组（含空数组）一律保留跳过；
 * - 写入前校验全部待更新记录的合法性，避免局部写入；按作用域在快照事务内 CAS 更新并递增目录修订号。
 */
export const backfillModelReasoningEffortList = async ({
  presetMap,
  signal,
  assertActive
}: {
  presetMap: ReadonlyMap<string, ReasoningEffortLevel[]>;
  signal: AbortSignal;
  assertActive: () => Promise<void>;
}): Promise<{
  scannedCount: number;
  backfilledCount: number;
  skippedCount: number;
  failures: SystemMigrationFailedRecord[];
}> => {
  signal.throwIfAborted();
  const models = await MongoAIModel.collection
    .find(
      { type: ModelTypeEnum.llm },
      {
        projection: {
          _id: 1,
          scope: 1,
          teamId: 1,
          model: 1,
          'config.reasoning': 1,
          'config.reasoningEffort': 1,
          'config.reasoningEffortList': 1
        }
      }
    )
    .sort({ _id: 1 })
    .toArray();

  const failures: SystemMigrationFailedRecord[] = [];
  const grouped = new Map<string, ScopedBackfillGroup>();
  let skippedCount = 0;

  for (const record of models) {
    const config = record.config as Record<string, unknown> | undefined;
    const presetLevels = typeof record.model === 'string' ? presetMap.get(record.model) : undefined;

    if (config?.reasoning !== true || config?.reasoningEffort !== true || !presetLevels) {
      skippedCount += 1;
      continue;
    }

    const existingList = config.reasoningEffortList;
    if (Array.isArray(existingList)) {
      skippedCount += 1;
      continue;
    }
    if (existingList !== undefined && existingList !== null) {
      failures.push({
        stageKey: 'backfill',
        data: { id: String(record._id) },
        reason: {
          message: 'Existing reasoningEffortList is not an array; repair before retrying'
        }
      });
      continue;
    }

    const resolvedScope = resolveCatalogScope(record.scope, record.teamId);
    if (!resolvedScope) {
      failures.push({
        stageKey: 'backfill',
        data: { id: String(record._id) },
        reason: {
          message: 'Invalid LLM model scope; repair before retrying'
        }
      });
      continue;
    }

    const group = grouped.get(resolvedScope.key) ?? {
      scope: resolvedScope.scope,
      candidates: []
    };
    group.candidates.push({
      _id: record._id as Types.ObjectId,
      model: record.model,
      levels: presetLevels
    });
    grouped.set(resolvedScope.key, group);
  }

  // 修改目标前先校验全部待处理源记录，存在坏数据时中止，避免留下部分写入。
  if (failures.length > 0) {
    return {
      scannedCount: models.length,
      backfilledCount: 0,
      skippedCount,
      failures
    };
  }

  let backfilledCount = 0;
  const sortedGroups = [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));

  for (const [, group] of sortedGroups) {
    signal.throwIfAborted();
    await assertActive();

    const modifiedCount = await runModelTransaction(group.scope, async (session) => {
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
      return result.modifiedCount;
    });

    backfilledCount += modifiedCount;
    skippedCount += group.candidates.length - modifiedCount;

    if (modifiedCount > 0) {
      if (group.scope.scope === ModelScopeEnum.system) {
        await updatedReloadSystemModel();
      } else {
        invalidateTeamModelCatalog(group.scope.teamId);
      }
    }
  }

  return {
    scannedCount: models.length,
    backfilledCount,
    skippedCount,
    failures: []
  };
};

/**
 * 校验所有命中插件预设且开启思考配置的存量 LLM 均已具备合法的 `config.reasoningEffortList`。
 */
export const validateBackfilledModelReasoningEffortList = async ({
  presetMap
}: {
  presetMap: ReadonlyMap<string, ReasoningEffortLevel[]>;
}): Promise<SystemMigrationFailedRecord[]> => {
  const presetModels = [...presetMap.keys()];
  if (presetModels.length === 0) return [];

  const records = await MongoAIModel.collection
    .find(
      {
        type: ModelTypeEnum.llm,
        'config.reasoning': true,
        'config.reasoningEffort': true,
        model: { $in: presetModels }
      },
      {
        projection: {
          _id: 1,
          'config.reasoningEffortList': 1
        }
      }
    )
    .sort({ _id: 1 })
    .toArray();

  const failures: SystemMigrationFailedRecord[] = [];
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
    }
  }

  return failures;
};
