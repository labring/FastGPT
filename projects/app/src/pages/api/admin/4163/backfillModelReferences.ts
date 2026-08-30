import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { BoolSchema } from '@fastgpt/global/common/zod';
import { MongoAIModel } from '@fastgpt/service/core/ai/config/schema';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import z from 'zod';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoEvaluation } from '@fastgpt/service/core/app/evaluation/evalSchema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { MongoAppTemplate } from '@fastgpt/service/core/app/templates/templateSchema';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import {
  getSelectedInputRenderType,
  isWorkflowSystemModelInput,
  workflowModelKeyMappings
} from '@fastgpt/global/core/workflow/utils';
import { StoreNodeItemTypeSchema } from '@fastgpt/global/core/workflow/type/node';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { SystemModelDocumentDataType } from '@fastgpt/global/core/ai/model.schema';

const BACKFILL_BATCH_SIZE = 100;

const BackfillModelReferencesBodySchema = z.object({
  dryRun: BoolSchema.optional().default(true)
});
export type BackfillModelReferencesBody = z.infer<typeof BackfillModelReferencesBodySchema>;

const BackfillWorkflowNodesSchema = z.array(StoreNodeItemTypeSchema);

const ReferenceCleanupStatsSchema = z.object({
  scanned: z.number().int().nonnegative(),
  unchanged: z.number().int().nonnegative(),
  invalid: z.number().int().nonnegative(),
  missing: z.number().int().nonnegative(),
  unresolved: z.number().int().nonnegative(),
  conflicts: z.number().int().nonnegative(),
  wouldUpdate: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  wouldDelete: z.number().int().nonnegative(),
  deleted: z.number().int().nonnegative()
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

/** 为历史业务资源补齐稳定模型 ID，不修改 ai_models 结构。 */
export const runBackfillModelReferences = async ({
  dryRun
}: BackfillModelReferencesBody): Promise<BackfillModelReferencesResponse> => {
  const stats: BackfillModelReferencesResponse = {
    dryRun,
    references: {},
    groups: undefined as never
  };
  const storedModels = await MongoAIModel.find({ scope: ModelScopeEnum.system }).lean();
  if (storedModels.length === 0) {
    throw new Error('ai_models is empty; wait for model bootstrap before running 4163');
  }
  type ModelRequirement = { type: ModelTypeEnum; vision?: boolean };
  const matchesRequirement = (
    model: Pick<SystemModelDocumentDataType, 'type' | 'config'>,
    requirement: ModelRequirement
  ) =>
    model.type === requirement.type &&
    (!requirement.vision || ('vision' in model.config && model.config.vision));
  const modelByName = new Map(storedModels.map((item) => [item.model, item]));
  const modelById = new Map(storedModels.map((item) => [String(item._id), item]));
  const isDynamicModelReference = (value: unknown) =>
    Array.isArray(value) || (typeof value === 'string' && /^\{\{.*\}\}$/.test(value));
  const getModelId = ({
    model,
    modelId,
    requirement
  }: {
    model: string;
    modelId?: unknown;
    requirement: ModelRequirement;
  }) => {
    // 重跑迁移时有效 ID 必须保持不变；只有 ID 缺失/无效才允许借 legacy 名称修复。
    const currentModel = modelId !== undefined ? modelById.get(String(modelId)) : undefined;
    if (currentModel && matchesRequirement(currentModel, requirement))
      return String(currentModel._id);

    const legacyModel = model ? modelByName.get(model) : undefined;
    if (legacyModel && matchesRequirement(legacyModel, requirement)) return String(legacyModel._id);

    // 4163 只迁移系统模型身份，不按启停状态或成员权限过滤。
    const fallbackModel = storedModels.find((item) => matchesRequirement(item, requirement));
    return fallbackModel ? String(fallbackModel._id) : undefined;
  };

  type ReferenceTransformResult = {
    set?: Record<string, unknown>;
    snapshot?: Record<string, unknown>;
    missing?: number;
    delete?: boolean;
  };
  type ReferenceStats = z.infer<typeof ReferenceCleanupStatsSchema>;

  const hasPath = (record: Record<string, any>, path: string) => {
    const keys = path.split('.');
    let current: any = record;
    for (const key of keys) {
      if (current === null || typeof current !== 'object' || !(key in current)) return false;
      current = current[key];
    }
    return true;
  };

  const getValueByPath = (record: Record<string, any>, path: string) =>
    path.split('.').reduce<any>((current, key) => current?.[key], record);

  /**
   * 用读取时快照约束回填写入，避免覆盖部署后由在线保存产生的新值。
   * set 目标字段会自动加入快照；transform 通过 snapshot 补充其读取的旧字段。
   */
  const getSnapshotFilter = ({
    record,
    result
  }: {
    record: Record<string, any>;
    result: ReferenceTransformResult;
  }) => {
    const filter: Record<string, unknown> = { _id: record._id };
    const snapshotPaths = new Set([
      ...Object.keys(result.snapshot ?? {}),
      ...Object.keys(result.set ?? {})
    ]);
    for (const path of snapshotPaths) {
      filter[path] = hasPath(record, path) ? getValueByPath(record, path) : { $exists: false };
    }
    return filter;
  };

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
      updated: 0,
      wouldDelete: 0,
      deleted: 0
    };
    const bulkOperations: any[] = [];
    const referenceCursor = model.find({}).lean().cursor();

    const flush = async () => {
      if (bulkOperations.length === 0) return;

      const pendingOperations = bulkOperations.splice(0);
      const result = await model.bulkWrite(pendingOperations, { ordered: false });
      referenceStats.updated += result.modifiedCount;
      referenceStats.deleted += result.deletedCount;
      // 未命中意味着在线数据已偏离读取快照，保留在线写入并记录冲突。
      referenceStats.conflicts +=
        pendingOperations.length - result.matchedCount - result.deletedCount;
    };

    for await (const record of referenceCursor) {
      referenceStats.scanned += 1;
      const result = transform(record);
      referenceStats.missing += result.missing ?? 0;
      referenceStats.unresolved += result.missing ?? 0;
      const hasUpdate = Boolean(result.set && Object.keys(result.set).length > 0);
      if (result.delete) referenceStats.invalid += 1;
      if (!hasUpdate && !result.delete) {
        if (!result.missing) referenceStats.unchanged += 1;
        continue;
      }

      if (dryRun) {
        if (result.delete) {
          referenceStats.wouldDelete += 1;
        } else {
          referenceStats.wouldUpdate += 1;
        }
      } else {
        bulkOperations.push(
          result.delete
            ? {
                deleteOne: {
                  filter: getSnapshotFilter({ record, result })
                }
              }
            : {
                updateOne: {
                  filter: getSnapshotFilter({ record, result }),
                  update: { $set: result.set }
                }
              }
        );
        if (bulkOperations.length >= BACKFILL_BATCH_SIZE) await flush();
      }
    }

    await flush();
    stats.references[name] = referenceStats;
  };

  const backfillFlatModelFields = (
    record: Record<string, unknown>,
    mappings: Array<{
      legacy: string;
      modelId: string;
      requirement: ModelRequirement;
      copyDynamicReference?: boolean;
    }>
  ): ReferenceTransformResult => {
    const set: Record<string, unknown> = {};
    const snapshot: Record<string, unknown> = {};
    let missing = 0;

    for (const mapping of mappings) {
      const legacyModel = record[mapping.legacy];
      const currentModelId = record[mapping.modelId];
      if (mapping.copyDynamicReference && isDynamicModelReference(currentModelId)) continue;
      if (mapping.copyDynamicReference && isDynamicModelReference(legacyModel)) {
        const currentModel =
          currentModelId !== undefined ? modelById.get(String(currentModelId)) : undefined;
        if (currentModel && matchesRequirement(currentModel, mapping.requirement)) continue;

        set[mapping.modelId] = legacyModel;
        snapshot[mapping.legacy] = legacyModel;
        continue;
      }
      if (typeof legacyModel !== 'string' || !legacyModel) {
        if (currentModelId !== undefined) {
          const modelId = getModelId({
            model: '',
            modelId: currentModelId,
            requirement: mapping.requirement
          });
          if (!modelId) {
            missing += 1;
          } else if (String(currentModelId) !== modelId) {
            set[mapping.modelId] = modelId;
          }
        }
        continue;
      }
      const modelId = getModelId({
        model: legacyModel,
        modelId: record[mapping.modelId],
        requirement: mapping.requirement
      });
      if (!modelId) {
        missing += 1;
        continue;
      }
      if (String(record[mapping.modelId] ?? '') === String(modelId)) continue;

      set[mapping.modelId] = modelId;
      snapshot[mapping.legacy] = record[mapping.legacy];
    }
    return { set, snapshot, missing };
  };

  await runCollectionBackfill({
    name: 'datasets',
    model: MongoDataset,
    transform: (record) =>
      backfillFlatModelFields(record, [
        {
          legacy: 'vectorModel',
          modelId: 'vectorModelId',
          requirement: { type: ModelTypeEnum.embedding }
        },
        {
          legacy: 'agentModel',
          modelId: 'agentModelId',
          requirement: { type: ModelTypeEnum.llm }
        },
        {
          legacy: 'vlmModel',
          modelId: 'vlmModelId',
          requirement: { type: ModelTypeEnum.llm, vision: true }
        }
      ])
  });
  await runCollectionBackfill({
    name: 'evaluations',
    model: MongoEvaluation,
    transform: (record) =>
      backfillFlatModelFields(record, [
        {
          legacy: 'evalModel',
          modelId: 'evalModelId',
          requirement: { type: ModelTypeEnum.llm }
        }
      ])
  });
  await runCollectionBackfill({
    name: 'modelPermissions',
    model: MongoResourcePermission,
    transform: (record) => {
      if (record.resourceType !== PerResourceTypeEnum.model) return {};
      const currentModel =
        record.resourceId !== undefined ? modelById.get(String(record.resourceId)) : undefined;
      if (currentModel) return {};

      const permissionModel =
        typeof record.resourceName === 'string' ? modelByName.get(record.resourceName) : undefined;
      const resourceId = permissionModel?._id;
      if (!resourceId) {
        return {
          delete: true,
          snapshot: {
            resourceType: record.resourceType,
            resourceId: record.resourceId,
            resourceName: record.resourceName
          }
        };
      }
      if (String(record.resourceId ?? '') === String(resourceId)) return {};

      return { set: { resourceId }, snapshot: { resourceName: record.resourceName } };
    }
  });

  const backfillChatConfig = ({
    chatConfig,
    pathPrefix
  }: {
    chatConfig: Record<string, any> | undefined;
    pathPrefix: string;
  }): ReferenceTransformResult => {
    const set: Record<string, unknown> = {};
    const snapshot: Record<string, unknown> = {};
    let missing = 0;
    const mappings = [
      {
        config: chatConfig?.questionGuide,
        configPath: `${pathPrefix}.questionGuide`,
        requirement: { type: ModelTypeEnum.llm }
      },
      {
        config: chatConfig?.ttsConfig,
        configPath: `${pathPrefix}.ttsConfig`,
        requirement: { type: ModelTypeEnum.tts }
      }
    ];
    for (const mapping of mappings) {
      if (typeof mapping.config?.model !== 'string' || !mapping.config.model) {
        if (mapping.config?.modelId !== undefined) {
          const modelId = getModelId({
            model: '',
            modelId: mapping.config.modelId,
            requirement: mapping.requirement
          });
          if (!modelId) {
            missing += 1;
          } else if (String(mapping.config.modelId) !== modelId) {
            set[`${mapping.configPath}.modelId`] = modelId;
          }
        }
        continue;
      }
      const modelId = getModelId({
        model: mapping.config.model,
        modelId: mapping.config.modelId,
        requirement: mapping.requirement
      });
      if (!modelId) {
        missing += 1;
        continue;
      }
      if (String(mapping.config?.modelId ?? '') === String(modelId)) continue;

      set[`${mapping.configPath}.modelId`] = String(modelId);
      snapshot[`${mapping.configPath}.model`] = mapping.config.model;
    }
    return { set, snapshot, missing };
  };

  await runCollectionBackfill({
    name: 'appsChatConfig',
    model: MongoApp,
    transform: (record) =>
      backfillChatConfig({ chatConfig: record.chatConfig, pathPrefix: 'chatConfig' })
  });
  await runCollectionBackfill({
    name: 'appVersionsChatConfig',
    model: MongoAppVersion,
    transform: (record) =>
      backfillChatConfig({ chatConfig: record.chatConfig, pathPrefix: 'chatConfig' })
  });
  await runCollectionBackfill({
    name: 'appTemplatesChatConfig',
    model: MongoAppTemplate,
    transform: (record) =>
      backfillChatConfig({
        chatConfig: record.workflow?.chatConfig,
        pathPrefix: 'workflow.chatConfig'
      })
  });

  const migrateWorkflowNodes = (
    nodes: unknown
  ): { nodes: unknown; changed: boolean; missing: number } => {
    if (!Array.isArray(nodes)) return { nodes, changed: false, missing: 0 };
    let changed = false;
    let missing = 0;
    const nextNodes = nodes.map((node) => {
      if (!node || typeof node !== 'object' || !Array.isArray((node as any).inputs)) return node;
      const inputs = [...(node as any).inputs];
      let nodeChanged = false;

      for (const [legacyKey, modelIdKey] of workflowModelKeyMappings) {
        const legacyInput = inputs.find((input) => input?.key === legacyKey);
        const modelIdInputIndex = inputs.findIndex((input) => input?.key === modelIdKey);
        const modelIdInput = inputs[modelIdInputIndex];
        const systemModelInput = modelIdInput ?? legacyInput;
        if (!systemModelInput) continue;
        const isSystemModelInput = isWorkflowSystemModelInput({
          node: node as any,
          input: systemModelInput
        });

        // 插件工具参数允许任意命名，非系统输入即使叫 model/modelId 也必须原样保留。
        if (!isSystemModelInput) continue;

        const requirement: ModelRequirement = {
          type:
            legacyKey === NodeInputKeyEnum.datasetSearchRerankModel
              ? ModelTypeEnum.rerank
              : ModelTypeEnum.llm
        };
        const isDynamicModelId =
          modelIdInput !== undefined &&
          (getSelectedInputRenderType(modelIdInput) === FlowNodeInputTypeEnum.reference ||
            isDynamicModelReference(modelIdInput.value));
        if (isDynamicModelId) continue;

        const hasValidCurrentModelId = () => {
          if (!modelIdInput) return false;
          const currentModel = modelById.get(String(modelIdInput.value));
          return !!currentModel && matchesRequirement(currentModel, requirement);
        };
        if (!legacyInput) {
          if (!hasValidCurrentModelId()) {
            const modelId = getModelId({
              model: '',
              modelId: modelIdInput?.value,
              requirement
            });
            if (!modelId) {
              missing += 1;
            } else if (modelIdInput && String(modelIdInput.value) !== modelId) {
              inputs[modelIdInputIndex] = { ...modelIdInput, value: modelId };
              changed = true;
              nodeChanged = true;
            }
          }
          continue;
        }

        const isReference =
          getSelectedInputRenderType(legacyInput) === FlowNodeInputTypeEnum.reference ||
          isDynamicModelReference(legacyInput.value);
        if (isReference) {
          if (!modelIdInput) {
            inputs.push({ ...legacyInput, key: modelIdKey });
            changed = true;
            nodeChanged = true;
          } else if (!hasValidCurrentModelId()) {
            const modelId = getModelId({
              model: '',
              modelId: modelIdInput.value,
              requirement
            });
            if (!modelId) {
              missing += 1;
            } else {
              inputs[modelIdInputIndex] = { ...modelIdInput, value: modelId };
              changed = true;
              nodeChanged = true;
            }
          }
          continue;
        }
        if (typeof legacyInput.value !== 'string' || !legacyInput.value) {
          if (modelIdInput && !hasValidCurrentModelId()) missing += 1;
          continue;
        }
        const modelId = getModelId({
          model: legacyInput.value,
          modelId: modelIdInput?.value,
          requirement
        });
        if (modelIdInput) {
          if (!modelId) {
            missing += 1;
          } else if (String(modelIdInput.value) !== String(modelId)) {
            inputs[modelIdInputIndex] = { ...modelIdInput, value: String(modelId) };
            changed = true;
            nodeChanged = true;
          }
          continue;
        }
        if (!modelId) {
          missing += 1;
          continue;
        }
        inputs.push({ ...legacyInput, key: modelIdKey, value: String(modelId) });
        changed = true;
        nodeChanged = true;
      }

      const datasetParamsIndex = inputs.findIndex(
        (input) => input?.key === NodeInputKeyEnum.datasetParams
      );
      const datasetParams = inputs[datasetParamsIndex]?.value;
      if (
        (node as any).flowNodeType === FlowNodeTypeEnum.agent &&
        datasetParamsIndex >= 0 &&
        datasetParams &&
        typeof datasetParams === 'object' &&
        !Array.isArray(datasetParams)
      ) {
        const result = backfillFlatModelFields(datasetParams, [
          {
            legacy: 'rerankModel',
            modelId: 'rerankModelId',
            requirement: { type: ModelTypeEnum.rerank },
            copyDynamicReference: true
          },
          {
            legacy: 'datasetSearchExtensionModel',
            modelId: 'datasetSearchExtensionModelId',
            requirement: { type: ModelTypeEnum.llm },
            copyDynamicReference: true
          }
        ]);
        missing += result.missing ?? 0;
        if (result.set && Object.keys(result.set).length > 0) {
          inputs[datasetParamsIndex] = {
            ...inputs[datasetParamsIndex],
            value: {
              ...datasetParams,
              ...Object.fromEntries(
                Object.entries(result.set).map(([key, value]) => [key, String(value)])
              )
            }
          };
          changed = true;
          nodeChanged = true;
        }
      }

      return nodeChanged ? { ...(node as any), inputs } : node;
    });
    const parsedNodes = changed ? BackfillWorkflowNodesSchema.parse(nextNodes) : nextNodes;
    return { nodes: parsedNodes, changed, missing };
  };

  await runCollectionBackfill({
    name: 'appsWorkflow',
    model: MongoApp,
    transform: (record) => {
      const result = migrateWorkflowNodes(record.modules);
      return {
        set: result.changed ? { modules: result.nodes } : undefined,
        missing: result.missing
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
        missing: result.missing
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
        missing: nodesResult.missing + modulesResult.missing
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
      updated: 0,
      wouldDelete: 0,
      deleted: 0
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
      group.wouldDelete += item.wouldDelete;
      group.deleted += item.deleted;
    }
    return group;
  };

  stats.groups = {
    datasets: aggregateReferenceStats(['datasets']),
    apps: aggregateReferenceStats([
      'appsChatConfig',
      'appVersionsChatConfig',
      'appTemplatesChatConfig',
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
  await authCert({ req, authRoot: true });

  const { body } = parseApiInput({
    req,
    bodySchema: BackfillModelReferencesBodySchema
  });

  return runBackfillModelReferences(body);
}

export default NextAPI(handler);
