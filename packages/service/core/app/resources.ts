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
import { nodeInputIsReference } from '@fastgpt/global/core/workflow/utils';
import { getLogger, LogCategories } from '../../common/logger';

const resourceLogger = getLogger(LogCategories.MODULE.APP);

type AppResourceModelType = Extract<AppResource, { type: 'model' }>['data']['modelType'];

const modelInputTypes = new Map<string, AppResourceModelType>([
  [NodeInputKeyEnum.aiModel, 'llm'],
  [NodeInputKeyEnum.datasetSearchRerankModel, 'rerank'],
  [NodeInputKeyEnum.datasetSearchExtensionModel, 'llm'],
  [NodeInputKeyEnum.datasetDeepSearchModel, 'llm']
]);

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
 * 把节点/对话配置里的模型引用收成稳定标识。
 * 旧的分类型 model map 已并入 `systemModelMap`；解析失败时保留现场值，提取器只记录不鉴权。
 */
const getModelId = (value: unknown, modelType: AppResourceModelType) => {
  const rawValue =
    getStringValue(value) ??
    getStringValue(getObjectValue(value, 'modelId')) ??
    getStringValue(getObjectValue(value, 'model'));
  if (!rawValue) return;

  const resolved =
    global.systemModelMap?.get(`id:${rawValue}`) ?? global.systemModelMap?.get(`model:${rawValue}`);
  if (resolved && resolved.type === modelType) return resolved.model;
  return rawValue;
};

/** 资源去重键；模型额外包含 modelType，避免同名模型冲突。 */
export const getAppResourceKey = (resource: AppResource) =>
  resource.type === 'model'
    ? `${resource.type}:${resource.data.modelType}:${resource.id}`
    : `${resource.type}:${resource.id}`;

const isAclAppResource = (resource: AppResource) =>
  resource.type === 'agent' ||
  resource.type === 'tool' ||
  resource.type === 'dataset' ||
  resource.type === 'skill';

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

    if (a.type === 'model' && b.type === 'model') {
      return a.data.modelType.localeCompare(b.data.modelType);
    }

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
    getValueList(value).forEach((item) => {
      const id =
        getStringValue(item) ??
        getStringValue(getObjectValue(item, 'datasetId')) ??
        getStringValue(getObjectValue(item, 'id'));
      if (id) addResource({ type: 'dataset', id });
      const nested = getObjectValue(item, 'datasets');
      if (nested) addDataset(nested);
    });
  };

  const addSkills = (value: unknown) => {
    getValueList(value).forEach((item) => {
      const id =
        getStringValue(item) ??
        getStringValue(getObjectValue(item, 'skillId')) ??
        getStringValue(getObjectValue(item, 'id'));
      if (id) addResource({ type: 'skill', id });
    });
  };

  const addModels = (value: unknown, modelType: AppResourceModelType) => {
    getValueList(value).forEach((item) => {
      const id = getModelId(item, modelType);
      if (id) addResource({ type: 'model', id, data: { modelType } });
    });
  };

  nodes.forEach((node) => {
    const isStaticInputEnabled = (key: string) =>
      node.inputs?.some(
        (item) => item.key === key && !nodeInputIsReference(item) && item.value === true
      ) ?? false;

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
        const id =
          getStringValue(getObjectValue(input.value, 'appId')) ??
          getStringValue(getObjectValue(input.value, 'id')) ??
          getStringValue(input.value);
        if (id) addResource({ type: 'agent', id });
      }
      const modelType = modelInputTypes.get(input.key);
      const enabled =
        input.key === NodeInputKeyEnum.datasetSearchRerankModel
          ? isStaticInputEnabled(NodeInputKeyEnum.datasetSearchUsingReRank)
          : input.key === NodeInputKeyEnum.datasetSearchExtensionModel
            ? isStaticInputEnabled(NodeInputKeyEnum.datasetSearchUsingExtensionQuery)
            : input.key === NodeInputKeyEnum.datasetDeepSearchModel
              ? isStaticInputEnabled(NodeInputKeyEnum.datasetDeepSearch)
              : true;
      if (modelType && enabled) addModels(input.value, modelType);
    });
  });

  if (chatConfig?.questionGuide?.open) addModels(chatConfig.questionGuide.model, 'llm');
  if (chatConfig?.ttsConfig?.type === 'model') addModels(chatConfig.ttsConfig.model, 'tts');

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
  const baselineKeys = new Set(
    baseline.filter(isAclAppResource).map((resource) => getAppResourceKey(resource))
  );
  const kept: AppResourcesType = [];
  const added: AppResourcesType = [];

  extracted.forEach((resource) => {
    if (!isAclAppResource(resource) || baselineKeys.has(getAppResourceKey(resource))) {
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
