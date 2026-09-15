import type {
  AppChatConfigType,
  AppResource,
  AppResourcesType,
  AppResourceType,
  AppSchemaType
} from '@fastgpt/global/core/app/type';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { UserError } from '@fastgpt/global/common/error/utils';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import {
  isWorkflowSystemModelInput,
  nodeInputIsReference
} from '@fastgpt/global/core/workflow/utils';
import { MongoApp } from '../../app/schema';
import { MongoDataset } from '../../dataset/schema';
import { authAppByTmbId } from '../../../support/permission/app/auth';
import { authDatasetByTmbId } from '../../../support/permission/dataset/auth';
import {
  extractAppResources,
  getAppResourceKey,
  mergeAppResources,
  resolveSystemModelId
} from '../../app/resources';
import {
  checkAppResourceReadPermissions,
  resolveAppResourcesByPermission
} from '../../../support/permission/app/resource';
import { getWorkflowResourceContext } from './context';
import { getAppLatestVersion, type AppPublishedWorkflow } from '../../app/version/controller';

export type WorkflowResourceContext = {
  teamId?: string;
  /** root Test/Debug 请求允许子工作流沿用跨团队资源权限。 */
  isRoot: boolean;
  resourceMap: Map<string, AppResource>;
};

/** 静态资源快照不一致错误；不能被工具加载器降级为单个工具不可用。 */
export class WorkflowResourceError extends UserError {}

export const isWorkflowResourceError = (error: unknown): error is WorkflowResourceError =>
  error instanceof WorkflowResourceError;

const getResourceKey = (type: AppResourceType, id: string) =>
  getAppResourceKey({ type, id } as AppResource);

/** 按资源快照初始化内存白名单字典；纯内存操作，不执行数据库查询。 */
export const loadWorkflowResourceContext = async ({
  resources,
  teamId,
  isRoot = false
}: {
  resources: AppResourcesType;
  teamId?: string;
  isRoot?: boolean;
}): Promise<WorkflowResourceContext> => {
  const normalizedResources = mergeAppResources(Array.isArray(resources) ? resources : []);
  const resourceMap = new Map(
    normalizedResources.map((resource) => [getResourceKey(resource.type, resource.id), resource])
  );

  return {
    teamId,
    isRoot,
    resourceMap
  };
};

/** 校验当前工作流版本声明了指定资源；没有上下文时保留非 App 调试场景的旧权限语义。 */
export const assertWorkflowResource = ({
  context,
  type,
  id,
  toolName
}: {
  context?: WorkflowResourceContext;
  type: AppResourceType;
  id: string;
  toolName?: string;
}) => {
  if (!context) return;

  const resource = context.resourceMap.get(getResourceKey(type, id));
  if (!resource) throw new WorkflowResourceError(`App resource is not declared: ${type}:${id}`);

  if (resource.type === 'tool' && toolName && resource.data?.toolNames?.length) {
    if (!resource.data.toolNames.includes(toolName)) {
      throw new WorkflowResourceError(`App tool is not declared: ${id}/${toolName}`);
    }
  }
};

const modelFeatureKeyMap = new Map<string, NodeInputKeyEnum>([
  [NodeInputKeyEnum.datasetSearchRerankModelId, NodeInputKeyEnum.datasetSearchUsingReRank],
  [NodeInputKeyEnum.datasetSearchRerankModel, NodeInputKeyEnum.datasetSearchUsingReRank],
  [
    NodeInputKeyEnum.datasetSearchExtensionModelId,
    NodeInputKeyEnum.datasetSearchUsingExtensionQuery
  ],
  [NodeInputKeyEnum.datasetSearchExtensionModel, NodeInputKeyEnum.datasetSearchUsingExtensionQuery],
  [NodeInputKeyEnum.datasetDeepSearchModelId, NodeInputKeyEnum.datasetDeepSearch],
  [NodeInputKeyEnum.datasetDeepSearchModel, NodeInputKeyEnum.datasetDeepSearch]
]);

const getRuntimeModelId = (value: unknown): string | undefined => resolveSystemModelId(value);

/**
 * 在统一节点调度边界校验实际使用的模型资源。
 *
 * 静态输入只能使用当前 Version 快照声明的模型；引用输入和非 App 工作流按运行成员权限校验。
 * 这里只判断资源身份和授权来源，模型类型、启用状态仍由具体调用点的 typed getter 校验。
 */
export const assertWorkflowNodeModelResources = async ({
  node,
  params,
  tmbId
}: {
  node: Pick<RuntimeNodeItemType, 'flowNodeType' | 'inputs'>;
  params: Record<string, unknown>;
  tmbId: string;
}) => {
  const modelReferences: Array<{ id: string; dynamic: boolean }> = [];
  const addModel = (value: unknown, dynamic: boolean) => {
    const id = getRuntimeModelId(value);
    if (id) modelReferences.push({ id, dynamic });
  };

  node.inputs.forEach((input) => {
    if (!isWorkflowSystemModelInput({ node, input })) return;
    const featureKey = modelFeatureKeyMap.get(input.key);
    if (featureKey && params[featureKey] !== true) return;
    addModel(params[input.key], nodeInputIsReference(input));
  });

  const datasetParamsInput = node.inputs.find(
    (input) => input.key === NodeInputKeyEnum.datasetParams
  );
  const datasetParams = params[NodeInputKeyEnum.datasetParams];
  if (
    node.flowNodeType === FlowNodeTypeEnum.agent &&
    datasetParams &&
    typeof datasetParams === 'object' &&
    !Array.isArray(datasetParams)
  ) {
    const config = datasetParams as Record<string, unknown>;
    const dynamic = datasetParamsInput ? nodeInputIsReference(datasetParamsInput) : false;
    if (config[NodeInputKeyEnum.datasetSearchUsingReRank] === true) {
      addModel(
        config[NodeInputKeyEnum.datasetSearchRerankModelId] ??
          config[NodeInputKeyEnum.datasetSearchRerankModel],
        dynamic
      );
    }
    if (config[NodeInputKeyEnum.datasetSearchUsingExtensionQuery] === true) {
      addModel(
        config[NodeInputKeyEnum.datasetSearchExtensionModelId] ??
          config[NodeInputKeyEnum.datasetSearchExtensionModel],
        dynamic
      );
    }
  }

  const context = getWorkflowResourceContext();
  const permissionResources = new Map<string, AppResource>();
  modelReferences.forEach(({ id, dynamic }) => {
    if (context && !dynamic) {
      assertWorkflowResource({ context, type: 'model', id });
      return;
    }
    permissionResources.set(id, { type: 'model', id });
  });

  if (permissionResources.size > 0) {
    await checkAppResourceReadPermissions({
      resources: Array.from(permissionResources.values()),
      tmbId,
      isRoot: context?.isRoot,
      allowRootCrossTeam: context?.isRoot
    });
  }
};

/** 过滤工具集子工具；资源快照未限制子工具时返回完整工具集。 */
export const filterWorkflowToolList = <Tool extends { name: string }>({
  context,
  appId,
  tools
}: {
  context?: WorkflowResourceContext;
  appId: string;
  tools: Tool[];
}) => {
  if (!context) return tools;

  const resource = context.resourceMap.get(getResourceKey('tool', appId));
  if (!resource || resource.type !== 'tool') {
    throw new WorkflowResourceError(`App resource is not declared: tool:${appId}`);
  }

  const toolNames = resource.data?.toolNames;
  if (!toolNames?.length) return tools;

  const allowedNames = new Set(toolNames);
  return tools.filter((tool) => allowedNames.has(tool.name));
};

/**
 * 校验工作流本次使用的知识库集合是否属于当前版本快照。
 * 动态输入不走快照，由调用方按运行人 tmbId 鉴权。
 */
export const assertWorkflowDatasetResources = ({
  datasetIds,
  dynamic = false
}: {
  datasetIds: string[];
  dynamic?: boolean;
}) => {
  const context = getWorkflowResourceContext();
  if (!context || dynamic) return;

  datasetIds.forEach((id) => {
    assertWorkflowResource({
      context,
      type: 'dataset',
      id
    });
  });
};

/** 实时读取 App 对应的正式工作流（仅包含 nodes）；无上下文时返回 undefined。 */
export const loadWorkflowAppWorkflow = async (
  app: AppSchemaType
): Promise<AppPublishedWorkflow | undefined> => {
  const context = getWorkflowResourceContext();
  if (!context) return undefined;

  const latestVersion = await getAppLatestVersion(String(app._id), app);
  return { nodes: latestVersion.nodes ?? [] };
};

/**
 * 读取工作流使用的知识库。
 * 静态引用必须命中当前 Version 快照并实时查询数据库；动态引用按运行人 tmbId 鉴权。
 * 没有 resourceContext 时（Skill 调试、商业工具清空父快照）也按运行人鉴权，不能裸 findById。
 */
export const loadWorkflowDatasetResource = async ({
  datasetId,
  datasetIds = [datasetId],
  dynamic = false,
  tmbId
}: {
  datasetId: string;
  /** 静态工作流可能一次使用多个知识库，加载首个实体前需要完整校验声明集合。 */
  datasetIds?: string[];
  dynamic?: boolean;
  tmbId?: string;
}) => {
  const context = getWorkflowResourceContext();
  if (context && !dynamic) {
    assertWorkflowDatasetResources({ datasetIds });
    let dataset = null;
    try {
      dataset = await MongoDataset.findOne({
        _id: datasetId,
        deleteTime: null,
        ...(context.teamId && !context.isRoot ? { teamId: context.teamId } : {})
      }).lean();
    } catch {
      throw DatasetErrEnum.unExist;
    }
    if (!dataset) throw DatasetErrEnum.unExist;
    return dataset;
  }

  if (tmbId) {
    return (
      await authDatasetByTmbId({
        tmbId,
        datasetId,
        per: ReadPermissionVal
      })
    ).dataset;
  }

  return Promise.reject(DatasetErrEnum.unExist);
};

/**
 * 加载 App 或工具集。
 * 静态引用命中当前 Version 快照并实时查询数据库；动态引用或没有 resourceContext 时按运行人读权限查询。
 */
export const loadWorkflowAppResource = async ({
  appId,
  tmbId,
  type,
  toolName,
  dynamic = false
}: {
  appId: string;
  tmbId: string;
  type: Extract<AppResourceType, 'agent' | 'tool'>;
  toolName?: string;
  dynamic?: boolean;
}) => {
  const context = getWorkflowResourceContext();
  if (!context || dynamic) {
    return (
      await authAppByTmbId({
        appId,
        tmbId,
        per: ReadPermissionVal
      })
    ).app;
  }

  assertWorkflowResource({ context, type, id: appId, toolName });
  let app = null;
  try {
    app = await MongoApp.findOne({
      _id: appId,
      deleteTime: null,
      ...(context.teamId && !context.isRoot ? { teamId: context.teamId } : {})
    }).lean();
  } catch {
    throw new WorkflowResourceError(`App resource is unavailable: ${type}:${appId}`);
  }
  if (!app) throw new WorkflowResourceError(`App resource is unavailable: ${type}:${appId}`);
  return app;
};

/** 为子 App 创建独立快照；父子 App 不共享资源声明，但继承 root 调试请求的跨团队权限。 */
export const createWorkflowChildResourceContext = (
  resources: AppResourcesType,
  teamId?: string,
  isRoot = getWorkflowResourceContext()?.isRoot ?? false
) => loadWorkflowResourceContext({ resources, teamId, isRoot });

/**
 * 为工作流调试与测试（chatTest 与 debug）准备未发布工作流的资源上下文并校验权限。
 * 1. 静态提取工作流节点与配置声明的资源快照；
 * 2. 批量加载运行时所需的实体上下文（App, Dataset, Skill 等）；
 * 3. 相对应用当前草稿快照基线校验新增资源读取权限（阻断未授权操作，root 请求保留跨团队权限）。
 */
export const prepareWorkflowDebugResourceContext = async ({
  appId,
  nodes,
  chatConfig,
  teamId,
  tmbId,
  isRoot = false
}: {
  appId: string;
  nodes?: Array<StoreNodeItemType | RuntimeNodeItemType>;
  chatConfig?: AppChatConfigType;
  teamId?: string;
  tmbId: string;
  isRoot?: boolean;
}) => {
  const extractedResources = extractAppResources({ nodes, chatConfig });
  const resourceContext = await loadWorkflowResourceContext({
    resources: extractedResources,
    teamId,
    isRoot
  });
  await resolveAppResourcesByPermission({
    appId,
    extracted: extractedResources,
    tmbId,
    isRoot,
    blockOnUnauthorized: true,
    allowRootCrossTeam: isRoot
  });
  return resourceContext;
};
