import type {
  AppResource,
  AppResourceType,
  AppResourcesType,
  AppSchemaType
} from '@fastgpt/global/core/app/type';
import { AppToolSourceEnum } from '@fastgpt/global/core/app/tool/constants';
import { splitCombineToolId, splitToolsetToolPluginId } from '@fastgpt/global/core/app/tool/utils';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import { nodeInputIsReference } from '@fastgpt/global/core/workflow/utils';

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

const getModelMap = (modelType: AppResourceModelType) => {
  if (modelType === 'llm') return global.llmModelMap;
  if (modelType === 'rerank') return global.reRankModelMap;
  return global.ttsModelMap;
};

const getModelId = (value: unknown, modelType: AppResourceModelType) => {
  const rawValue = getStringValue(value) ?? getStringValue(getObjectValue(value, 'model'));
  if (!rawValue) return;
  return getModelMap(modelType)?.get(rawValue)?.model ?? rawValue;
};

const getAppResourceKey = (resource: AppResource) =>
  resource.type === 'model'
    ? `${resource.type}:${resource.data.modelType}:${resource.id}`
    : `${resource.type}:${resource.id}`;

const normalizeToolNames = (toolNames?: string[]) => {
  const names = Array.from(new Set(toolNames?.filter(Boolean) ?? [])).sort();
  return names.length ? names : undefined;
};

const normalizeAppResource = (resource: AppResource): AppResource => {
  if (resource.type !== 'tool') return resource;

  const toolNames = normalizeToolNames(resource.data?.toolNames);
  return {
    type: 'tool',
    id: resource.id,
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
  chatConfig?: AppSchemaType['chatConfig'];
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
