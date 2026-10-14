import {
  AppResourcesSchema,
  type AppChatConfigType,
  type AppResource,
  type AppResourceType,
  type AppResourcesType
} from '@fastgpt/global/core/app/type';
import { AppToolSourceEnum } from '@fastgpt/global/core/app/tool/constants';
import { splitCombineToolId, splitToolsetToolPluginId } from '@fastgpt/global/core/app/tool/utils';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import {
  isValidReferenceValueFormat,
  isWorkflowDynamicModelInput,
  isWorkflowSystemModelInput,
  nodeInputIsReference,
  workflowDatasetParamModelSlots,
  workflowSystemModelSlots
} from '@fastgpt/global/core/workflow/utils';
import { getLogger, LogCategories } from '../../common/logger';

const resourceLogger = getLogger(LogCategories.MODULE.APP);

type WorkflowNodeModelReference = {
  value: unknown;
  dynamic: boolean;
};

const getValueList = (value: unknown) =>
  Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];

const getObjectValue = (value: unknown, key: string) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  return (value as Record<string, unknown>)[key];
};

const getStringValue = (value: unknown) => {
  if (typeof value === 'string' && value) return value;
  if (typeof value === 'number') return String(value);
  return;
};

/**
 * 提取节点/对话配置里的稳定模型标识（modelId）。
 */
export const resolveSystemModelId = (value: unknown) => {
  const rawValue = getStringValue(value) ?? getStringValue(getObjectValue(value, 'modelId'));
  if (!rawValue || /^\{\{.*\}\}$/.test(rawValue)) return;
  return rawValue;
};

const getEntityId = (value: unknown, specificKey?: string) =>
  getStringValue(value) ??
  (specificKey ? getStringValue(getObjectValue(value, specificKey)) : undefined) ??
  getStringValue(getObjectValue(value, 'id'));

/** 资源快照统一按 type + id 去重。 */
export const getAppResourceKey = (resource: AppResource) => `${resource.type}:${resource.id}`;

/** 判断资源快照是否声明了指定资源。 */
export const hasAppResource = ({
  resources,
  resource
}: {
  resources: AppResourcesType;
  resource: AppResource;
}) => {
  const key = getAppResourceKey(resource);
  return resources.some((item) => getAppResourceKey(item) === key);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** 从知识库搜索配置中提取已开启的模型 ID（rerankModelId / datasetSearchExtensionModelId）。 */
const extractDatasetModelsFromParams = (params: unknown): unknown[] => {
  if (!isRecord(params)) return [];
  if (!Array.isArray(params.datasets) || params.datasets.length === 0) return [];
  const models: unknown[] = [];
  for (const { featureKey, modelIdKey } of workflowDatasetParamModelSlots) {
    if (params[featureKey] === true) {
      models.push(params[modelIdKey]);
    }
  }
  return models;
};

/**
 * 统一从工作流节点提取生效的系统模型引用（供静态资源快照提取与运行时节点鉴权共用）。
 *
 * 1. 仅读取 canonical `*ModelId`（写入边界已由 formatModels 归一化，存量数据已由 4170 补齐）。
 * 2. 知识库检索相关模型（重排、问题优化、深度检索）统一受知识库列表与对应开关门控。
 * 3. 传入运行时 `params` 时同时返回静态与动态引用；未传入时仅提取静态输入值。
 */
export const extractWorkflowNodeModelReferences = ({
  node,
  params
}: {
  node: Pick<StoreNodeItemType | RuntimeNodeItemType, 'flowNodeType' | 'inputs'>;
  params?: Record<string, unknown>;
}): WorkflowNodeModelReference[] => {
  const references: WorkflowNodeModelReference[] = [];
  const inputs = node.inputs ?? [];

  const hasSelectedDataset = (() => {
    if (params) {
      const selectedDatasets = params[NodeInputKeyEnum.datasetSelectList];
      return Array.isArray(selectedDatasets) && selectedDatasets.length > 0;
    }
    const datasetSelectInput = inputs.find(
      (input) => input.key === NodeInputKeyEnum.datasetSelectList
    );
    return (
      !datasetSelectInput ||
      nodeInputIsReference(datasetSelectInput) ||
      getValueList(datasetSelectInput.value).length > 0
    );
  })();

  const isFeatureEnabled = (featureKey: NodeInputKeyEnum) => {
    if (params) return params[featureKey] === true;
    return inputs.some(
      (item) => item.key === featureKey && !nodeInputIsReference(item) && item.value === true
    );
  };

  for (const { modelIdKey, featureKey } of workflowSystemModelSlots) {
    if (featureKey && (!hasSelectedDataset || !isFeatureEnabled(featureKey))) continue;

    const matchedInputs = inputs.filter(
      (item) => item.key === modelIdKey && isWorkflowSystemModelInput({ node, input: item })
    );
    for (const input of matchedInputs) {
      const dynamic = isWorkflowDynamicModelInput(input);
      if (!params && dynamic) continue;

      // 静态输入的值固定在 input.value 上；仅动态输入才从运行时解析后的 params[input.key] 取值，
      // 避免同名重复输入下静态输入的 dynamic: false 与动态输入覆盖后的 params 值错配导致漏鉴权。
      const value = dynamic ? params?.[input.key] : input.value;
      if (value !== undefined && value !== null) {
        references.push({ value, dynamic });
      }
    }
  }

  const datasetParamsInput = inputs.find((input) => input.key === NodeInputKeyEnum.datasetParams);
  const datasetParamsDynamic = datasetParamsInput
    ? nodeInputIsReference(datasetParamsInput)
    : false;
  if (params ? node.flowNodeType === FlowNodeTypeEnum.agent : !datasetParamsDynamic) {
    const rawDatasetParams = params
      ? params[NodeInputKeyEnum.datasetParams]
      : datasetParamsInput?.value;
    extractDatasetModelsFromParams(rawDatasetParams).forEach((id) => {
      if (id !== undefined && id !== null) {
        references.push({ value: id, dynamic: datasetParamsDynamic });
      }
    });
  }

  return references;
};

/**
 * 从历史 `resourceRefs.skillIds` 取出有效 skill id。
 * 该字段在本次重构前已存在于 App / Version，4163 `$unset` 前读路径仍要 merge。
 */
export const getLegacySkillIds = (resourceRefs: unknown): string[] => {
  if (!isRecord(resourceRefs) || !Array.isArray(resourceRefs.skillIds)) return [];
  return resourceRefs.skillIds.filter(
    (id): id is string => typeof id === 'string' && id.length > 0
  );
};

const normalizeToolNames = (toolNames?: string[]) => {
  const names = Array.from(new Set(toolNames?.filter(Boolean) ?? [])).sort();
  return names.length ? names : undefined;
};

const normalizeAppResource = (resource: AppResource): AppResource => {
  if (resource.type !== 'tool') return resource;

  // MCP/HTTP 节点保存的是 child tool id，但权限主体是 toolset app。
  // 快照落库和读取都统一到 parent id，避免同一资源在差量比较时被拆成两条。
  const normalizedTool = resource.id.includes('/')
    ? normalizeAppToolResource(resource.id)
    : undefined;
  const toolNames = normalizeToolNames([
    ...(resource.data?.toolNames ?? []),
    ...(normalizedTool?.toolName ? [normalizedTool.toolName] : [])
  ]);
  return {
    type: 'tool',
    id: normalizedTool?.id ?? resource.id,
    ...(toolNames ? { data: { toolNames } } : {})
  };
};

/** 合并并稳定化资源快照，供提取器和迁移脚本共用。 */
export const mergeAppResources = (resources: AppResourcesType): AppResourcesType => {
  const resourceMap = new Map<string, AppResource>();

  resources.forEach((resource) => {
    const normalizedResource = normalizeAppResource(resource);
    const key = getAppResourceKey(normalizedResource);
    const current = resourceMap.get(key);
    if (!current) {
      resourceMap.set(key, normalizedResource);
      return;
    }

    if (normalizedResource.type !== 'tool' || current.type !== 'tool') return;
    if (!normalizedResource.data?.toolNames) {
      resourceMap.set(key, { type: 'tool', id: normalizedResource.id });
      return;
    }
    if (!current.data?.toolNames) return;

    resourceMap.set(key, {
      type: 'tool',
      id: normalizedResource.id,
      data: {
        toolNames: Array.from(
          new Set([...current.data.toolNames, ...normalizedResource.data.toolNames])
        ).sort()
      }
    });
  });

  return Array.from(resourceMap.values()).sort((a, b) => {
    const typeCompare = a.type.localeCompare(b.type);
    if (typeCompare) return typeCompare;

    const idCompare = a.id.localeCompare(b.id);
    if (idCompare) return idCompare;

    return 0;
  });
};

/** 判断节点是否通过工作流引用动态提供指定资源输入。 */
export const nodeHasDynamicInput = (
  node: Pick<StoreNodeItemType | RuntimeNodeItemType, 'inputs'> | undefined,
  keys: string[]
) =>
  node?.inputs?.some((input) => keys.includes(input.key) && nodeInputIsReference(input)) ?? false;

/** 将工作流中的完整工具 ID 转为应用资源权限主体。 */
export const normalizeAppToolResource = (toolId: unknown) => {
  const id = getStringValue(toolId);
  if (!id) return;

  try {
    const { source, pluginId, authAppId } = splitCombineToolId(id);
    if (
      source === AppToolSourceEnum.systemTool ||
      source === AppToolSourceEnum.commercial ||
      source === AppToolSourceEnum.community
    ) {
      return;
    }

    const parentId = authAppId ?? pluginId;
    if (!parentId) return;

    if (source === AppToolSourceEnum.mcp || source === AppToolSourceEnum.http) {
      const { parentId: parsedParentId, toolName } = splitToolsetToolPluginId(pluginId);
      return {
        id: parsedParentId || parentId,
        ...(toolName ? { toolName } : {})
      };
    }

    return { id: parentId };
  } catch {
    return;
  }
};

/** 从工作流节点和对话配置提取稳定、扁平的资源快照。 */
export const extractAppResources = ({
  nodes = [],
  chatConfig
}: {
  nodes?: Array<StoreNodeItemType | RuntimeNodeItemType>;
  chatConfig?: AppChatConfigType;
}): AppResourcesType => {
  const resources: AppResource[] = [];
  const addResource = (resource: AppResource) => resources.push(resource);

  const addTool = (toolId: unknown) => {
    const resource = normalizeAppToolResource(toolId);
    if (!resource) return;
    addResource({
      type: 'tool',
      id: resource.id,
      ...(resource.toolName ? { data: { toolNames: [resource.toolName] } } : {})
    });
  };

  const addDataset = (value: unknown) => {
    if (isValidReferenceValueFormat(value)) return;
    getValueList(value).forEach((item) => {
      if (isValidReferenceValueFormat(item)) return;
      const id = getEntityId(item, 'datasetId');
      if (id) addResource({ type: 'dataset', id });
      const nested = getObjectValue(item, 'datasets');
      if (nested && !isValidReferenceValueFormat(nested)) addDataset(nested);
    });
  };

  const addSkills = (value: unknown) => {
    getValueList(value).forEach((item) => {
      const id = getEntityId(item, 'skillId');
      if (id) addResource({ type: 'skill', id });
    });
  };

  const addModels = (value: unknown) => {
    getValueList(value).forEach((item) => {
      const id = resolveSystemModelId(item);
      if (id) addResource({ type: 'model', id });
    });
  };

  nodes.forEach((node) => {
    if (node.flowNodeType === FlowNodeTypeEnum.appModule && node.pluginId) {
      addResource({ type: 'agent', id: node.pluginId });
    }
    if (node.flowNodeType === FlowNodeTypeEnum.pluginModule) addTool(node.pluginId);
    if (
      (node.flowNodeType === FlowNodeTypeEnum.tool ||
        node.flowNodeType === FlowNodeTypeEnum.toolSet) &&
      node.pluginId
    ) {
      addTool(node.pluginId);
    }
    addTool(node.toolConfig?.mcpTool?.toolId);
    addTool(node.toolConfig?.httpTool?.toolId);

    node.inputs?.forEach((input) => {
      if (nodeInputIsReference(input)) return;
      if (input.key === NodeInputKeyEnum.skills) addSkills(input.value);
      if (
        input.key === NodeInputKeyEnum.datasetSelectList ||
        input.key === NodeInputKeyEnum.datasetParams
      ) {
        addDataset(input.value);
      }
      if (input.key === NodeInputKeyEnum.selectedTools) {
        getValueList(input.value).forEach((tool) => {
          const toolId = getObjectValue(tool, 'id') ?? getObjectValue(tool, 'toolId');
          addTool(toolId);
        });
      }
      if (input.key === NodeInputKeyEnum.runAppSelectApp) {
        const id = getEntityId(input.value, 'appId');
        if (id) addResource({ type: 'agent', id });
      }
    });

    extractWorkflowNodeModelReferences({ node }).forEach(({ value }) => {
      addModels(value);
    });
  });

  if (chatConfig?.questionGuide?.open === true) {
    addModels(chatConfig.questionGuide.modelId);
  }
  if (chatConfig?.ttsConfig?.type === 'model') {
    addModels(chatConfig.ttsConfig.modelId);
  }

  return mergeAppResources(resources);
};

/**
 * 解析一条 Version 上的 resources。
 * 数组（含空数组）视为已落库快照；缺字段则按 nodes 提取，并合并旧 resourceRefs.skillIds。
 */
export const resolveStoredAppResources = ({
  resources,
  nodes,
  chatConfig,
  resourceRefs
}: {
  resources?: unknown;
  nodes?: Array<StoreNodeItemType | RuntimeNodeItemType>;
  chatConfig?: AppChatConfigType;
  resourceRefs?: unknown;
}): AppResourcesType => {
  if (Array.isArray(resources)) {
    const parsed = AppResourcesSchema.safeParse(resources);
    if (parsed.success) return mergeAppResources(parsed.data);
    resourceLogger.warn('Invalid stored app resources, fallback to node extraction');
  }

  const extracted = extractAppResources({
    nodes: nodes ?? [],
    chatConfig
  });
  return mergeAppResources([
    ...extracted,
    ...getLegacySkillIds(resourceRefs).map((id) => ({ type: 'skill' as const, id }))
  ]);
};

/**
 * 相对上一版快照拆出无需重验的资源和新增 ACL 资源。
 * toolNames 随本次 extract 走，不单独作为权限增量。
 */
export const splitExtractedAppResources = ({
  extracted,
  baseline
}: {
  extracted: AppResourcesType;
  baseline: AppResourcesType;
}) => {
  const baselineKeys = new Set(baseline.map((resource) => getAppResourceKey(resource)));
  const kept: AppResourcesType = [];
  const added: AppResourcesType = [];

  extracted.forEach((resource) => {
    if (baselineKeys.has(getAppResourceKey(resource))) {
      kept.push(resource);
      return;
    }
    added.push(resource);
  });

  return { kept, added };
};

/** 构造资源反查条件，type 和 id 必须通过 elemMatch 命中同一条资源。 */
export const buildAppResourceMongoQuery = ({
  type,
  ids
}: {
  type: AppResourceType;
  ids: string | string[];
}) => {
  const list = Array.isArray(ids) ? ids : [ids];
  return {
    resources: {
      $elemMatch: {
        type,
        id: list.length === 1 ? list[0] : { $in: list }
      }
    }
  };
};
