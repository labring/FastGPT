import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { BoolSchema } from '@fastgpt/global/common/zod';
import { MongoSystemModel } from '@fastgpt/service/core/ai/config/schema';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import z from 'zod';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoEvaluation } from '@fastgpt/service/core/app/evaluation/evalSchema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { MongoAppTemplate } from '@fastgpt/service/core/app/templates/templateSchema';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';

const BackfillModelReferencesBodySchema = z.object({
  dryRun: BoolSchema.optional().default(true)
});
export type BackfillModelReferencesBody = z.infer<typeof BackfillModelReferencesBodySchema>;

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

const BackfillModelReferencesResponseSchema = z.object({
  dryRun: z.boolean(),
  references: z.record(z.string(), ReferenceCleanupStatsSchema),
  groups: z.object({
    datasets: CleanupGroupStatsSchema,
    apps: CleanupGroupStatsSchema,
    evaluations: CleanupGroupStatsSchema,
    permissions: CleanupGroupStatsSchema
  })
});
export type BackfillModelReferencesResponse = z.infer<typeof BackfillModelReferencesResponseSchema>;

/** 为历史业务资源补齐稳定模型 ID，不修改 system_models 结构。 */
export const runBackfillModelReferences = async ({
  dryRun
}: BackfillModelReferencesBody): Promise<BackfillModelReferencesResponse> => {
  const stats: BackfillModelReferencesResponse = {
    dryRun,
    references: {},
    groups: undefined as never
  };
  const modelIdByModel = new Map(
    (await MongoSystemModel.find({}, 'model').lean()).map((item) => [item.model, item._id])
  );

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

  return BackfillModelReferencesResponseSchema.parse(stats);
};

async function handler(req: ApiRequestProps): Promise<BackfillModelReferencesResponse> {
  await authSystemAdmin({ req });

  const { body } = parseApiInput({
    req,
    bodySchema: BackfillModelReferencesBodySchema
  });

  return runBackfillModelReferences(body);
}

export default NextAPI(handler);
