import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { connectionMongo, Types } from '@fastgpt/service/common/mongo';
import { getLogger } from '@fastgpt/service/common/logger';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { OwnerRoleVal, PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { MongoEmbeddingTrainTask } from '@fastgpt/service/core/train/embedding/task/schema';
import { MongoRerankTrainTask } from '@fastgpt/service/core/train/rerank/task/schema';

const logger = getLogger(['initv4150']);

export type Initv4150Response = {
  message: string;
  indexMigration: {
    modelUniqueIndexDropped: boolean;
    newIndexesCreated: string[];
  };
  modelMigration: {
    total: number;
    flattened: number;
    isSharedSet: number;
    defaultsSet: number;
    orphanAssigned: number;
  };
  datasetMigration: {
    total: number;
    migrated: number;
    datasetTrainingsCleaned: number;
  };
  appWorkflowMigration: {
    appsChecked: number;
    appsMigrated: number;
    versionsMigrated: number;
  };
  evaluationMigration: {
    evaluationDataset: {
      collectionsMigrated: number;
      dataChecked: number;
      dataMigrated: number;
    };
    evaluationTask: {
      tasksChecked: number;
      tasksMigrated: number;
    };
  };
  trainingMigration: {
    embeddingTasksChecked: number;
    embeddingTasksMigrated: number;
    rerankTasksChecked: number;
    rerankTasksMigrated: number;
  };
  usageMigration: {
    itemsChecked: number;
    itemsMigrated: number;
  };
};

/**
 * Drop the unique index on `model` field (from old schema),
 * so multiple custom models can share the same OpenAI model name.
 */
export async function dropModelUniqueIndex(): Promise<boolean> {
  const db = connectionMongo.connection.db;
  if (!db) {
    logger.warn('MongoDB connection not available, skipping index drop');
    return false;
  }

  try {
    const indexes = await db.collection('system_models').listIndexes().toArray();
    const uniqueModelIndex = indexes.find(
      (idx: { key?: Record<string, unknown>; unique?: boolean; name?: string }) =>
        idx.key?.model === 1 && idx.unique === true
    );

    if (!uniqueModelIndex?.name) {
      logger.info('No unique index on model field found, skipping');
      return false;
    }

    await db.collection('system_models').dropIndex(uniqueModelIndex.name);
    logger.info(`Dropped unique index: ${uniqueModelIndex.name}`);
    return true;
  } catch (error) {
    logger.error('Failed to drop model unique index', { error });
    return false;
  }
}

/**
 * Create new indexes defined in the updated schema:
 * - teamId: for querying models by team
 * - tmbId: for querying models by owner
 * - isShared: for filtering shared models
 */
export async function createNewIndexes(): Promise<string[]> {
  const db = connectionMongo.connection.db;
  if (!db) {
    logger.warn('MongoDB connection not available, skipping index creation');
    return [];
  }

  const created: string[] = [];
  const newIndexes: { key: Record<string, number>; name: string }[] = [
    { key: { teamId: 1 }, name: 'teamId_1' },
    { key: { tmbId: 1 }, name: 'tmbId_1' },
    { key: { isShared: 1 }, name: 'isShared_1' }
  ];

  for (const { key, name } of newIndexes) {
    try {
      const existingIndexes = await db.collection('system_models').listIndexes().toArray();
      const exists = existingIndexes.some((idx: { name?: string }) => idx.name === name);

      if (exists) {
        logger.info(`Index ${name} already exists, skipping`);
        continue;
      }

      await db.collection('system_models').createIndex(key, { name, background: true });
      created.push(name);
      logger.info(`Created index: ${name}`);
    } catch (error) {
      logger.error(`Failed to create index ${name}`, { error });
    }
  }

  return created;
}

/**
 * Flatten old documents: move `metadata` fields to document top level,
 * set isShared on models that don't have it, and set defaults for
 * required fields that may be missing from old data.
 */
export async function migrateModelData(options?: {
  rootTmbId?: string;
  rootTeamId?: string;
}): Promise<{
  total: number;
  flattened: number;
  isSharedSet: number;
  defaultsSet: number;
  orphanAssigned: number;
}> {
  const { rootTmbId, rootTeamId } = options || {};
  const db = connectionMongo.connection.db;
  if (!db) {
    logger.warn('MongoDB connection not available, skipping data migration');
    return { total: 0, flattened: 0, isSharedSet: 0, defaultsSet: 0, orphanAssigned: 0 };
  }
  const models = (await db.collection('system_models').find({}).toArray()) as any[];
  logger.info(`Found ${models.length} models`);

  let flattened = 0;
  let isSharedSet = 0;
  let defaultsSet = 0;
  let orphanAssigned = 0;

  for (const model of models) {
    const $set: Record<string, any> = {};
    const $unset: Record<string, 1> = {};

    // Flatten: move metadata fields to top level, skip null/undefined/empty values
    if (model.metadata && typeof model.metadata === 'object') {
      for (const [key, value] of Object.entries(model.metadata)) {
        if (value === null || value === undefined || value === '') continue;
        $set[key] = value;
      }
      $unset.metadata = 1;
      flattened++;
    }

    if (model.isShared === undefined) {
      $set.isShared = false;
      isSharedSet++;
    }

    // Before v4.15.0, only user-created custom models were persisted to DB.
    // System models were loaded from plugins at runtime.  However, if an admin
    // edited a plugin model's config, that edit was also saved to DB — with the
    // same model name as the plugin model.  We must distinguish these two cases:
    //
    //   - model name matches a loaded plugin system model → edited system model
    //   - model name has no plugin match → user-created custom model
    if (model.isCustom === undefined) {
      const pluginModelNames = new Set(
        (global.systemModelList || [])
          .filter((m: any) => m.isCustom !== true)
          .map((m: any) => m.model)
      );
      $set.isCustom = pluginModelNames.has($set.model ?? model.model) ? false : true;
    }

    // Assign orphan custom models to root user when tmbId/teamId are missing
    const effectiveIsCustom = $set.isCustom ?? model.isCustom;
    if (effectiveIsCustom === true) {
      const needsTmbId = rootTmbId && ($set.tmbId ?? model.tmbId) === undefined;
      const needsTeamId = rootTeamId && ($set.teamId ?? model.teamId) === undefined;

      if (needsTmbId) {
        $set.tmbId = new Types.ObjectId(rootTmbId);
        orphanAssigned++;
      }
      if (needsTeamId) {
        $set.teamId = new Types.ObjectId(rootTeamId);
        orphanAssigned++;
      }

      // Create corresponding resource permission for the root owner
      if (needsTmbId || needsTeamId) {
        await MongoResourcePermission.create({
          teamId: $set.teamId ?? model.teamId,
          tmbId: $set.tmbId ?? model.tmbId,
          resourceType: PerResourceTypeEnum.model,
          resourceId: model._id,
          permission: OwnerRoleVal
        });
      }
    }

    // Cleanup: set defaults for required fields that are missing after flattening.
    // After flatten, a field is missing if it is not in $set and not already on the
    // top-level document.  All config fields were in metadata previously so checking
    // model[field] + $set[field] covers both old-top-level and freshly-flattened.
    const modelType = $set.type || model.type;
    const effective = (field: string) => $set[field] ?? model[field];

    if (modelType === 'llm') {
      if (typeof effective('maxContext') !== 'number') {
        $set.maxContext = 16000;
        defaultsSet++;
      }
      if (typeof effective('maxResponse') !== 'number') {
        $set.maxResponse = 8000;
        defaultsSet++;
      }
      if (typeof effective('quoteMaxToken') !== 'number') {
        $set.quoteMaxToken = 8000;
        defaultsSet++;
      }
      if (typeof effective('functionCall') !== 'boolean') {
        $set.functionCall = true;
        defaultsSet++;
      }
      if (typeof effective('toolChoice') !== 'boolean') {
        $set.toolChoice = true;
        defaultsSet++;
      }
    } else if (modelType === 'embedding') {
      if (typeof effective('defaultToken') !== 'number') {
        $set.defaultToken = 512;
        defaultsSet++;
      }
      if (typeof effective('maxToken') !== 'number') {
        $set.maxToken = 512;
        defaultsSet++;
      }
      if (typeof effective('weight') !== 'number') {
        $set.weight = 0;
        defaultsSet++;
      }
    } else if (modelType === 'tts') {
      if (!Array.isArray(effective('voices'))) {
        $set.voices = [];
        defaultsSet++;
      }
    }
    // STT and rerank have no additional required fields beyond base schema

    // $unset optional fields whose values have wrong types (legacy garbage data)
    const optionalArrays = ['priceTiers', 'responseFormatList', 'trainTaskList', 'voices'] as const;
    for (const field of optionalArrays) {
      const v = effective(field);
      if (v !== undefined && !Array.isArray(v)) {
        if (field in $set) delete $set[field];
        else $unset[field] = 1;
      }
    }

    // Clean up optional non-array fields with wrong types (e.g. maxTemperature: null, maxTemperature: "high")
    const optionalNumbers = [
      'maxTemperature',
      'charsPointsPrice',
      'inputPrice',
      'outputPrice',
      'dimensions',
      'batchSize'
    ] as const;
    for (const field of optionalNumbers) {
      const v = effective(field);
      if (v !== undefined && typeof v !== 'number') {
        if (field in $set) delete $set[field];
        else $unset[field] = 1;
      }
    }

    const optionalBooleans = [
      'vision',
      'reasoning',
      'censor',
      'showTopP',
      'showStopSign',
      'hidden',
      'normalization',
      'supportTrain',
      'testMode',
      'isActive',
      'isTuned',
      'isDefault',
      'isDefaultDatasetTextModel',
      'isDefaultDatasetImageModel',
      'isDefaultEvaluationModel',
      'isDefaultHelperBotModel',
      'datasetProcess',
      'usedInClassify',
      'usedInExtractFields',
      'usedInToolCall',
      'useInEvaluation'
    ] as const;
    for (const field of optionalBooleans) {
      const v = effective(field);
      if (v !== undefined && typeof v !== 'boolean') {
        if (field in $set) delete $set[field];
        else $unset[field] = 1;
      }
    }

    const updateOp: Record<string, any> = {};
    if (Object.keys($set).length > 0) updateOp.$set = $set;
    if (Object.keys($unset).length > 0) updateOp.$unset = $unset;

    if (Object.keys(updateOp).length > 0) {
      // Use native driver to bypass Mongoose schema filtering on $unset
      await db.collection('system_models').updateOne({ _id: model._id }, updateOp);
    }
  }

  logger.info(
    `Data migration complete: flattened ${flattened}, isShared set on ${isSharedSet}, defaults set on ${defaultsSet}, orphans assigned ${orphanAssigned}`
  );
  return { total: models.length, flattened, isSharedSet, defaultsSet, orphanAssigned };
}

/**
 * Build a modelName → modelId mapping from system_models.
 * When multiple models share the same name, prefer active models.
 */
export async function buildModelNameToIdMap(): Promise<Map<string, string>> {
  const db = connectionMongo.connection.db;
  const map = new Map<string, string>();
  if (!db) return map;

  const models = (await db
    .collection('system_models')
    .find({})
    .project({ model: 1, isActive: 1 })
    .toArray()) as any[];

  for (const m of models) {
    const name = m.model as string | undefined;
    if (!name) continue;

    if (!map.has(name) || m.isActive === true) {
      map.set(name, String(m._id));
    }
  }

  return map;
}

export const WORKFLOW_MODEL_KEY_MAP: Record<string, string> = {
  model: 'modelId',
  embeddingModel: 'embeddingModelId',
  rerankModel: 'rerankModelId',
  datasetSearchExtensionModel: 'datasetSearchExtensionModelId',
  generateSqlModel: 'generateSqlModelId',
  datasetDeepSearchModel: 'datasetDeepSearchModelId',
  agenticSearchLLMModel: 'agenticSearchLLMModelId',
  agenticSearchRerankModel: 'agenticSearchRerankModelId'
};

export const DATASET_PARAMS_MODEL_FIELDS = [
  'embeddingModel',
  'rerankModel',
  'datasetSearchExtensionModel',
  'generateSqlModel',
  'datasetDeepSearchModel',
  'agenticSearchLLMModel',
  'agenticSearchRerankModel'
];

export const convertModelValue = (value: unknown, nameToId: Map<string, string>): unknown => {
  if (typeof value !== 'string' || !value) return value;
  return nameToId.get(value) || value;
};

const setConvertedField = ({
  source,
  oldKey,
  newKey,
  target,
  unset,
  nameToId
}: {
  source: Record<string, any>;
  oldKey: string;
  newKey: string;
  target: Record<string, any>;
  unset: Record<string, 1>;
  nameToId: Map<string, string>;
}) => {
  if (source[oldKey] === undefined) return false;

  const existingValue = source[newKey];
  if (existingValue === undefined) {
    target[newKey] = convertModelValue(source[oldKey], nameToId);
  }
  unset[oldKey] = 1;
  return true;
};

/**
 * Step 4: Migrate datasets — rename vectorModel/agentModel/vlmModel → XxxModelId,
 * converting model names to model _id values.
 */
export async function migrateDatasets(nameToId: Map<string, string>): Promise<{
  total: number;
  migrated: number;
  datasetTrainingsCleaned: number;
}> {
  const db = connectionMongo.connection.db;
  if (!db) {
    logger.warn('MongoDB connection not available, skipping dataset migration');
    return { total: 0, migrated: 0, datasetTrainingsCleaned: 0 };
  }

  const cursor = db.collection('datasets').find({
    $or: [
      { vectorModel: { $exists: true } },
      { agentModel: { $exists: true } },
      { vlmModel: { $exists: true } }
    ]
  });
  const docs = await cursor.toArray();
  let migrated = 0;

  for (const doc of docs as any[]) {
    const $set: Record<string, any> = {};
    const $unset: Record<string, 1> = {};

    for (const [oldField, newField] of [
      ['vectorModel', 'vectorModelId'],
      ['agentModel', 'agentModelId'],
      ['vlmModel', 'vlmModelId']
    ] as const) {
      const val = doc[oldField];
      if (val === undefined || val === null) continue;
      $unset[oldField] = 1;
      // Only set new field if it doesn't already exist (don't overwrite)
      if (doc[newField] === undefined) {
        $set[newField] = convertModelValue(val, nameToId);
      }
    }

    if (Object.keys($set).length > 0 || Object.keys($unset).length > 0) {
      const updateOp: Record<string, any> = {};
      if (Object.keys($set).length > 0) updateOp.$set = $set;
      if (Object.keys($unset).length > 0) updateOp.$unset = $unset;
      await db.collection('datasets').updateOne({ _id: doc._id }, updateOp);
      migrated++;
    }
  }

  const datasetTrainingsCleanup = await db
    .collection('dataset_trainings')
    .updateMany({ model: { $exists: true } }, { $unset: { model: 1 } });

  logger.info(
    `Dataset migration: ${migrated}/${docs.length} datasets updated, dataset_trainings cleaned ${datasetTrainingsCleanup.modifiedCount}`
  );
  return {
    total: docs.length,
    migrated,
    datasetTrainingsCleaned: datasetTrainingsCleanup.modifiedCount
  };
}

/** Mutate a single input object in place. */
export const migrateInput = (
  input: Record<string, any>,
  nameToId: Map<string, string>
): boolean => {
  let changed = false;

  // Direct model key migration
  if (input.key && WORKFLOW_MODEL_KEY_MAP[input.key]) {
    input.key = WORKFLOW_MODEL_KEY_MAP[input.key];
    // Only convert if it's a plain string value (not a reference)
    if (input.selectedTypeIndex === undefined || input.selectedTypeIndex === 0) {
      input.value = convertModelValue(input.value, nameToId);
    }
    changed = true;
  }

  // datasetParams composite object migration
  if (input.key === 'datasetParams' && input.value && typeof input.value === 'object') {
    const val = input.value as Record<string, unknown>;
    for (const field of DATASET_PARAMS_MODEL_FIELDS) {
      if (field in val) {
        const newKey = WORKFLOW_MODEL_KEY_MAP[field];
        val[newKey] = convertModelValue(val[field], nameToId);
        delete val[field];
        changed = true;
      }
    }
  }

  return changed;
};

/**
 * Step 5: Migrate App workflow modules (apps + app_versions) and chatConfig.
 * Converts old NodeInputKeyEnum values and model-name values to model IDs.
 */
export async function migrateAppWorkflows(nameToId: Map<string, string>): Promise<{
  appsChecked: number;
  appsMigrated: number;
  versionsMigrated: number;
}> {
  const db = connectionMongo.connection.db;
  if (!db) {
    logger.warn('MongoDB connection not available, skipping app workflow migration');
    return { appsChecked: 0, appsMigrated: 0, versionsMigrated: 0 };
  }

  let appsChecked = 0;
  let appsMigrated = 0;

  // ── apps collection ──
  {
    const cursor = db.collection('apps').find({
      $or: [{ modules: { $exists: true, $not: { $size: 0 } } }, { chatConfig: { $exists: true } }]
    });
    const docs = (await cursor.toArray()) as any[];
    appsChecked = docs.length;

    for (const app of docs) {
      let changed = false;

      // Migrate modules
      if (Array.isArray(app.modules)) {
        for (const mod of app.modules as any[]) {
          if (Array.isArray(mod.inputs)) {
            for (const input of mod.inputs as Record<string, any>[]) {
              if (migrateInput(input, nameToId)) changed = true;
            }
          }
        }
      }

      // Migrate chatConfig
      const chatConfig = app.chatConfig;
      if (chatConfig) {
        for (const [configKey, modelKey] of [
          ['questionGuide', 'model'],
          ['ttsConfig', 'model']
        ] as const) {
          const cfg = chatConfig[configKey];
          if (cfg?.[modelKey] !== undefined) {
            cfg.modelId = convertModelValue(cfg[modelKey], nameToId);
            delete cfg[modelKey];
            changed = true;
          }
        }
      }

      if (changed) {
        const updateOp: Record<string, any> = {};
        updateOp.$set = { modules: app.modules, chatConfig: app.chatConfig };
        await db.collection('apps').updateOne({ _id: app._id }, updateOp);
        appsMigrated++;
      }
    }
  }

  // ── app_versions collection ──
  let versionsMigrated = 0;
  {
    const cursor = db.collection('app_versions').find({
      $or: [{ nodes: { $exists: true, $not: { $size: 0 } } }, { chatConfig: { $exists: true } }]
    });
    const docs = (await cursor.toArray()) as any[];

    for (const version of docs) {
      let changed = false;

      if (Array.isArray(version.nodes)) {
        for (const node of version.nodes as any[]) {
          if (Array.isArray(node.inputs)) {
            for (const input of node.inputs as Record<string, any>[]) {
              if (migrateInput(input, nameToId)) changed = true;
            }
          }
        }
      }

      const chatConfig = version.chatConfig;
      if (chatConfig) {
        for (const [configKey, modelKey] of [
          ['questionGuide', 'model'],
          ['ttsConfig', 'model']
        ] as const) {
          const cfg = chatConfig[configKey];
          if (cfg?.[modelKey] !== undefined) {
            cfg.modelId = convertModelValue(cfg[modelKey], nameToId);
            delete cfg[modelKey];
            changed = true;
          }
        }
      }

      if (changed) {
        const updateOp: Record<string, any> = {};
        updateOp.$set = { nodes: version.nodes, chatConfig: version.chatConfig };
        await db.collection('app_versions').updateOne({ _id: version._id }, updateOp);
        versionsMigrated++;
      }
    }
  }

  logger.info(
    `App workflow migration: ${appsMigrated}/${appsChecked} apps updated, ${versionsMigrated} versions updated`
  );
  return { appsChecked, appsMigrated, versionsMigrated };
}

/**
 * Step 6: Migrate evaluation data — rename model → modelId in eval_dataset_collections
 * and eval_dataset_datas.
 */
export async function migrateEvaluationData(nameToId: Map<string, string>): Promise<{
  collectionsMigrated: number;
  dataChecked: number;
  dataMigrated: number;
}> {
  const db = connectionMongo.connection.db;
  if (!db) {
    logger.warn('MongoDB connection not available, skipping evaluation migration');
    return { collectionsMigrated: 0, dataChecked: 0, dataMigrated: 0 };
  }

  // ── eval_dataset_collections: evaluationModel → evaluationModelId ──
  let collectionsMigrated = 0;
  {
    const cursor = db.collection('eval_dataset_collections').find({
      evaluationModel: { $exists: true }
    });
    const docs = (await cursor.toArray()) as any[];
    for (const doc of docs) {
      const $set: Record<string, any> = {};
      if (doc.evaluationModel && !doc.evaluationModelId) {
        $set.evaluationModelId = convertModelValue(doc.evaluationModel, nameToId);
      }
      const updateOp: Record<string, any> = {};
      if (Object.keys($set).length > 0) {
        updateOp.$set = $set;
        updateOp.$unset = { evaluationModel: 1 };
      }
      if (Object.keys(updateOp).length > 0) {
        await db.collection('eval_dataset_collections').updateOne({ _id: doc._id }, updateOp);
      }
      collectionsMigrated++;
    }
  }

  // ── eval_dataset_datas: qualityMetadata.model, synthesisMetadata.intelligentGenerationModel ──
  let dataChecked = 0;
  let dataMigrated = 0;
  {
    const cursor = db.collection('eval_dataset_datas').find({
      $or: [
        { 'qualityMetadata.model': { $exists: true } },
        { 'synthesisMetadata.intelligentGenerationModel': { $exists: true } }
      ]
    });
    const docs = (await cursor.toArray()) as any[];
    dataChecked = docs.length;

    for (const doc of docs as any[]) {
      const $set: Record<string, any> = {};
      const $unset: Record<string, 1> = {};

      if (doc.qualityMetadata?.model) {
        $set['qualityMetadata.modelId'] = convertModelValue(doc.qualityMetadata.model, nameToId);
        $unset['qualityMetadata.model'] = 1;
      }
      if (doc.synthesisMetadata?.intelligentGenerationModel) {
        $set['synthesisMetadata.intelligentGenerationModelId'] = convertModelValue(
          doc.synthesisMetadata.intelligentGenerationModel,
          nameToId
        );
        $unset['synthesisMetadata.intelligentGenerationModel'] = 1;
      }

      if (Object.keys($set).length > 0) {
        const updateOp: Record<string, any> = { $set };
        if (Object.keys($unset).length > 0) updateOp.$unset = $unset;
        await db.collection('eval_dataset_datas').updateOne({ _id: doc._id }, updateOp);
        dataMigrated++;
      }
    }
  }

  logger.info(
    `Evaluation migration: ${collectionsMigrated} collections, ${dataMigrated}/${dataChecked} datas updated`
  );
  return { collectionsMigrated, dataChecked, dataMigrated };
}

/**
 * Step 7: Migrate evaluation tasks runtimeConfig.llm/embedding → llmId/embeddingId.
 */
export async function migrateEvaluationTasks(nameToId: Map<string, string>): Promise<{
  tasksChecked: number;
  tasksMigrated: number;
}> {
  const db = connectionMongo.connection.db;
  if (!db) {
    logger.warn('MongoDB connection not available, skipping evaluation task migration');
    return { tasksChecked: 0, tasksMigrated: 0 };
  }

  const docs = (await db
    .collection('evals')
    .find({
      evaluators: {
        $elemMatch: {
          $or: [
            { 'runtimeConfig.llm': { $exists: true } },
            { 'runtimeConfig.embedding': { $exists: true } }
          ]
        }
      }
    })
    .toArray()) as any[];

  let tasksMigrated = 0;

  for (const doc of docs) {
    let changed = false;

    if (Array.isArray(doc.evaluators)) {
      for (const evaluator of doc.evaluators as any[]) {
        if (!evaluator?.runtimeConfig || typeof evaluator.runtimeConfig !== 'object') continue;

        const runtimeConfig = evaluator.runtimeConfig as Record<string, any>;
        if (runtimeConfig.llm !== undefined) {
          if (runtimeConfig.llmId === undefined) {
            runtimeConfig.llmId = convertModelValue(runtimeConfig.llm, nameToId);
          }
          delete runtimeConfig.llm;
          changed = true;
        }
        if (runtimeConfig.embedding !== undefined) {
          if (runtimeConfig.embeddingId === undefined) {
            runtimeConfig.embeddingId = convertModelValue(runtimeConfig.embedding, nameToId);
          }
          delete runtimeConfig.embedding;
          changed = true;
        }
      }
    }

    if (changed) {
      await db.collection('evals').updateOne(
        { _id: doc._id },
        {
          $set: {
            evaluators: doc.evaluators
          }
        }
      );
      tasksMigrated++;
    }
  }

  logger.info(`Evaluation task migration: ${tasksMigrated}/${docs.length} documents updated`);
  return { tasksChecked: docs.length, tasksMigrated };
}

/**
 * Step 8: Migrate training task model references.
 */
export async function migrateTrainingRecords(nameToId: Map<string, string>): Promise<{
  embeddingTasksChecked: number;
  embeddingTasksMigrated: number;
  rerankTasksChecked: number;
  rerankTasksMigrated: number;
}> {
  const db = connectionMongo.connection.db;
  if (!db) {
    logger.warn('MongoDB connection not available, skipping training migration');
    return {
      embeddingTasksChecked: 0,
      embeddingTasksMigrated: 0,
      rerankTasksChecked: 0,
      rerankTasksMigrated: 0
    };
  }

  const embedCollectionName = MongoEmbeddingTrainTask.collection.collectionName;
  const rerankCollectionName = MongoRerankTrainTask.collection.collectionName;

  const migrateTrainTaskCollection = async (collectionName: string) => {
    const docs = (await db
      .collection(collectionName)
      .find({
        $or: [
          { baseModelId: { $exists: true } },
          { 'checkpoint.data.registering.tunedModelId': { $exists: true } },
          { 'result.tunedModelId': { $exists: true } }
        ]
      })
      .toArray()) as any[];

    let migrated = 0;

    for (const doc of docs) {
      const $set: Record<string, any> = {};
      let changed = false;

      if (typeof doc.baseModelId === 'string' && doc.baseModelId) {
        const converted = convertModelValue(doc.baseModelId, nameToId);
        if (converted !== doc.baseModelId) {
          $set.baseModelId = converted;
          changed = true;
        }
      }

      const checkpointTunedModelId = doc.checkpoint?.data?.registering?.tunedModelId;
      if (typeof checkpointTunedModelId === 'string' && checkpointTunedModelId) {
        const converted = convertModelValue(checkpointTunedModelId, nameToId);
        if (converted !== checkpointTunedModelId) {
          $set['checkpoint.data.registering.tunedModelId'] = converted;
          changed = true;
        }
      }

      const resultTunedModelId = doc.result?.tunedModelId;
      if (typeof resultTunedModelId === 'string' && resultTunedModelId) {
        const converted = convertModelValue(resultTunedModelId, nameToId);
        if (converted !== resultTunedModelId) {
          $set['result.tunedModelId'] = converted;
          changed = true;
        }
      }

      if (changed) {
        await db.collection(collectionName).updateOne({ _id: doc._id }, { $set });
        migrated++;
      }
    }

    return { checked: docs.length, migrated };
  };

  const [embeddingTaskResult, rerankTaskResult] = await Promise.all([
    migrateTrainTaskCollection(embedCollectionName),
    migrateTrainTaskCollection(rerankCollectionName)
  ]);

  logger.info(
    `Training migration: embedding ${embeddingTaskResult.migrated}/${embeddingTaskResult.checked}, rerank ${rerankTaskResult.migrated}/${rerankTaskResult.checked}`
  );

  return {
    embeddingTasksChecked: embeddingTaskResult.checked,
    embeddingTasksMigrated: embeddingTaskResult.migrated,
    rerankTasksChecked: rerankTaskResult.checked,
    rerankTasksMigrated: rerankTaskResult.migrated
  };
}

/**
 * Step 9: Migrate usage_items.model → modelId.
 */
export async function migrateUsageRecords(nameToId: Map<string, string>): Promise<{
  itemsChecked: number;
  itemsMigrated: number;
}> {
  const db = connectionMongo.connection.db;
  if (!db) {
    logger.warn('MongoDB connection not available, skipping usage migration');
    return { itemsChecked: 0, itemsMigrated: 0 };
  }

  const docs = (await db
    .collection('usage_items')
    .find({
      model: { $exists: true }
    })
    .toArray()) as any[];

  let itemsMigrated = 0;

  for (const doc of docs) {
    const $set: Record<string, any> = {};
    const $unset: Record<string, 1> = {};

    const changed = setConvertedField({
      source: doc,
      oldKey: 'model',
      newKey: 'modelId',
      target: $set,
      unset: $unset,
      nameToId
    });

    if (changed) {
      const updateOp: Record<string, any> = {};
      if (Object.keys($set).length > 0) updateOp.$set = $set;
      if (Object.keys($unset).length > 0) updateOp.$unset = $unset;
      await db.collection('usage_items').updateOne({ _id: doc._id }, updateOp);
      itemsMigrated++;
    }
  }

  logger.info(`Usage migration: ${itemsMigrated}/${docs.length} documents updated`);
  return { itemsChecked: docs.length, itemsMigrated };
}

async function handler(
  req: ApiRequestProps,
  _res: ApiResponseType<Initv4150Response>
): Promise<Initv4150Response> {
  await authCert({ req, authRoot: true });

  // Look up root user's tmbId and teamId for orphan custom model assignment
  let rootTmbId: string | undefined;
  let rootTeamId: string | undefined;
  try {
    const rootUser = await MongoUser.findOne({ username: 'root' }).lean();
    if (rootUser) {
      const rootMember = await MongoTeamMember.findOne({ userId: rootUser._id }).lean();
      if (rootMember) {
        rootTmbId = String(rootMember._id);
        rootTeamId = String(rootMember.teamId);
        logger.info(`Root user found: tmbId=${rootTmbId}, teamId=${rootTeamId}`);
      } else {
        logger.warn('Root user found but no team member record exists');
      }
    } else {
      logger.warn('Root user not found in database');
    }
  } catch (error) {
    logger.warn('Failed to look up root user for orphan model assignment', { error });
  }

  logger.info('=== Starting v4.15.0 model management migration ===');

  // Step 1: Drop old unique index on model field
  const modelUniqueIndexDropped = await dropModelUniqueIndex();

  // Step 2: Create new indexes
  const newIndexesCreated = await createNewIndexes();

  // Step 3: Migrate model data (flatten + set isShared + cleanup defaults)
  let modelMigration = {
    total: 0,
    flattened: 0,
    isSharedSet: 0,
    defaultsSet: 0,
    orphanAssigned: 0
  };
  try {
    modelMigration = await migrateModelData({ rootTmbId, rootTeamId });
  } catch (error) {
    logger.error('Data migration failed', { error });
  }

  // Build name-to-id mapping for downstream migrations
  const nameToId = await buildModelNameToIdMap();
  logger.info(`Built model name→id map with ${nameToId.size} entries`);

  // Step 4: Migrate datasets
  let datasetMigration = { total: 0, migrated: 0, datasetTrainingsCleaned: 0 };
  try {
    datasetMigration = await migrateDatasets(nameToId);
  } catch (error) {
    logger.error('Dataset migration failed', { error });
  }

  // Step 5: Migrate app workflows and chatConfig
  let appWorkflowMigration = { appsChecked: 0, appsMigrated: 0, versionsMigrated: 0 };
  try {
    appWorkflowMigration = await migrateAppWorkflows(nameToId);
  } catch (error) {
    logger.error('App workflow migration failed', { error });
  }

  // Step 6: Migrate evaluation data
  let evaluationDatasetMigration = { collectionsMigrated: 0, dataChecked: 0, dataMigrated: 0 };
  try {
    evaluationDatasetMigration = await migrateEvaluationData(nameToId);
  } catch (error) {
    logger.error('Evaluation data migration failed', { error });
  }

  // Step 7: Migrate evaluation tasks
  let evaluationTaskMigration = { tasksChecked: 0, tasksMigrated: 0 };
  try {
    evaluationTaskMigration = await migrateEvaluationTasks(nameToId);
  } catch (error) {
    logger.error('Evaluation task migration failed', { error });
  }

  // Step 8: Migrate training records
  let trainingMigration = {
    embeddingTasksChecked: 0,
    embeddingTasksMigrated: 0,
    rerankTasksChecked: 0,
    rerankTasksMigrated: 0
  };
  try {
    trainingMigration = await migrateTrainingRecords(nameToId);
  } catch (error) {
    logger.error('Training migration failed', { error });
  }

  // Step 9: Migrate usage records
  let usageMigration = { itemsChecked: 0, itemsMigrated: 0 };
  try {
    usageMigration = await migrateUsageRecords(nameToId);
  } catch (error) {
    logger.error('Usage migration failed', { error });
  }

  logger.info('=== v4.15.0 migration complete ===');

  return {
    message: 'v4.15.0 model management migration completed',
    indexMigration: {
      modelUniqueIndexDropped,
      newIndexesCreated
    },
    modelMigration,
    datasetMigration,
    appWorkflowMigration,
    evaluationMigration: {
      evaluationDataset: evaluationDatasetMigration,
      evaluationTask: evaluationTaskMigration
    },
    trainingMigration,
    usageMigration
  };
}

export default NextAPI(handler);
