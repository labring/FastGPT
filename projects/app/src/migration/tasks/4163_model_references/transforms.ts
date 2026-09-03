import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
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
import type { ModelCatalog } from './modelCatalog';
import type { ModelRequirement, ReferenceTransformResult } from './types';

type FlatModelMapping = {
  legacy: string;
  modelId: string;
  requirement: ModelRequirement;
  copyDynamicReference?: boolean;
  /** 功能关闭时不要求模型引用完整，也不改动历史现场。 */
  featureEnabled?: boolean;
  /** App 功能开启时允许在现有引用都失效后使用系统默认模型。 */
  fallbackToDefault?: boolean;
};

const isDynamicModelReference = (value: unknown) =>
  Array.isArray(value) || (typeof value === 'string' && /^\{\{.*\}\}$/.test(value));

const legacyUserGuideNodeType = 'userGuide';

/** 为普通对象上的旧模型名称字段补齐稳定模型 ID；无法解析的历史值保持原样。 */
export const backfillFlatModelFields = ({
  record,
  mappings,
  catalog
}: {
  record: Record<string, any>;
  mappings: FlatModelMapping[];
  catalog: ModelCatalog;
}): ReferenceTransformResult => {
  const set: Record<string, unknown> = {};
  const snapshot: Record<string, unknown> = {};

  for (const mapping of mappings) {
    if (mapping.featureEnabled === false) continue;
    const legacyModel = record[mapping.legacy];
    const currentModelId = record[mapping.modelId];
    if (mapping.copyDynamicReference && isDynamicModelReference(currentModelId)) continue;

    if (mapping.copyDynamicReference && isDynamicModelReference(legacyModel)) {
      if (
        currentModelId !== undefined &&
        catalog.hasMatchingModelId(currentModelId, mapping.requirement)
      ) {
        continue;
      }
      set[mapping.modelId] = legacyModel;
      snapshot[mapping.legacy] = legacyModel;
      continue;
    }

    const modelId =
      catalog.resolveModelId({
        legacyModel: typeof legacyModel === 'string' ? legacyModel : undefined,
        modelId: currentModelId,
        requirement: mapping.requirement
      }) ??
      (mapping.fallbackToDefault ? catalog.resolveFallbackModelId(mapping.requirement) : undefined);
    // 历史引用无法解析时保留现场；迁移只补能够确定的 ID，不把业务脏数据升级为任务失败。
    if (!modelId) continue;
    if (String(currentModelId ?? '') === modelId) continue;

    set[mapping.modelId] = modelId;
    snapshot[mapping.legacy] = legacyModel;
  }

  return {
    set: Object.keys(set).length > 0 ? set : undefined,
    snapshot: Object.keys(snapshot).length > 0 ? snapshot : undefined
  };
};

/** 补齐应用对话配置中的引导模型和 TTS 模型 ID。 */
export const backfillChatConfig = ({
  chatConfig,
  pathPrefix,
  catalog
}: {
  chatConfig: Record<string, any> | undefined;
  pathPrefix: string;
  catalog: ModelCatalog;
}): ReferenceTransformResult => {
  const set: Record<string, unknown> = {};
  const snapshot: Record<string, unknown> = {};
  const mappings = [
    {
      config: chatConfig?.questionGuide,
      configPath: `${pathPrefix}.questionGuide`,
      requirement: { type: ModelTypeEnum.llm },
      featureEnabled: chatConfig?.questionGuide?.open === true
    },
    {
      config: chatConfig?.ttsConfig,
      configPath: `${pathPrefix}.ttsConfig`,
      requirement: { type: ModelTypeEnum.tts },
      featureEnabled: chatConfig?.ttsConfig?.type === 'model'
    }
  ];

  for (const mapping of mappings) {
    if (!mapping.featureEnabled) continue;
    const modelId =
      catalog.resolveModelId({
        legacyModel: typeof mapping.config?.model === 'string' ? mapping.config.model : undefined,
        modelId: mapping.config?.modelId,
        requirement: mapping.requirement
      }) ?? catalog.resolveFallbackModelId(mapping.requirement);
    if (!modelId) continue;
    if (String(mapping.config?.modelId ?? '') === modelId) continue;

    set[`${mapping.configPath}.modelId`] = modelId;
    snapshot[`${mapping.configPath}.model`] = mapping.config?.model;
  }

  return {
    set: Object.keys(set).length > 0 ? set : undefined,
    snapshot: Object.keys(snapshot).length > 0 ? snapshot : undefined
  };
};

/** 补齐工作流系统模型输入；插件自定义参数和动态引用保持原样。 */
export const migrateWorkflowNodes = ({
  nodes,
  catalog
}: {
  nodes: unknown;
  catalog: ModelCatalog;
}): { nodes: unknown; changed: boolean; errors: string[] } => {
  if (!Array.isArray(nodes)) return { nodes, changed: false, errors: [] };

  let changed = false;
  const errors: string[] = [];
  const isFeatureEnabled = ({
    inputs,
    legacyKey
  }: {
    inputs: Record<string, any>[];
    legacyKey: string;
  }) => {
    const featureKey = (() => {
      if (legacyKey === NodeInputKeyEnum.datasetSearchRerankModel) {
        return NodeInputKeyEnum.datasetSearchUsingReRank;
      }
      if (legacyKey === NodeInputKeyEnum.datasetSearchExtensionModel) {
        return NodeInputKeyEnum.datasetSearchUsingExtensionQuery;
      }
      if (legacyKey === NodeInputKeyEnum.datasetDeepSearchModel) {
        return NodeInputKeyEnum.datasetDeepSearch;
      }
    })();
    if (!featureKey) return true;
    return Boolean(inputs.find((input) => input?.key === featureKey)?.value);
  };
  const nextNodes = nodes.map((node, nodeIndex) => {
    if (!node || typeof node !== 'object') return node;

    /*
     * systemConfig 已从 Workflow 节点移到 chatConfig；遗留 userGuide 节点不再参与运行。
     * 这里只降级节点类型，不删除节点或搬运配置，确保本任务的写入仍是最小、可重放变更。
     */
    const isLegacyUserGuide = (node as any).flowNodeType === legacyUserGuideNodeType;
    if (!Array.isArray((node as any).inputs)) {
      if (!isLegacyUserGuide) return node;
      changed = true;
      return { ...(node as any), flowNodeType: FlowNodeTypeEnum.emptyNode };
    }
    const inputs = [...(node as any).inputs];
    let nodeChanged = isLegacyUserGuide;
    if (isLegacyUserGuide) changed = true;

    for (const [legacyKey, modelIdKey] of workflowModelKeyMappings) {
      const legacyInput = inputs.find((input) => input?.key === legacyKey);
      const modelIdInputIndex = inputs.findIndex((input) => input?.key === modelIdKey);
      const modelIdInput = inputs[modelIdInputIndex];
      const systemModelInput = modelIdInput ?? legacyInput;
      if (
        !systemModelInput ||
        !isWorkflowSystemModelInput({ node: node as any, input: systemModelInput })
      ) {
        continue;
      }
      if (!isFeatureEnabled({ inputs, legacyKey })) continue;

      const requirement = {
        type:
          legacyKey === NodeInputKeyEnum.datasetSearchRerankModel
            ? ModelTypeEnum.rerank
            : ModelTypeEnum.llm
      };
      const isDynamicModelId =
        modelIdInput &&
        (getSelectedInputRenderType(modelIdInput) === FlowNodeInputTypeEnum.reference ||
          isDynamicModelReference(modelIdInput.value));
      if (isDynamicModelId) continue;

      const currentModelId = modelIdInput?.value;

      if (legacyInput) {
        const isReference =
          getSelectedInputRenderType(legacyInput) === FlowNodeInputTypeEnum.reference ||
          isDynamicModelReference(legacyInput.value);
        if (isReference) {
          if (!modelIdInput) {
            inputs.push({ ...legacyInput, key: modelIdKey });
            changed = true;
            nodeChanged = true;
          }
          continue;
        }
      }

      const modelId =
        catalog.resolveModelId({
          legacyModel: typeof legacyInput?.value === 'string' ? legacyInput.value : undefined,
          modelId: currentModelId,
          requirement
        }) ?? catalog.resolveFallbackModelId(requirement);
      if (!modelId) continue;
      if (modelIdInput) {
        if (String(modelIdInput.value) !== modelId) {
          inputs[modelIdInputIndex] = { ...modelIdInput, value: modelId };
          changed = true;
          nodeChanged = true;
        }
      } else {
        inputs.push({ ...legacyInput, key: modelIdKey, value: modelId });
        changed = true;
        nodeChanged = true;
      }
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
      const result = backfillFlatModelFields({
        record: datasetParams,
        catalog,
        mappings: [
          {
            legacy: 'rerankModel',
            modelId: 'rerankModelId',
            requirement: { type: ModelTypeEnum.rerank },
            copyDynamicReference: true,
            featureEnabled: Boolean(datasetParams[NodeInputKeyEnum.datasetSearchUsingReRank]),
            fallbackToDefault: true
          },
          {
            legacy: 'datasetSearchExtensionModel',
            modelId: 'datasetSearchExtensionModelId',
            requirement: { type: ModelTypeEnum.llm },
            copyDynamicReference: true,
            featureEnabled: Boolean(
              datasetParams[NodeInputKeyEnum.datasetSearchUsingExtensionQuery]
            ),
            fallbackToDefault: true
          }
        ]
      });
      errors.push(...(result.errors ?? []).map((error) => `Node ${nodeIndex}: ${error}`));
      if (result.set) {
        inputs[datasetParamsIndex] = {
          ...inputs[datasetParamsIndex],
          value: { ...datasetParams, ...result.set }
        };
        changed = true;
        nodeChanged = true;
      }
    }

    return nodeChanged
      ? {
          ...(node as any),
          ...(isLegacyUserGuide ? { flowNodeType: FlowNodeTypeEnum.emptyNode } : {}),
          inputs
        }
      : node;
  });

  /*
   * 这里只迁移模型引用，不能用当前工作流 Schema 校验整份历史快照。
   * 历史 App 可能仍包含已经废弃的节点或 IO 枚举；它们由各自的兼容逻辑负责，
   * 不应因为本次新增 modelId 而被误判成“模型引用迁移失败”。
   */
  return { nodes: nextNodes, changed, errors };
};

/** 合并同一文档的多个引用变更，使其只进行一次 CAS 写入。 */
export const mergeReferenceTransformResults = (
  results: ReferenceTransformResult[]
): ReferenceTransformResult => {
  const set = Object.assign({}, ...results.map((result) => result.set ?? {}));
  const snapshot = Object.assign({}, ...results.map((result) => result.snapshot ?? {}));
  return {
    set: Object.keys(set).length > 0 ? set : undefined,
    snapshot: Object.keys(snapshot).length > 0 ? snapshot : undefined,
    delete: results.some((result) => result.delete),
    errors: results.flatMap((result) => result.errors ?? [])
  };
};
