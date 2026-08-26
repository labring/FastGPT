import { connectionMongo, Types } from '../../../common/mongo';
import { getLogger, LogCategories } from '../../../common/logger';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { getAIProxyAdminConfig } from '../../../thirdProvider/aiproxy/config';
import { getRealtimeSystemChannels } from '../channel/api';
import { axiosWithoutSSRF } from '../../../common/api/axios';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';

const logger = getLogger(LogCategories.SYSTEM);
const BATCH_SIZE = 500;

const LEGACY_NUMERIC_FIELDS = [
  'charsPointsPrice',
  'inputPrice',
  'outputPrice',
  'maxContext',
  'maxResponse',
  'quoteMaxToken',
  'maxTemperature',
  'defaultToken',
  'maxToken',
  'weight',
  'batchSize',
  'minInputTokens',
  'maxInputTokens'
] as const;

/** Normalize scalar prices and serialized price tiers written by 4.16 and earlier. */
const normalizeLegacyModelValues = (input: Record<string, any>) => {
  const output = { ...input };
  let changed = false;

  for (const field of LEGACY_NUMERIC_FIELDS) {
    const value = output[field];
    if (typeof value !== 'string' || value.trim() === '') continue;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) continue;
    output[field] = parsed;
    changed = true;
  }

  if (typeof output.priceTiers === 'string') {
    try {
      const parsed = JSON.parse(output.priceTiers);
      if (Array.isArray(parsed)) {
        output.priceTiers = parsed.map((tier) => {
          if (!tier || typeof tier !== 'object') return tier;
          return normalizeLegacyModelValues(tier).output;
        });
        changed = true;
      }
    } catch {
      // Keep malformed values for manual correction instead of changing their meaning.
    }
  } else if (Array.isArray(output.priceTiers)) {
    const normalizedTiers = output.priceTiers.map((tier) => {
      if (!tier || typeof tier !== 'object') return tier;
      return normalizeLegacyModelValues(tier);
    });
    if (normalizedTiers.some((tier) => tier.changed)) {
      output.priceTiers = normalizedTiers.map((tier) => tier.output);
      changed = true;
    }
  }

  return { output, changed };
};

/**
 * True when the value is a real ObjectId (string form or ObjectId instance).
 * Used to decide whether a canonical field already holds a valid id — an
 * existing canonical value that is NOT a valid ObjectId (e.g. a legacy name
 * string written as a W1 residue) must not block re-resolution, and a
 * resolved name must never be written over an existing valid id.
 */
const isValidObjectId = (value: unknown): boolean => {
  if (typeof value !== 'string' && !(value instanceof Types.ObjectId)) return false;
  return Types.ObjectId.isValid(value);
};

/** Match a field against the value observed by the migration read. */
const snapshotFieldFilter = (field: string, value: unknown): Record<string, unknown> => ({
  [field]: value === undefined ? { $exists: false } : value
});

/* ═══ Step 1: Index migration ═══ */

/**
 * Create the post-refactor indexes and remove the legacy global model
 * uniqueness constraint so teams can configure the same provider model.
 */
export async function createNewIndexes(): Promise<string[]> {
  const db = connectionMongo.connection.db;
  if (!db) return [];

  const created: string[] = [];
  const collection = db.collection('system_models');
  const indexesBefore = await collection.listIndexes().toArray();
  const existingIndexNames = new Set(indexesBefore.map(({ name }) => name).filter(Boolean));
  const legacyModelIndex = indexesBefore.find(
    (index: { name?: string; key?: Record<string, unknown>; unique?: boolean }) =>
      index.name === 'model_1' &&
      index.unique === true &&
      JSON.stringify(index.key) === JSON.stringify({ model: 1 })
  );
  // MongoDB rejects two indexes with the same key pattern and incompatible
  // options, even when their names differ. The controlled-upgrade write freeze
  // makes this precise drop safe before creating the scoped replacement.
  if (legacyModelIndex?.name) {
    await collection.dropIndex(legacyModelIndex.name);
    existingIndexNames.delete(legacyModelIndex.name);
    logger.info('Dropped deprecated system_models.model unique index', {
      indexName: legacyModelIndex.name
    });
  }
  // The pre-refactor schema stored display names in metadata.name and only
  // enforced global model uniqueness. Read both legacy and canonical shapes,
  // but group by the exact scope of each replacement index. A duplicate
  // private model/name across different tmbIds is valid and must not disable
  // the private unique indexes.
  const findScopedCollisions = async (field: 'model' | 'name') => {
    const effectiveField = field === 'name' ? '$effectiveName' : '$effectiveModel';
    return collection
      .aggregate<{ _id: Record<string, unknown>; count: number }>([
        {
          $addFields: {
            effectiveModel: { $ifNull: ['$model', '$metadata.model'] },
            effectiveName: { $ifNull: ['$name', '$metadata.name'] },
            effectiveTmbId: { $ifNull: ['$tmbId', '$metadata.tmbId'] },
            effectiveIsCustom: { $ifNull: ['$isCustom', '$metadata.isCustom'] }
          }
        },
        {
          $addFields: {
            effectiveIsSystem: {
              $cond: [
                { $ne: [{ $type: '$isSystem' }, 'missing'] },
                '$isSystem',
                {
                  $cond: [
                    { $ne: ['$effectiveIsCustom', null] },
                    { $eq: ['$effectiveIsCustom', false] },
                    { $eq: ['$effectiveTmbId', null] }
                  ]
                }
              ]
            }
          }
        },
        { $match: { $expr: { $ne: [effectiveField, null] } } },
        {
          $group: {
            _id: {
              scope: { $cond: ['$effectiveIsSystem', 'system', 'private'] },
              tmbId: { $cond: ['$effectiveIsSystem', null, '$effectiveTmbId'] },
              value: effectiveField
            },
            count: { $sum: 1 }
          }
        },
        { $match: { count: { $gt: 1 } } }
      ])
      .toArray();
  };

  const [modelCollisions, nameCollisions] = await Promise.all([
    findScopedCollisions('model'),
    findScopedCollisions('name')
  ]);
  const blockedIndexes = new Set<string>();
  if (modelCollisions.some(({ _id }) => _id.scope === 'system')) {
    blockedIndexes.add('model_1_system_unique');
  }
  if (modelCollisions.some(({ _id }) => _id.scope === 'private')) {
    blockedIndexes.add('tmbId_1_model_1_private_unique');
  }
  if (modelCollisions.length > 0) {
    logger.warn('Skipped model unique indexes due to legacy collisions', {
      collisions: modelCollisions
    });
  }
  if (nameCollisions.some(({ _id }) => _id.scope === 'system')) {
    blockedIndexes.add('name_1_system_unique');
  }
  if (nameCollisions.some(({ _id }) => _id.scope === 'private')) {
    blockedIndexes.add('tmbId_1_name_1_private_unique');
  }
  if (nameCollisions.length > 0) {
    logger.warn('Skipped display-name unique indexes due to legacy collisions', {
      collisions: nameCollisions
    });
  }
  const newIndexes: {
    key: Record<string, number>;
    name: string;
    options?: Record<string, unknown>;
  }[] = [
    {
      key: { model: 1 },
      name: 'model_1_system_unique',
      options: { unique: true, partialFilterExpression: { isSystem: true } }
    },
    {
      key: { name: 1 },
      name: 'name_1_system_unique',
      options: {
        unique: true,
        partialFilterExpression: { isSystem: true, name: { $exists: true } }
      }
    },
    {
      key: { tmbId: 1, model: 1 },
      name: 'tmbId_1_model_1_private_unique',
      options: { unique: true, partialFilterExpression: { isSystem: false } }
    },
    {
      key: { tmbId: 1, name: 1 },
      name: 'tmbId_1_name_1_private_unique',
      options: {
        unique: true,
        partialFilterExpression: { isSystem: false, name: { $exists: true } }
      }
    },
    { key: { teamId: 1 }, name: 'teamId_1' },
    { key: { tmbId: 1 }, name: 'tmbId_1' },
    { key: { isActive: 1, provider: 1 }, name: 'isActive_1_provider_1' }
  ];

  for (const { key, name, options } of newIndexes) {
    if (blockedIndexes.has(name)) continue;
    if (existingIndexNames.has(name)) continue;
    await collection.createIndex(key, {
      name,
      background: true,
      ...options
    });
    created.push(name);
    existingIndexNames.add(name);
  }

  return created;
}

/* ═══ Step 2: system_models data migration (additive) ═══ */

export type ModelMigrationResult = {
  total: number;
  flattened: number;
  normalized: number;
  isSystemSet: number;
  defaultsCleaned: number;
  /** System default model ids collected from legacy isDefault* flags (Step 8). */
  systemDefaults: Record<string, string>;
  /** Legacy requestUrl/requestAuth collected for Channel migration (Step 10). */
  channelConfigs: { model: string; requestUrl: string; requestAuth: string }[];
};

/**
 * Migrate legacy system_models documents (additive, 热升级兼容):
 * - only fill missing top-level fields from `metadata`; `metadata` itself is preserved
 * - `isSystem` is only derived when missing, never overwritten
 * - legacy fields (isDefault*, isCustom, tmbId/teamId, requestUrl/requestAuth) are
 *   kept in the database — the old image reads them after rollback
 * - legacy isDefault* flags are collected into `systemDefaults` (Step 8)
 * - legacy requestUrl/requestAuth are collected into `channelConfigs` (Step 10)
 */
export async function migrateModelData(): Promise<ModelMigrationResult> {
  const db = connectionMongo.connection.db;
  const result: ModelMigrationResult = {
    total: 0,
    flattened: 0,
    normalized: 0,
    isSystemSet: 0,
    defaultsCleaned: 0,
    systemDefaults: {},
    channelConfigs: []
  };
  if (!db) return result;

  // Legacy isDefault* flags → system default ids (first-seen wins, not per-team)
  const systemDefaults: Record<string, string> = {};
  // Legacy metadata requestUrl/requestAuth → Channel configs (Step 10)
  const channelConfigs: { model: string; requestUrl: string; requestAuth: string }[] = [];

  const cursor = db.collection('system_models').find({}).batchSize(BATCH_SIZE);

  while (await cursor.hasNext()) {
    const batch = [];
    for (let i = 0; i < BATCH_SIZE && (await cursor.hasNext()); i++) {
      batch.push(await cursor.next());
    }

    const bulkOps: any[] = [];
    for (const doc of batch as any[]) {
      result.total++;
      const $set: Record<string, any> = {};

      const normalizedMetadata = (() => {
        if (!doc.metadata || typeof doc.metadata !== 'object') return undefined;
        const normalized = normalizeLegacyModelValues(doc.metadata);
        if (normalized.changed) {
          $set.metadata = normalized.output;
          result.normalized++;
        }
        return normalized.output;
      })();

      const normalizedTopLevel = normalizeLegacyModelValues(doc);
      if (normalizedTopLevel.changed) {
        for (const field of [...LEGACY_NUMERIC_FIELDS, 'priceTiers'] as const) {
          if (normalizedTopLevel.output[field] !== doc[field]) {
            $set[field] = normalizedTopLevel.output[field];
          }
        }
        if (!normalizedMetadata) result.normalized++;
      }

      // 2a. Flatten（additive）：仅补缺失的顶层字段，metadata 整体保留。
      //     requestUrl/requestAuth 只收集给 Step 10，不扁平化（保留原字段）。
      if (normalizedMetadata) {
        for (const [key, value] of Object.entries(normalizedMetadata)) {
          if (value === null || value === undefined || value === '') continue;
          // 顶层已存在则不覆盖；requestUrl/requestAuth 不扁平化
          if (doc[key] === undefined && !['requestUrl', 'requestAuth'].includes(key)) {
            $set[key] = value;
          }
        }
        result.flattened++;
      }

      // 2a2. 收集 requestUrl/requestAuth 用于 Channel 迁移（Step 10）。
      //       仅读取收集，不从数据库删除（旧镜像回滚后仍可读）。
      const chanUrl = doc.requestUrl ?? doc.metadata?.requestUrl;
      const chanAuth = doc.requestAuth ?? doc.metadata?.requestAuth;
      if (chanUrl && chanAuth) {
        channelConfigs.push({
          model: ($set.model ?? doc.model) as string,
          requestUrl: chanUrl,
          requestAuth: chanAuth
        });
      }

      // 2b. isSystem 推导（只补缺失，不覆盖已有值；不删除 isCustom）。
      //     无 owner 信息（孤儿）的模型视为系统模型。
      const effectiveTmbId = $set.tmbId ?? doc.tmbId;
      const isCustom = doc.isCustom ?? doc.metadata?.isCustom;
      if (doc.isSystem === undefined) {
        if (isCustom !== undefined) {
          $set.isSystem = !isCustom;
          result.isSystemSet++;
        } else if (effectiveTmbId === undefined || effectiveTmbId === null) {
          $set.isSystem = true;
          result.isSystemSet++;
        }
      }

      // 2c. 收集 isDefault* 标记到 systemDefaults（字段本身保留，不删除）。
      //     同时兼容 metadata 内嵌的标记（2a 已可能将其扁平化到顶层）。
      const modelId = String(doc._id);
      const modelType = doc.type ?? doc.metadata?.type;
      const flagValue = (field: string) => doc[field] ?? doc.metadata?.[field];
      if (flagValue('isDefault')) {
        if (modelType === 'llm' && !systemDefaults.llmId) systemDefaults.llmId = modelId;
        if (modelType === 'embedding' && !systemDefaults.embeddingId)
          systemDefaults.embeddingId = modelId;
        if (modelType === 'tts' && !systemDefaults.ttsId) systemDefaults.ttsId = modelId;
        if (modelType === 'stt' && !systemDefaults.sttId) systemDefaults.sttId = modelId;
        if (modelType === 'rerank' && !systemDefaults.rerankId) systemDefaults.rerankId = modelId;
      }
      if (flagValue('isDefaultDatasetTextModel') && !systemDefaults.datasetTextLLMId)
        systemDefaults.datasetTextLLMId = modelId;
      if (flagValue('isDefaultDatasetImageModel') && !systemDefaults.datasetImageLLMId)
        systemDefaults.datasetImageLLMId = modelId;
      if (flagValue('isDefaultChatTitleModel') && !systemDefaults.chatTitleLLMId)
        systemDefaults.chatTitleLLMId = modelId;
      if (flagValue('isDefaultHelperBotModel') && !systemDefaults.helperBotLLMId)
        systemDefaults.helperBotLLMId = modelId;

      // 2d. ⚠️ 热升级修订：不再 $unset isDefault / isDefaultXxx / isCustom / metadata——
      //     旧镜像回滚依赖这些 legacy 字段；新镜像缓存按「default_models → isDefault* flags」顺序解析默认模型。

      // 2e. ⚠️ 热升级修订：不再 $unset tmbId/teamId（即使 isSystem: true）——
      //     缓存构建时在内存中清理系统模型的 owner 信息，数据库字段保留。

      // 2g. 补齐缺失的必填字段默认值（只补缺失，不覆盖已有值）
      if (modelType === 'llm') {
        if (doc.maxContext === undefined && $set.maxContext === undefined) {
          $set.maxContext = 16000;
          result.defaultsCleaned++;
        }
        if (doc.maxResponse === undefined && $set.maxResponse === undefined) {
          $set.maxResponse = 8000;
          result.defaultsCleaned++;
        }
        if (doc.functionCall === undefined && $set.functionCall === undefined) {
          $set.functionCall = true;
          result.defaultsCleaned++;
        }
        if (doc.toolChoice === undefined && $set.toolChoice === undefined) {
          $set.toolChoice = true;
          result.defaultsCleaned++;
        }
        if (doc.quoteMaxToken === undefined && $set.quoteMaxToken === undefined) {
          $set.quoteMaxToken = 120000;
          result.defaultsCleaned++;
        }
      } else if (modelType === 'embedding') {
        if (doc.defaultToken === undefined && $set.defaultToken === undefined) {
          $set.defaultToken = 512;
          result.defaultsCleaned++;
        }
        if (doc.maxToken === undefined && $set.maxToken === undefined) {
          $set.maxToken = 512;
          result.defaultsCleaned++;
        }
        if (doc.weight === undefined && $set.weight === undefined) {
          $set.weight = 0;
          result.defaultsCleaned++;
        }
      } else if (modelType === 'tts') {
        if (doc.voices === undefined && $set.voices === undefined) {
          $set.voices = [];
          result.defaultsCleaned++;
        }
      }

      // 写入（仅 $set，无 $unset）
      if (Object.keys($set).length > 0) {
        bulkOps.push({
          updateOne: {
            filter: { _id: doc._id },
            update: { $set }
          }
        });
      }
    }

    if (bulkOps.length > 0) {
      await db.collection('system_models').bulkWrite(bulkOps, { ordered: false });
    }
  }

  logger.info(
    `Model migration (additive): total ${result.total}, flattened ${result.flattened}, normalized ${result.normalized}, isSystem ${result.isSystemSet}, defaults filled ${result.defaultsCleaned}, channel configs collected ${channelConfigs.length}`
  );
  return { ...result, systemDefaults, channelConfigs };
}

/* ═══ Step 3: modelName → modelId map ═══ */

/**
 * Build provider model name → modelId and alias name → modelId maps.
 * Only active system models are included (isSystem: true, isActive: true) —
 * the map must never point at a deactivated model or a team-private model.
 * When the same name maps to multiple ids, the first one wins (deterministic)
 * and the collision is recorded in `ambiguous` for manual confirmation before
 * the write freeze is lifted.
 */
export async function buildModelNameToIdMap(): Promise<{
  modelMap: Map<string, string>;
  nameMap: Map<string, string>;
  ambiguous: { name: string; ids: string[] }[];
}> {
  const db = connectionMongo.connection.db;
  const modelMap = new Map<string, string>();
  const nameMap = new Map<string, string>();
  const ambiguous: { name: string; ids: string[] }[] = [];
  if (!db) return { modelMap, nameMap, ambiguous };

  const models = (await db
    .collection('system_models')
    .find({ isSystem: true, isActive: true }) // ⚠️ 修订：仅纳入活跃系统模型
    .sort({ isActive: -1 }) // active models first (isActive: true sorts ahead)
    .project({ model: 1, name: 1, isActive: 1 })
    .toArray()) as any[];

  const register = (map: Map<string, string>, key: string, id: string) => {
    if (!key) return;
    if (!map.has(key)) {
      map.set(key, id);
    } else if (map.get(key) !== id) {
      // 同 key 不同 id：记录 ambiguous（首条仍占位，保持确定性 first-wins）
      const existing = ambiguous.find((a) => a.name === key);
      if (existing) {
        if (!existing.ids.includes(id)) existing.ids.push(id);
      } else {
        ambiguous.push({ name: key, ids: [map.get(key)!, id] });
      }
    }
  };

  for (const m of models) {
    const id = String(m._id);
    register(modelMap, m.model as string, id);
    register(nameMap, m.name as string, id);
  }

  logger.info(
    `Built model name→id map: ${modelMap.size} model names, ${nameMap.size} alias names, ${ambiguous.length} ambiguous`
  );
  return { modelMap, nameMap, ambiguous };
}

/* ═══ Shared helpers (Steps 4-9) ═══ */

/** workflow node inputs: legacy model key → canonical modelId key */
export const WORKFLOW_MODEL_KEY_MAP: Record<string, string> = {
  model: 'modelId',
  embeddingModel: 'embeddingModelId',
  rerankModel: 'rerankModelId',
  datasetSearchExtensionModel: 'datasetSearchExtensionModelId',
  datasetDeepSearchModel: 'datasetDeepSearchModelId'
};

/** canonical (modelId) workflow keys — for W1 residue (canonical key + name value) */
const WORKFLOW_MODEL_CANONICAL_KEYS = new Set(Object.values(WORKFLOW_MODEL_KEY_MAP));

/** model fields inside the datasetParams composite object */
export const DATASET_PARAMS_MODEL_FIELDS = [
  'embeddingModel',
  'rerankModel',
  'datasetSearchExtensionModel',
  'datasetDeepSearchModel'
];

/**
 * Convert a model name string to a modelId.
 * First match by modelMap (provider name), then nameMap (alias).
 * Only Step 7 (usage_items) needs nameMap fallback — historical records may
 * store the alias instead of the provider name.
 *
 * ⚠️ 热升级修订：调用方必须校验返回 `resolved`——解析失败（仍为 name 字符串）时
 * 不得写入 canonical 字段（禁止 name 污染 id 字段），计入 unresolved。
 */
export const convertModelValue = (
  value: unknown,
  modelMap: Map<string, string>,
  nameMap?: Map<string, string>
): { value: unknown; resolved: boolean } => {
  if (typeof value !== 'string' || !value) return { value, resolved: false };
  const hit = modelMap.get(value) ?? nameMap?.get(value);
  return hit ? { value: hit, resolved: true } : { value, resolved: false };
};

/* ═══ Step 4: datasets migration (additive) ═══ */

/**
 * Additive dataset migration: only `$set *ModelId` when the legacy value
 * resolves to a real modelId; legacy fields (vectorModel/agentModel/vlmModel)
 * are preserved. D3 (canonical holds a name) and D0 (canonical missing) are
 * handled uniformly: a valid canonical ObjectId is never overwritten; otherwise
 * the value is resolved from canonical first, then legacy. Unresolved values
 * are NOT written and are returned for manual review.
 */
export async function migrateDatasets(modelMap: Map<string, string>): Promise<{
  total: number;
  migrated: number;
  conflicts: number;
  unresolved: { datasetId: string; field: string; value: string }[];
}> {
  const db = connectionMongo.connection.db;
  if (!db) return { total: 0, migrated: 0, conflicts: 0, unresolved: [] };

  const cursor = db
    .collection('datasets')
    .find({
      $or: [
        { vectorModel: { $exists: true } },
        { agentModel: { $exists: true } },
        { vlmModel: { $exists: true } }
      ]
    })
    .project({
      vectorModel: 1,
      vectorModelId: 1,
      agentModel: 1,
      agentModelId: 1,
      vlmModel: 1,
      vlmModelId: 1
    })
    .batchSize(BATCH_SIZE);

  let total = 0;
  let migrated = 0;
  let conflicts = 0;
  const unresolved: { datasetId: string; field: string; value: string }[] = [];

  while (await cursor.hasNext()) {
    const batch = [];
    for (let i = 0; i < BATCH_SIZE && (await cursor.hasNext()); i++) {
      batch.push(await cursor.next());
    }

    const bulkOps: any[] = [];
    for (const doc of batch as any[]) {
      total++;
      const $set: Record<string, any> = {};

      for (const [oldField, newField] of [
        ['vectorModel', 'vectorModelId'],
        ['agentModel', 'agentModelId'],
        ['vlmModel', 'vlmModelId']
      ] as const) {
        // canonical 已有有效 ObjectId → 不覆盖（幂等）
        const existingCanonical = doc[newField];
        if (isValidObjectId(existingCanonical)) continue;

        // D3（canonical 存 name）/ D0（canonical 缺失）→ 从 canonical/legacy 解析写入
        const legacyVal = doc[oldField];
        if (existingCanonical === undefined && legacyVal === undefined) continue;

        const canonicalResult = convertModelValue(existingCanonical, modelMap);
        const legacyResult = convertModelValue(legacyVal, modelMap);
        const { value, resolved } = canonicalResult.resolved ? canonicalResult : legacyResult;
        if (resolved) {
          $set[newField] = value;
        } else {
          // unresolved：不写入 canonical 字段（原 name 不污染 id 字段），记录供人工排查
          unresolved.push({
            datasetId: String(doc._id),
            field: oldField,
            value: String(existingCanonical ?? legacyVal)
          });
        }
      }

      if (Object.keys($set).length > 0) {
        bulkOps.push({
          updateOne: {
            filter: {
              _id: doc._id,
              $and: Object.keys($set).map((field) => snapshotFieldFilter(field, doc[field]))
            },
            update: { $set }
          }
        });
      }
    }

    if (bulkOps.length > 0) {
      const result = await db.collection('datasets').bulkWrite(bulkOps);
      migrated += result.modifiedCount;
      conflicts += bulkOps.length - result.modifiedCount;
    }
  }

  logger.info(
    `Dataset migration (additive): ${migrated}/${total} datasets, ${conflicts} conflicts, ${unresolved.length} unresolved`
  );
  return { total, migrated, conflicts, unresolved };
}

/* ═══ Step 5: apps + app_versions migration (additive) ═══ */

/**
 * Migrate a single workflow node input object (additive, 热升级兼容).
 * - legacy input is preserved; a canonical sibling input is appended to the
 *   `inputs` array when missing (canonical inputs are sibling elements of the
 *   node's inputs array — `FlowNodeInputItemType` has no nested `appInputs`)
 * - W1 residue (canonical key + name value) is resolved in place when possible
 * - an existing valid canonical input is never overwritten
 * - reference-type inputs (selectedTypeIndex !== 0) are skipped
 * - unresolved values are not written and are recorded with the app id
 */
const migrateInput = (
  inputs: Record<string, any>[], // 当前 node 的 inputs 数组（migrate 时逐元素传入自身引用所在数组）
  input: Record<string, any>,
  appId: string, // 调用方传入，用于 unresolved 定位
  modelMap: Map<string, string>,
  unresolved: { appId: string; key: string; value: string }[]
): boolean => {
  let changed = false;

  // 仅转换非引用类型（非 reference）的 value
  const isReference = input.selectedTypeIndex !== undefined && input.selectedTypeIndex !== 0;

  // W1 residue：canonical key + name value → 解析为 id（成功才写）
  if (input.key && WORKFLOW_MODEL_CANONICAL_KEYS.has(input.key)) {
    if (
      !isReference &&
      typeof input.value === 'string' &&
      input.value &&
      !isValidObjectId(input.value)
    ) {
      const canonicalResult = convertModelValue(input.value, modelMap);
      const legacyKey = Object.entries(WORKFLOW_MODEL_KEY_MAP).find(
        ([, canonicalKey]) => canonicalKey === input.key
      )?.[0];
      const legacyInput = legacyKey ? inputs.find((item) => item.key === legacyKey) : undefined;
      const legacyResult = convertModelValue(legacyInput?.value, modelMap);
      const { value, resolved } = canonicalResult.resolved ? canonicalResult : legacyResult;
      if (resolved && value !== input.value) {
        input.value = value;
        changed = true;
      } else if (!resolved) {
        // name 无法解析且不是 ObjectId：不写入，记录 unresolved
        unresolved.push({ appId, key: input.key, value: input.value });
      }
    }
  }

  // legacy key → 保留 legacy input，在 inputs 数组新增 canonical 兄弟副本
  if (input.key && WORKFLOW_MODEL_KEY_MAP[input.key]) {
    const legacyKey = input.key;
    const canonicalKey = WORKFLOW_MODEL_KEY_MAP[legacyKey];

    if (!isReference && typeof input.value === 'string' && input.value) {
      const { value, resolved } = convertModelValue(input.value, modelMap);
      if (resolved) {
        // 已有 canonical input 只补缺失的展示配置，避免旧迁移生成的
        // `{ key, value }` 残缺节点无法通过详情接口的 Schema 校验。
        const existingCanonical = inputs.find((i) => i.key === canonicalKey);
        if (!existingCanonical) {
          inputs.push({ ...input, key: canonicalKey, value });
          changed = true;
        } else {
          for (const [field, fieldValue] of Object.entries(input)) {
            if (field === 'key' || field === 'value' || existingCanonical[field] !== undefined) {
              continue;
            }
            existingCanonical[field] = fieldValue;
            changed = true;
          }

          // 若 canonical 是无法解析的 W1 residue，则用可解析的 legacy 值修正。
          if (!isReference && !isValidObjectId(existingCanonical.value)) {
            existingCanonical.value = value;
            changed = true;
          }
        }
      } else {
        unresolved.push({ appId, key: legacyKey, value: input.value });
      }
    }
  }

  // datasetParams 复合对象中的模型字段（保留旧字段并补新字段）
  if (
    input.key === NodeInputKeyEnum.datasetParams &&
    input.value &&
    typeof input.value === 'object'
  ) {
    const val = input.value as Record<string, unknown>;
    for (const field of DATASET_PARAMS_MODEL_FIELDS) {
      if (field in val) {
        const canonicalField = WORKFLOW_MODEL_KEY_MAP[field];
        // 保留旧字段；canonical 缺失时才补充
        if (val[canonicalField] === undefined) {
          const { value, resolved } = convertModelValue(val[field], modelMap);
          if (resolved) {
            val[canonicalField] = value;
            changed = true;
          } else {
            unresolved.push({ appId, key: `datasetParams.${field}`, value: val[field] as string });
          }
        }
      }
    }
  }

  return changed;
};

/**
 * Migrate apps + app_versions workflow nodes and chatConfig (additive).
 * - legacy inputs/chatConfig keys are preserved; canonical fields are added
 * - apps updates use `_id + updateTime` CAS, autosave versions use `_id + time`:
 *   an in-flight save between read and write fails the CAS and is counted as a
 *   conflict instead of being overwritten — re-running the migration completes it
 */
export async function migrateAppWorkflows(modelMap: Map<string, string>): Promise<{
  appsChecked: number;
  appsMigrated: number;
  versionsMigrated: number;
  conflicts: number;
  unresolved: { appId: string; key: string; value: string }[];
}> {
  const db = connectionMongo.connection.db;
  if (!db)
    return { appsChecked: 0, appsMigrated: 0, versionsMigrated: 0, conflicts: 0, unresolved: [] };

  let appsChecked = 0;
  let appsMigrated = 0;
  let conflicts = 0;
  const unresolved: { appId: string; key: string; value: string }[] = [];

  // ── apps collection ──
  {
    const cursor = db
      .collection('apps')
      .find({
        $or: [{ modules: { $exists: true, $not: { $size: 0 } } }, { chatConfig: { $exists: true } }]
      })
      .project({ modules: 1, chatConfig: 1, updateTime: 1 })
      .batchSize(BATCH_SIZE);

    while (await cursor.hasNext()) {
      const bulkOps: any[] = [];
      for (let i = 0; i < BATCH_SIZE && (await cursor.hasNext()); i++) {
        const app = await cursor.next();
        if (!app) continue;
        appsChecked++;
        let changed = false;

        // 迁移 modules（保留 legacy input，在 inputs 数组补 canonical input）
        if (Array.isArray(app.modules)) {
          for (const mod of app.modules as any[]) {
            if (Array.isArray(mod.inputs)) {
              for (const input of mod.inputs as Record<string, any>[]) {
                if (
                  migrateInput(
                    mod.inputs as Record<string, any>[],
                    input,
                    String(app._id),
                    modelMap,
                    unresolved
                  )
                )
                  changed = true;
              }
            }
          }
        }

        // 迁移 chatConfig（保留 model 并补 modelId）
        if (app.chatConfig) {
          for (const [configKey, modelKey] of [
            ['questionGuide', 'model'],
            ['ttsConfig', 'model']
          ] as const) {
            const cfg = app.chatConfig[configKey];
            if (cfg?.[modelKey] !== undefined && cfg.modelId === undefined) {
              const { value, resolved } = convertModelValue(cfg[modelKey], modelMap);
              if (resolved) {
                cfg.modelId = value;
                changed = true;
              } else {
                unresolved.push({
                  appId: String(app._id),
                  key: `chatConfig.${configKey}.${modelKey}`,
                  value: cfg[modelKey] as string
                });
              }
            }
          }
        }

        if (changed) {
          // CAS protects in-flight writes; failed updates are counted as conflicts.
          const filter: Record<string, unknown> = { _id: app._id };
          if (app.updateTime !== undefined) filter.updateTime = app.updateTime;
          bulkOps.push({
            updateOne: {
              filter,
              update: { $set: { modules: app.modules, chatConfig: app.chatConfig } }
            }
          });
        }
      }

      if (bulkOps.length > 0) {
        const result = await db.collection('apps').bulkWrite(bulkOps, { ordered: false });
        appsMigrated += result.modifiedCount;
        conflicts += bulkOps.length - result.modifiedCount;
      }
    }
  }

  // ── app_versions collection ──
  let versionsMigrated = 0;
  {
    const cursor = db
      .collection('app_versions')
      .find({
        $or: [{ nodes: { $exists: true, $not: { $size: 0 } } }, { chatConfig: { $exists: true } }]
      })
      .project({ nodes: 1, chatConfig: 1, time: 1 })
      .batchSize(BATCH_SIZE);

    while (await cursor.hasNext()) {
      const bulkOps: any[] = [];
      for (let i = 0; i < BATCH_SIZE && (await cursor.hasNext()); i++) {
        const version = await cursor.next();
        if (!version) continue;
        let changed = false;

        if (Array.isArray(version.nodes)) {
          for (const node of version.nodes as any[]) {
            if (Array.isArray(node.inputs)) {
              for (const input of node.inputs as Record<string, any>[]) {
                if (
                  migrateInput(
                    node.inputs as Record<string, any>[],
                    input,
                    String(version._id),
                    modelMap,
                    unresolved
                  )
                )
                  changed = true;
              }
            }
          }
        }

        // chatConfig（同 apps，保留 model 并补 modelId）
        if (version.chatConfig) {
          for (const [configKey, modelKey] of [
            ['questionGuide', 'model'],
            ['ttsConfig', 'model']
          ] as const) {
            const cfg = version.chatConfig[configKey];
            if (cfg?.[modelKey] !== undefined && cfg.modelId === undefined) {
              const { value, resolved } = convertModelValue(cfg[modelKey], modelMap);
              if (resolved) {
                cfg.modelId = value;
                changed = true;
              } else {
                unresolved.push({
                  appId: String(version._id),
                  key: `chatConfig.${configKey}.${modelKey}`,
                  value: cfg[modelKey] as string
                });
              }
            }
          }
        }

        if (changed) {
          // CAS：autosave version 带 time 条件
          const filter: Record<string, unknown> = { _id: version._id };
          if (version.time !== undefined) filter.time = version.time;
          bulkOps.push({
            updateOne: {
              filter,
              update: { $set: { nodes: version.nodes, chatConfig: version.chatConfig } }
            }
          });
        }
      }

      if (bulkOps.length > 0) {
        const result = await db.collection('app_versions').bulkWrite(bulkOps, { ordered: false });
        versionsMigrated += result.modifiedCount;
        conflicts += bulkOps.length - result.modifiedCount;
      }
    }
  }

  logger.info(
    `App workflow (additive): ${appsMigrated}/${appsChecked} apps, ${versionsMigrated} versions, ${conflicts} conflicts, ${unresolved.length} unresolved`
  );
  return { appsChecked, appsMigrated, versionsMigrated, conflicts, unresolved };
}

/* ═══ Step 6: eval migration (additive) ═══ */

/** Migrate eval collection: only add evalModelId, keep legacy evalModel. */
export async function migrateEvaluationData(modelMap: Map<string, string>): Promise<{
  evalChecked: number;
  evalMigrated: number;
  conflicts: number;
  unresolved: { evalId: string; value: string }[];
}> {
  const db = connectionMongo.connection.db;
  if (!db) return { evalChecked: 0, evalMigrated: 0, conflicts: 0, unresolved: [] };

  const cursor = db
    .collection('eval')
    .find({
      evalModel: { $exists: true },
      $or: [{ evalModelId: { $exists: false } }, { evalModelId: null }, { evalModelId: '' }]
    })
    .project({ evalModel: 1, evalModelId: 1 })
    .batchSize(BATCH_SIZE);

  let checked = 0;
  let migrated = 0;
  let conflicts = 0;
  const unresolved: { evalId: string; value: string }[] = [];
  while (await cursor.hasNext()) {
    const bulkOps: any[] = [];
    for (let i = 0; i < BATCH_SIZE && (await cursor.hasNext()); i++) {
      const doc = await cursor.next();
      if (!doc) continue;
      checked++;
      if (!doc.evalModel || doc.evalModelId) continue;
      const { value, resolved } = convertModelValue(doc.evalModel, modelMap);
      if (!resolved) {
        unresolved.push({ evalId: String(doc._id), value: doc.evalModel as string });
        continue;
      }
      bulkOps.push({
        updateOne: {
          filter: { _id: doc._id, ...snapshotFieldFilter('evalModelId', doc.evalModelId) },
          update: { $set: { evalModelId: value } }
        }
      });
    }
    if (bulkOps.length) {
      const result = await db.collection('eval').bulkWrite(bulkOps, { ordered: false });
      migrated += result.modifiedCount;
      conflicts += bulkOps.length - result.modifiedCount;
    }
  }

  logger.info(
    `Evaluation migration (additive): ${migrated}/${checked}, ${conflicts} conflicts, ${unresolved.length} unresolved`
  );
  return { evalChecked: checked, evalMigrated: migrated, conflicts, unresolved };
}

/* ═══ Step 7: usage_items migration (additive) ═══ */

/**
 * Migrate usage_items: add modelId, keep the legacy model field for display.
 * Uses modelMap + nameMap dual fallback (historical records may store the
 * alias instead of the provider name). Unresolved values are NOT written to
 * modelId (a name must never pollute the id field) and are counted.
 */
export async function migrateUsageRecords(
  modelMap: Map<string, string>,
  nameMap: Map<string, string>
): Promise<{
  itemsChecked: number;
  itemsMigrated: number;
  conflicts: number;
  unresolved: number;
}> {
  const db = connectionMongo.connection.db;
  if (!db) return { itemsChecked: 0, itemsMigrated: 0, conflicts: 0, unresolved: 0 };

  const cursor = db
    .collection('usage_items')
    .find({
      model: { $exists: true },
      $or: [{ modelId: { $exists: false } }, { modelId: null }, { modelId: '' }]
    })
    .project({ model: 1, modelId: 1 })
    .batchSize(BATCH_SIZE);

  let checked = 0;
  let migrated = 0;
  let conflicts = 0;
  let unresolved = 0;
  while (await cursor.hasNext()) {
    const bulkOps: any[] = [];
    for (let i = 0; i < BATCH_SIZE && (await cursor.hasNext()); i++) {
      const doc = await cursor.next();
      if (!doc) continue;
      checked++;
      if (doc.model === undefined || doc.modelId !== undefined) continue;
      const { value, resolved } = convertModelValue(doc.model, modelMap, nameMap);
      if (resolved) {
        bulkOps.push({
          updateOne: {
            filter: { _id: doc._id, ...snapshotFieldFilter('modelId', doc.modelId) },
            update: { $set: { modelId: value } }
          }
        });
      } else {
        unresolved++;
      }
    }
    if (bulkOps.length) {
      const result = await db.collection('usage_items').bulkWrite(bulkOps, { ordered: false });
      migrated += result.modifiedCount;
      conflicts += bulkOps.length - result.modifiedCount;
    }
  }

  logger.info(
    `Usage migration (additive): ${migrated}/${checked}, ${conflicts} conflicts, ${unresolved} unresolved`
  );
  return { itemsChecked: checked, itemsMigrated: migrated, conflicts, unresolved };
}

/* ═══ Step 8: default_models init ═══ */

/**
 * Create the system default model document from legacy isDefault* flags.
 * The old isDefault was a system-level (root-configured) concept; after
 * migration it becomes the single document in default_models.
 * `$setOnInsert` guarantees an existing system default document (e.g. manually
 * configured by root before the upgrade) is never overwritten. Legacy
 * isDefault* flags on system_models are preserved.
 */
export async function initSystemDefaultModels(
  systemDefaults: Record<string, string>,
  modelMap: Map<string, string>
): Promise<{ configured: boolean }> {
  const db = connectionMongo.connection.db;
  if (!db) return { configured: false };

  // Backfill HELPER_BOT_MODEL env var (model name → modelId) if not collected
  if (!systemDefaults.helperBotLLMId && process.env.HELPER_BOT_MODEL) {
    const modelId = modelMap.get(process.env.HELPER_BOT_MODEL);
    if (modelId) {
      systemDefaults.helperBotLLMId = modelId;
    }
  }

  if (Object.keys(systemDefaults).length === 0) {
    logger.info('default_models init: no defaults collected, skipping');
    return { configured: false };
  }

  await db
    .collection('default_models')
    .updateOne({ teamId: { $exists: false } }, { $setOnInsert: systemDefaults }, { upsert: true });

  logger.info(
    `default_models init: system defaults created with ${Object.keys(systemDefaults).length} fields`
  );
  return { configured: true };
}

/* ═══ Step 9: permission migration (additive) ═══ */

/**
 * Migrate MongoResourcePermission: only add resourceId (resolved modelId),
 * keep the legacy resourceName. Unresolved names are not written and counted.
 */
export async function migrateModelPermissions(modelMap: Map<string, string>): Promise<{
  total: number;
  migrated: number;
  conflicts: number;
  unresolved: number;
}> {
  const db = connectionMongo.connection.db;
  if (!db) return { total: 0, migrated: 0, conflicts: 0, unresolved: 0 };

  const cursor = db
    .collection('resource_permissions')
    .find({
      resourceType: PerResourceTypeEnum.model,
      $or: [{ resourceId: { $exists: false } }, { resourceId: null }]
    })
    .project({ resourceName: 1, resourceId: 1 })
    .batchSize(BATCH_SIZE);

  let total = 0;
  let migrated = 0;
  let conflicts = 0;
  let unresolved = 0;
  while (await cursor.hasNext()) {
    const bulkOps: any[] = [];
    for (let i = 0; i < BATCH_SIZE && (await cursor.hasNext()); i++) {
      const perm = await cursor.next();
      if (!perm) continue;
      total++;
      if (perm.resourceId) continue;
      const modelId = perm.resourceName ? modelMap.get(perm.resourceName) : undefined;
      if (!modelId) {
        unresolved++;
        continue;
      }
      bulkOps.push({
        updateOne: {
          filter: { _id: perm._id, ...snapshotFieldFilter('resourceId', perm.resourceId) },
          update: { $set: { resourceId: modelId } }
        }
      });
    }
    if (bulkOps.length) {
      const result = await db
        .collection('resource_permissions')
        .bulkWrite(bulkOps, { ordered: false });
      migrated += result.modifiedCount;
      conflicts += bulkOps.length - result.modifiedCount;
    }
  }

  logger.info(
    `Permission migration (additive): ${migrated}/${total}, ${conflicts} conflicts, ${unresolved} unresolved`
  );
  return { total, migrated, conflicts, unresolved };
}

/* ═══ Step 10: requestUrl/requestAuth → Channel migration ═══ */

/**
 * Migrate legacy per-model requestUrl/requestAuth into aiproxy Channels.
 * Deduplicated by (model, requestUrl, requestAuth) within a run; channels
 * named "Migrated: <model>" created by a previous run are skipped so the step
 * stays idempotent across initv4170 re-runs. If aiproxy is not configured the
 * migration is skipped and configs are logged for manual setup. Legacy
 * requestUrl/requestAuth fields are NOT deleted from system_models.
 */
export async function migrateChannelsFromLegacyConfigs(
  channelConfigs: { model: string; requestUrl: string; requestAuth: string }[]
): Promise<{ created: number; skipped: number; failed: number }> {
  if (!channelConfigs || channelConfigs.length === 0) {
    logger.info('Channel migration: no legacy channel configs to migrate');
    return { created: 0, skipped: 0, failed: 0 };
  }

  // Deduplicate by (model, requestUrl, requestAuth)
  const uniqueMap = new Map<string, { model: string; requestUrl: string; requestAuth: string }>();
  for (const cfg of channelConfigs) {
    const key = `${cfg.model}::${cfg.requestUrl}::${cfg.requestAuth}`;
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, cfg);
    }
  }

  // Check aiproxy API config
  let baseUrl: string;
  let token: string;
  try {
    const adminConfig = getAIProxyAdminConfig();
    baseUrl = adminConfig.baseUrl;
    token = adminConfig.token;
  } catch {
    logger.warn(
      `Channel migration: aiproxy API not configured, skipping ${uniqueMap.size} channel(s). ` +
        `Manual channel details will be logged without authentication credentials.`
    );
    for (const [, cfg] of uniqueMap) {
      logger.info(`  Manual channel needed: model=${cfg.model}, url=${cfg.requestUrl}`);
    }
    return { created: 0, skipped: uniqueMap.size, failed: 0 };
  }

  let created = 0;
  let skipped = 0;
  let failed = 0;

  // Skip channels a previous run already created ("Migrated: <model>"), so the
  // step stays idempotent across initv4170 re-runs (design §14).
  let existingNames: Set<string>;
  try {
    existingNames = new Set((await getRealtimeSystemChannels()).map((c) => c.name));
  } catch (error) {
    logger.warn(`Channel migration: failed to list existing channels: ${getErrText(error)}`);
    return { created: 0, skipped: 0, failed: uniqueMap.size };
  }

  for (const [, cfg] of uniqueMap) {
    const channelName = `Migrated: ${cfg.model}`;
    if (existingNames.has(channelName)) {
      skipped++;
      logger.info(`Channel skipped (already exists): ${channelName}`);
      continue;
    }
    try {
      // Create Channel via aiproxy API (same behavior as createChannel.ts handler)
      await axiosWithoutSSRF.post(
        `${baseUrl}/api/channel/`,
        {
          type: 1,
          model_mapping: {},
          key: cfg.requestAuth,
          name: channelName,
          base_url: cfg.requestUrl,
          models: [cfg.model] // upstream provider model name
        },
        {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 10000
        }
      );
      created++;
      existingNames.add(channelName);
      logger.info(`Channel created: model=${cfg.model}, url=${cfg.requestUrl}`);
    } catch (error) {
      failed++;
      logger.error(`Channel creation failed for model=${cfg.model}: ${getErrText(error)}`);
    }
  }

  logger.info(`Channel migration: ${created} created, ${skipped} skipped, ${failed} failed`);
  return { created, skipped, failed };
}
