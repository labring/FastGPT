import {
  getWorkflowNodeModelInputs,
  isWorkflowModelExpression,
  isWorkflowModelSlotEnabled,
  isWorkflowSystemModelInput
} from '@fastgpt/global/common/workflow/model';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
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
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';

import {
  getSelectedInputRenderType,
  nodeInputIsReference
} from '@fastgpt/global/common/workflow/reference';
import {
  workflowDatasetParamModelSlots,
  workflowSystemModelSlots
} from '@fastgpt/global/core/workflow/model/constants';
import { getCachedSystemModelHandle } from '../../ai/model/catalog/cache';

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
  const systemHandle = getCachedSystemModelHandle();

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
    getValueList(value).forEach((item) => {
      const id = getEntityId(item, 'datasetId');
      if (id) addResource({ type: 'dataset', id });
      const nested = getObjectValue(item, 'datasets');
      if (nested) addDataset(nested);
    });
  };

  const addSkills = (value: unknown) => {
    getValueList(value).forEach((item) => {
      const id = getEntityId(item, 'skillId');
      if (id) addResource({ type: 'skill', id });
    });
  };

  /**
   * 优先提取 canonical `modelId`；当 `modelId` 未设置且存在旧 `model` 标识时，
   * 通过进程内系统模型目录映射为 `modelId`，保证未迁移草稿与系统工具静态资源能统一按 ID 校验。
   */
  const addModelReference = ({
    modelId,
    model,
    type
  }: {
    modelId?: unknown;
    model?: unknown;
    type: ModelTypeEnum;
  }) => {
    const canonicalId = getEntityId(modelId, 'modelId');
    if (canonicalId) {
      // 表达式尚未解析成真实模型 ID，不能固化为静态授权或在保存边界查目录。
      if (!isWorkflowModelExpression(canonicalId)) {
        addResource({ type: 'model', id: canonicalId });
      }
      return;
    }
    if (modelId !== undefined) return;
    const legacyModel = getStringValue(model);
    if (!legacyModel || isWorkflowModelExpression(legacyModel)) return;
    const resolvedId = systemHandle?.findModelData({ model: legacyModel }, { type })?.modelId;
    if (resolvedId) {
      addResource({ type: 'model', id: resolvedId });
    }
  };

  const addLLMSelectorReference = (value: unknown) => {
    const modelId = getEntityId(value, 'modelId');
    if (!modelId || isWorkflowModelExpression(modelId)) return;
    const resolvedId =
      systemHandle?.findModelData({ modelId })?.modelId ??
      systemHandle?.findModelData({ model: modelId }, { type: ModelTypeEnum.llm })?.modelId ??
      modelId;
    addResource({ type: 'model', id: resolvedId });
  };

  /** 从知识库搜索配置中提取已开启的模型 ID（rerankModelId / datasetSearchExtensionModelId）。 */
  const addDatasetParamsModels = (params: unknown) => {
    if (!isRecord(params)) return;
    if (!Array.isArray(params.datasets) || params.datasets.length === 0) return;
    for (const { featureKey, modelIdKey, legacyKey, type } of workflowDatasetParamModelSlots) {
      if (params[featureKey] === true) {
        addModelReference({
          modelId: params[modelIdKey],
          model: params[legacyKey],
          type
        });
      }
    }
  };

  nodes.forEach((node) => {
    if (node.flowNodeType === FlowNodeTypeEnum.appModule && node.pluginId) {
      addResource({ type: 'agent', id: node.pluginId });
    }
    if (node.flowNodeType === FlowNodeTypeEnum.pluginModule) addTool(node.pluginId);
    if (node.flowNodeType === FlowNodeTypeEnum.tool && node.pluginId) addTool(node.pluginId);
    if (node.flowNodeType === FlowNodeTypeEnum.toolSet && node.pluginId) {
      const mcpToolSet = node.toolConfig?.mcpToolSet;
      const httpToolSet = node.toolConfig?.httpToolSet;
      if (mcpToolSet) {
        if ('toolId' in mcpToolSet) addTool(mcpToolSet.toolId);
      } else if (httpToolSet) {
        if ('toolId' in httpToolSet) addTool(httpToolSet.toolId);
      } else {
        addTool(node.pluginId);
      }
    }
    const mcpTool = node.toolConfig?.mcpTool;
    if (mcpTool && 'toolId' in mcpTool) addTool(mcpTool.toolId);
    const httpTool = node.toolConfig?.httpTool;
    if (httpTool && 'toolId' in httpTool) addTool(httpTool.toolId);

    const inputs = node.inputs ?? [];
    for (const slot of workflowSystemModelSlots) {
      if (!isWorkflowModelSlotEnabled({ node, slot })) continue;
      const { modelIdInputs, legacyInputs } = getWorkflowNodeModelInputs({ node, slot });
      const fallbackLegacy =
        legacyInputs[0] && !nodeInputIsReference(legacyInputs[0])
          ? legacyInputs[0].value
          : undefined;
      (modelIdInputs.length > 0 ? modelIdInputs : legacyInputs).forEach((input) => {
        if (nodeInputIsReference(input)) return;
        addModelReference({
          modelId: input.key === slot.modelIdKey ? input.value : undefined,
          model: input.key === slot.legacyKey ? input.value : fallbackLegacy,
          type: slot.type
        });
      });
    }

    inputs.forEach((input) => {
      if (nodeInputIsReference(input)) return;
      if (
        getSelectedInputRenderType(input) === FlowNodeInputTypeEnum.selectLLMModel &&
        !isWorkflowSystemModelInput({ node, input })
      ) {
        addLLMSelectorReference(input.value ?? input.defaultValue);
      }
      if (input.key === NodeInputKeyEnum.skills) {
        addSkills(input.value);
      }
      if (input.key === NodeInputKeyEnum.datasetSelectList) {
        addDataset(input.value);
      }
      if (input.key === NodeInputKeyEnum.datasetParams) {
        addDataset(input.value);
        addDatasetParamsModels(input.value);
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
  });

  if (chatConfig?.questionGuide?.open === true) {
    addModelReference({
      modelId: chatConfig.questionGuide.modelId,
      model: chatConfig.questionGuide.model,
      type: ModelTypeEnum.llm
    });
  }
  if (chatConfig?.ttsConfig?.type === 'model') {
    addModelReference({
      modelId: chatConfig.ttsConfig.modelId,
      model: chatConfig.ttsConfig.model,
      type: ModelTypeEnum.tts
    });
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
