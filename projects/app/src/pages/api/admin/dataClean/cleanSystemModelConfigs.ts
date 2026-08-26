import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { BoolSchema } from '@fastgpt/global/common/zod';
import { defaultQAModels, defaultVectorModels } from '@fastgpt/global/core/ai/constants';
import {
  ModelPriceTierSchema,
  SystemModelDocumentDataSchema,
  type SystemModelDocumentDataType
} from '@fastgpt/global/core/ai/model.schema';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { MongoSystemModel } from '@fastgpt/service/core/ai/config/schema';
import {
  flatModelToDocumentData,
  getPluginSystemModelDocuments,
  updatedReloadSystemModel
} from '@fastgpt/service/core/ai/config/utils';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { isDeepStrictEqual } from 'node:util';
import z from 'zod';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoEvaluation } from '@fastgpt/service/core/app/evaluation/evalSchema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { MongoAppTemplate } from '@fastgpt/service/core/app/templates/templateSchema';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { connectionMongo } from '@fastgpt/service/common/mongo';

const CleanSystemModelConfigsBodySchema = z.object({
  dryRun: BoolSchema.optional().default(true)
});
export type CleanSystemModelConfigsBody = z.infer<typeof CleanSystemModelConfigsBodySchema>;

const CleanupIssueSchema = z.object({
  path: z.array(z.union([z.string(), z.number()])),
  message: z.string()
});

const ReferenceCleanupStatsSchema = z.object({
  scanned: z.number().int().nonnegative(),
  unchanged: z.number().int().nonnegative(),
  invalid: z.number().int().nonnegative(),
  missing: z.number().int().nonnegative(),
  unresolved: z.number().int().nonnegative(),
  conflicts: z.number().int().nonnegative(),
  wouldUpdate: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative()
});

const CleanupGroupStatsSchema = ReferenceCleanupStatsSchema.omit({ missing: true });

const CleanSystemModelConfigsResponseSchema = z.object({
  dryRun: z.boolean(),
  scanned: z.number().int().nonnegative(),
  unchanged: z.number().int().nonnegative(),
  invalid: z.number().int().nonnegative(),
  wouldUpdate: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  references: z.record(z.string(), ReferenceCleanupStatsSchema),
  groups: z.object({
    models: CleanupGroupStatsSchema,
    datasets: CleanupGroupStatsSchema,
    apps: CleanupGroupStatsSchema,
    evaluations: CleanupGroupStatsSchema,
    permissions: CleanupGroupStatsSchema
  }),
  invalidSamples: z.array(
    z.object({
      model: z.string(),
      issues: z.array(CleanupIssueSchema)
    })
  )
});
export type CleanSystemModelConfigsResponse = z.infer<typeof CleanSystemModelConfigsResponseSchema>;

const parseLegacyNumber = (value: unknown) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string' || value.trim() === '') return undefined;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const LegacyOptionalNumberSchema = z.preprocess(parseLegacyNumber, z.number().optional());
const legacyNumberWithDefaultSchema = (defaultValue: number) =>
  z.preprocess((value) => parseLegacyNumber(value) ?? defaultValue, z.number());

const defaultLlmConfig = defaultQAModels[0];
const defaultEmbeddingConfig = defaultVectorModels[0];

const LegacyModelPriceTierSchema = ModelPriceTierSchema.extend({
  minInputTokens: LegacyOptionalNumberSchema,
  maxInputTokens: LegacyOptionalNumberSchema,
  inputPrice: legacyNumberWithDefaultSchema(0),
  outputPrice: legacyNumberWithDefaultSchema(0)
});

const LegacyPriceTiersSchema = z.preprocess((value) => {
  if (value === '' || value === null) return undefined;
  if (typeof value !== 'string') return value;

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}, z.array(LegacyModelPriceTierSchema).optional());

const legacyPriceFields = {
  charsPointsPrice: LegacyOptionalNumberSchema,
  priceTiers: LegacyPriceTiersSchema,
  inputPrice: LegacyOptionalNumberSchema,
  outputPrice: LegacyOptionalNumberSchema
};

const LegacyModelBaseSchema = z.object({
  modelId: z.string().optional(),
  provider: z.string().trim().min(1),
  model: z.string().trim().min(1),
  name: z.string().trim().min(1),
  avatar: z.string().optional(),
  isActive: z.boolean().optional(),
  isCustom: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  requestUrl: z.string().optional(),
  requestAuth: z.string().optional(),
  testMode: z.boolean().optional()
});

const LegacyLLMModelSchema = LegacyModelBaseSchema.extend({
  type: z.literal(ModelTypeEnum.llm),
  maxContext: z.number(),
  maxResponse: z.number(),
  quoteMaxToken: z.number(),
  maxTemperature: z.number().optional(),
  showTopP: z.boolean().optional(),
  responseFormatList: z.array(z.string()).optional(),
  showStopSign: z.boolean().optional(),
  censor: z.boolean().optional(),
  vision: z.boolean().optional(),
  audio: z.boolean().optional(),
  video: z.boolean().optional(),
  reasoning: z.boolean().optional(),
  reasoningEffort: z.boolean().optional(),
  functionCall: z.boolean().optional(),
  toolChoice: z.boolean().optional(),
  defaultSystemChatPrompt: z.string().optional(),
  defaultConfig: z.record(z.string(), z.any()).optional(),
  fieldMap: z.record(z.string(), z.string()).optional(),
  isDefaultDatasetTextModel: z.boolean().optional(),
  isDefaultDatasetImageModel: z.boolean().optional(),
  isDefaultChatTitleModel: z.boolean().optional(),
  datasetProcess: z.boolean().optional(),
  usedInClassify: z.boolean().optional(),
  usedInExtractFields: z.boolean().optional(),
  usedInToolCall: z.boolean().optional(),
  useInEvaluation: z.boolean().optional()
});

const LegacyEmbeddingModelSchema = LegacyModelBaseSchema.extend({
  type: z.literal(ModelTypeEnum.embedding),
  defaultToken: z.number(),
  maxToken: z.number(),
  weight: z.number().optional(),
  hidden: z.boolean().optional(),
  vision: z.boolean().optional(),
  normalization: z.boolean().optional(),
  batchSize: z.number().optional(),
  defaultConfig: z.record(z.string(), z.any()).optional(),
  dbConfig: z.record(z.string(), z.any()).optional(),
  queryConfig: z.record(z.string(), z.any()).optional()
});

const LegacyRerankModelSchema = LegacyModelBaseSchema.extend({
  type: z.literal(ModelTypeEnum.rerank),
  maxToken: z.number().optional(),
  defaultConfig: z.record(z.string(), z.any()).optional()
});

const LegacyTTSModelSchema = LegacyModelBaseSchema.extend({
  type: z.literal(ModelTypeEnum.tts),
  voices: z.array(z.object({ label: z.string(), value: z.string() }))
});

const LegacySTTModelSchema = LegacyModelBaseSchema.extend({
  type: z.literal(ModelTypeEnum.stt)
});

const LegacySystemModelItemSchema = z.discriminatedUnion('type', [
  LegacyLLMModelSchema.extend({
    ...legacyPriceFields,
    maxContext: legacyNumberWithDefaultSchema(defaultLlmConfig.config.maxContext),
    maxResponse: legacyNumberWithDefaultSchema(defaultLlmConfig.config.maxResponse),
    quoteMaxToken: legacyNumberWithDefaultSchema(defaultLlmConfig.config.quoteMaxToken),
    maxTemperature: LegacyOptionalNumberSchema
  }),
  LegacyEmbeddingModelSchema.extend({
    ...legacyPriceFields,
    defaultToken: legacyNumberWithDefaultSchema(defaultEmbeddingConfig.config.defaultToken),
    maxToken: legacyNumberWithDefaultSchema(defaultEmbeddingConfig.config.maxToken),
    weight: LegacyOptionalNumberSchema
  }),
  LegacyTTSModelSchema.extend(legacyPriceFields),
  LegacySTTModelSchema.extend(legacyPriceFields),
  LegacyRerankModelSchema.extend({
    ...legacyPriceFields,
    maxToken: LegacyOptionalNumberSchema
  })
]);

export type SystemModelCleanupResult =
  | {
      status: 'valid';
      changed: boolean;
      document: SystemModelDocumentDataType;
    }
  | {
      status: 'invalid';
      issues: Array<{ path: Array<string | number>; message: string }>;
    };

/** 只转换已知历史格式，无法通过当前完整 Schema 的记录留给管理员人工处理。 */
export const cleanSystemModelConfig = ({
  model,
  metadata
}: {
  model: unknown;
  metadata: unknown;
}): SystemModelCleanupResult => {
  if (typeof model !== 'string' || !metadata || typeof metadata !== 'object') {
    return {
      status: 'invalid',
      issues: [{ path: [], message: 'model and metadata are required' }]
    };
  }

  const normalizedModel = model.trim();
  const rawMetadata = metadata as Record<string, unknown>;
  const result = LegacySystemModelItemSchema.safeParse({
    ...rawMetadata,
    model: normalizedModel,
    name:
      typeof rawMetadata.name === 'string' && rawMetadata.name.trim()
        ? rawMetadata.name.trim()
        : normalizedModel
  });

  if (!result.success) {
    return {
      status: 'invalid',
      issues: result.error.issues.map((issue) => ({
        path: issue.path.map((item) =>
          typeof item === 'symbol' ? (item.description ?? '') : item
        ),
        message: issue.message
      }))
    };
  }

  const document = flatModelToDocumentData(result.data);
  return {
    status: 'valid',
    changed: !isDeepStrictEqual(rawMetadata, document),
    document
  };
};

/** 扫描并一次性清洗历史系统模型配置；正式执行后统一重载系统模型缓存。 */
export const runCleanSystemModelConfigs = async ({
  dryRun
}: CleanSystemModelConfigsBody): Promise<CleanSystemModelConfigsResponse> => {
  const stats: CleanSystemModelConfigsResponse = {
    dryRun,
    scanned: 0,
    unchanged: 0,
    invalid: 0,
    wouldUpdate: 0,
    updated: 0,
    references: {},
    groups: undefined as never,
    invalidSamples: []
  };
  type BulkOperation = Parameters<typeof MongoSystemModel.bulkWrite>[0][number];
  const operations: BulkOperation[] = [];
  let modelIdByModel = new Map<string, unknown>();
  const pluginDocuments = await getPluginSystemModelDocuments();
  const pluginDocumentMap = new Map(pluginDocuments.map((item) => [item.model, item]));
  const existingModels = new Set<string>();

  const isCanonicalDocumentEqual = (
    record: Record<string, unknown>,
    document: SystemModelDocumentDataType
  ) => Object.entries(document).every(([key, value]) => isDeepStrictEqual(record[key], value));

  // 旧 metadata 不属于当前模型 Schema，迁移脚本必须从原生 collection 读取历史文档。
  const cursor = MongoSystemModel.collection.find({});
  for await (const record of cursor) {
    stats.scanned += 1;
    if (existingModels.has(record.model)) {
      stats.invalid += 1;
      stats.invalidSamples.push({
        model: record.model,
        issues: [{ path: ['model'], message: 'duplicate model reference' }]
      });
      continue;
    }
    existingModels.add(record.model);

    const pluginDocument = pluginDocumentMap.get(record.model);
    const canonical = record.config
      ? SystemModelDocumentDataSchema.safeParse({
          ...(pluginDocument ?? {}),
          ...record,
          isSystem: true,
          config: {
            ...(pluginDocument?.config ?? {}),
            ...(record.config ?? {})
          }
        })
      : undefined;
    const cleaned = canonical?.success
      ? {
          status: 'valid' as const,
          changed: !isCanonicalDocumentEqual(record, canonical.data),
          document: canonical.data
        }
      : cleanSystemModelConfig({
          model: record.model,
          metadata: record.metadata
        });

    if (cleaned.status === 'invalid') {
      stats.invalid += 1;
      stats.invalidSamples.push({
        model: typeof record.model === 'string' ? record.model : String(record._id),
        issues: cleaned.issues
      });
      continue;
    }
    modelIdByModel.set(record.model, record._id);
    if (!cleaned.changed) {
      stats.unchanged += 1;
      continue;
    }
    if (dryRun) {
      stats.wouldUpdate += 1;
      continue;
    }

    operations.push({
      updateOne: {
        filter: { _id: record._id },
        update: {
          $set: cleaned.document
        }
      }
    });
  }

  for (const document of pluginDocuments) {
    if (existingModels.has(document.model)) continue;
    stats.scanned += 1;
    if (dryRun) {
      stats.wouldUpdate += 1;
      modelIdByModel.set(document.model, new connectionMongo.Types.ObjectId());
      continue;
    }
    operations.push({
      updateOne: {
        filter: { isSystem: true, model: document.model },
        update: { $setOnInsert: document },
        upsert: true
      }
    });
  }

  if (operations.length > 0) {
    const result = await MongoSystemModel.bulkWrite(operations, { ordered: false });
    stats.updated = result.modifiedCount + result.upsertedCount;
  }

  if (!dryRun) {
    const materializedModels = await MongoSystemModel.find({}).lean();
    modelIdByModel = new Map(
      materializedModels
        .filter((item) => SystemModelDocumentDataSchema.safeParse(item).success)
        .map((item) => [item.model, item._id])
    );
  }

  type ReferenceTransformResult = {
    set?: Record<string, unknown>;
    missing?: number;
    conflicts?: number;
  };
  type ReferenceStats = z.infer<typeof ReferenceCleanupStatsSchema>;

  /** 同一套 dry-run/批量写语义覆盖所有引用集合，避免各迁移分支出现不一致行为。 */
  const runCollectionBackfill = async ({
    name,
    model,
    transform
  }: {
    name: string;
    model: any;
    transform: (record: any) => ReferenceTransformResult;
  }) => {
    const referenceStats: ReferenceStats = {
      scanned: 0,
      unchanged: 0,
      invalid: 0,
      missing: 0,
      unresolved: 0,
      conflicts: 0,
      wouldUpdate: 0,
      updated: 0
    };
    const bulkOperations: any[] = [];
    const referenceCursor = model.find({}).lean().cursor();

    for await (const record of referenceCursor) {
      referenceStats.scanned += 1;
      const result = transform(record);
      referenceStats.missing += result.missing ?? 0;
      referenceStats.unresolved += result.missing ?? 0;
      referenceStats.conflicts += result.conflicts ?? 0;
      if (!result.set || Object.keys(result.set).length === 0) {
        if (!result.missing && !result.conflicts) referenceStats.unchanged += 1;
        continue;
      }

      if (dryRun) {
        referenceStats.wouldUpdate += 1;
      } else {
        bulkOperations.push({
          updateOne: {
            filter: { _id: record._id },
            update: { $set: result.set }
          }
        });
      }
    }

    if (bulkOperations.length > 0) {
      const result = await model.bulkWrite(bulkOperations, { ordered: false });
      referenceStats.updated = result.modifiedCount;
    }
    stats.references[name] = referenceStats;
  };

  const backfillFlatModelFields = (
    record: Record<string, unknown>,
    mappings: Array<{ legacy: string; modelId: string }>
  ): ReferenceTransformResult => {
    const set: Record<string, unknown> = {};
    let missing = 0;
    let conflicts = 0;

    for (const mapping of mappings) {
      if (typeof record[mapping.legacy] !== 'string') continue;
      const modelId = modelIdByModel.get(record[mapping.legacy] as string);
      if (record[mapping.modelId]) {
        if (modelId && String(record[mapping.modelId]) !== String(modelId)) conflicts += 1;
        continue;
      }
      if (modelId) set[mapping.modelId] = modelId;
      else missing += 1;
    }
    return { set, missing, conflicts };
  };

  await runCollectionBackfill({
    name: 'datasets',
    model: MongoDataset,
    transform: (record) =>
      backfillFlatModelFields(record, [
        { legacy: 'vectorModel', modelId: 'vectorModelId' },
        { legacy: 'agentModel', modelId: 'agentModelId' },
        { legacy: 'vlmModel', modelId: 'vlmModelId' }
      ])
  });
  await runCollectionBackfill({
    name: 'evaluations',
    model: MongoEvaluation,
    transform: (record) =>
      backfillFlatModelFields(record, [{ legacy: 'evalModel', modelId: 'evalModelId' }])
  });
  await runCollectionBackfill({
    name: 'modelPermissions',
    model: MongoResourcePermission,
    transform: (record) => {
      if (
        record.resourceType !== PerResourceTypeEnum.model ||
        record.resourceId ||
        typeof record.resourceName !== 'string'
      ) {
        return {};
      }
      const resourceId = modelIdByModel.get(record.resourceName);
      return resourceId ? { set: { resourceId } } : { missing: 1 };
    }
  });

  const backfillChatConfig = (record: Record<string, any>): ReferenceTransformResult => {
    const set: Record<string, unknown> = {};
    let missing = 0;
    let conflicts = 0;
    const mappings = [
      {
        config: record.chatConfig?.questionGuide,
        path: 'chatConfig.questionGuide.modelId'
      },
      { config: record.chatConfig?.ttsConfig, path: 'chatConfig.ttsConfig.modelId' }
    ];
    for (const mapping of mappings) {
      if (typeof mapping.config?.model !== 'string') continue;
      const modelId = modelIdByModel.get(mapping.config.model);
      if (mapping.config?.modelId) {
        if (modelId && String(mapping.config.modelId) !== String(modelId)) conflicts += 1;
        continue;
      }
      if (modelId) set[mapping.path] = modelId;
      else missing += 1;
    }
    return { set, missing, conflicts };
  };

  await runCollectionBackfill({
    name: 'appsChatConfig',
    model: MongoApp,
    transform: backfillChatConfig
  });
  await runCollectionBackfill({
    name: 'appVersionsChatConfig',
    model: MongoAppVersion,
    transform: backfillChatConfig
  });

  const workflowKeyMappings = [
    [NodeInputKeyEnum.aiModel, NodeInputKeyEnum.aiModelId],
    [NodeInputKeyEnum.datasetSearchRerankModel, NodeInputKeyEnum.datasetSearchRerankModelId],
    [NodeInputKeyEnum.datasetSearchExtensionModel, NodeInputKeyEnum.datasetSearchExtensionModelId],
    [NodeInputKeyEnum.datasetDeepSearchModel, NodeInputKeyEnum.datasetDeepSearchModelId]
  ] as const;
  const migrateWorkflowNodes = (
    nodes: unknown
  ): { nodes: unknown; changed: boolean; missing: number; conflicts: number } => {
    if (!Array.isArray(nodes)) return { nodes, changed: false, missing: 0, conflicts: 0 };
    let changed = false;
    let missing = 0;
    let conflicts = 0;
    const nextNodes = nodes.map((node) => {
      if (!node || typeof node !== 'object' || !Array.isArray((node as any).inputs)) return node;
      const inputs = [...(node as any).inputs];

      for (const [legacyKey, modelIdKey] of workflowKeyMappings) {
        const legacyInput = inputs.find((input) => input?.key === legacyKey);
        if (!legacyInput || typeof legacyInput.value !== 'string') continue;
        const modelId = modelIdByModel.get(legacyInput.value);
        const modelIdInput = inputs.find((input) => input?.key === modelIdKey);
        if (modelIdInput) {
          if (modelId && String(modelIdInput.value) !== String(modelId)) conflicts += 1;
          continue;
        }
        if (!modelId) {
          missing += 1;
          continue;
        }
        inputs.push({ ...legacyInput, key: modelIdKey, value: String(modelId) });
        changed = true;
      }

      return inputs === (node as any).inputs ? node : { ...(node as any), inputs };
    });
    return { nodes: nextNodes, changed, missing, conflicts };
  };

  await runCollectionBackfill({
    name: 'appsWorkflow',
    model: MongoApp,
    transform: (record) => {
      const result = migrateWorkflowNodes(record.modules);
      return {
        set: result.changed ? { modules: result.nodes } : undefined,
        missing: result.missing,
        conflicts: result.conflicts
      };
    }
  });
  await runCollectionBackfill({
    name: 'appVersionsWorkflow',
    model: MongoAppVersion,
    transform: (record) => {
      const result = migrateWorkflowNodes(record.nodes);
      return {
        set: result.changed ? { nodes: result.nodes } : undefined,
        missing: result.missing,
        conflicts: result.conflicts
      };
    }
  });
  await runCollectionBackfill({
    name: 'appTemplatesWorkflow',
    model: MongoAppTemplate,
    transform: (record) => {
      const workflow = record.workflow ?? {};
      const nodesResult = migrateWorkflowNodes(workflow.nodes);
      const modulesResult = migrateWorkflowNodes(workflow.modules);
      const set: Record<string, unknown> = {};
      if (nodesResult.changed) set['workflow.nodes'] = nodesResult.nodes;
      if (modulesResult.changed) set['workflow.modules'] = modulesResult.nodes;
      return {
        set,
        missing: nodesResult.missing + modulesResult.missing,
        conflicts: nodesResult.conflicts + modulesResult.conflicts
      };
    }
  });

  const aggregateReferenceStats = (names: string[]) => {
    const group = {
      scanned: 0,
      unchanged: 0,
      invalid: 0,
      unresolved: 0,
      conflicts: 0,
      wouldUpdate: 0,
      updated: 0
    };
    for (const name of names) {
      const item = stats.references[name];
      if (!item) continue;
      group.scanned += item.scanned;
      group.unchanged += item.unchanged;
      group.invalid += item.invalid;
      group.unresolved += item.unresolved;
      group.conflicts += item.conflicts;
      group.wouldUpdate += item.wouldUpdate;
      group.updated += item.updated;
    }
    return group;
  };

  stats.groups = {
    models: {
      scanned: stats.scanned,
      unchanged: stats.unchanged,
      invalid: stats.invalid,
      unresolved: 0,
      conflicts: 0,
      wouldUpdate: stats.wouldUpdate,
      updated: stats.updated
    },
    datasets: aggregateReferenceStats(['datasets']),
    apps: aggregateReferenceStats([
      'appsChatConfig',
      'appVersionsChatConfig',
      'appsWorkflow',
      'appVersionsWorkflow',
      'appTemplatesWorkflow'
    ]),
    evaluations: aggregateReferenceStats(['evaluations']),
    permissions: aggregateReferenceStats(['modelPermissions'])
  };

  if (!dryRun) {
    await updatedReloadSystemModel();
  }

  return CleanSystemModelConfigsResponseSchema.parse(stats);
};

async function handler(req: ApiRequestProps): Promise<CleanSystemModelConfigsResponse> {
  await authSystemAdmin({ req });

  const { body } = parseApiInput({
    req,
    bodySchema: CleanSystemModelConfigsBodySchema
  });

  return runCleanSystemModelConfigs(body);
}

export default NextAPI(handler);
