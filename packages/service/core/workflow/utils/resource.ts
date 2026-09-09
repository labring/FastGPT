import type {
  AppResource,
  AppResourcesType,
  AppResourceType,
  AppSchemaType
} from '@fastgpt/global/core/app/type';
import type { DatasetSchemaType } from '@fastgpt/global/core/dataset/type';
import type { AgentSkillSchemaType } from '@fastgpt/global/core/ai/skill/type';
import { AgentSkillSourceEnum } from '@fastgpt/global/core/ai/skill/constants';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { UserError } from '@fastgpt/global/common/error/utils';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import {
  isWorkflowSystemModelInput,
  nodeInputIsReference
} from '@fastgpt/global/core/workflow/utils';
import { MongoApp } from '../../app/schema';
import { MongoDataset } from '../../dataset/schema';
import { MongoAgentSkills } from '../../ai/skill/model/schema';
import { authAppByTmbId } from '../../../support/permission/app/auth';
import { authDatasetByTmbId } from '../../../support/permission/dataset/auth';
import { mergeAppResources } from '../../app/resources';
import { checkAppResourceReadPermissions } from '../../../support/permission/app/resource';
import { getWorkflowResourceContext } from './context';
import {
  getAppPublishedWorkflowMap,
  type AppPublishedWorkflow
} from '../../app/version/controller';

export type WorkflowResourceContext = {
  teamId?: string;
  /** root Test/Debug 请求允许子工作流沿用跨团队资源权限。 */
  isRoot: boolean;
  resources: AppResourcesType;
  resourceMap: Map<string, AppResource>;
  appMap: Map<string, AppSchemaType>;
  workflowMap: Map<string, AppPublishedWorkflow>;
  datasetMap: Map<string, DatasetSchemaType>;
  skillMap: Map<string, AgentSkillSchemaType>;
};

/** 静态资源快照不一致错误；不能被工具加载器降级为单个工具不可用。 */
export class WorkflowResourceError extends UserError {}

export const isWorkflowResourceError = (error: unknown): error is WorkflowResourceError =>
  error instanceof WorkflowResourceError;

const getResourceKey = (type: AppResourceType, id: string) => `${type}:${id}`;

/** 按资源快照批量加载实体；root 调试请求跳过团队过滤，但仍校验实体存在。 */
export const loadWorkflowResourceContext = async ({
  resources,
  teamId,
  isRoot = false
}: {
  resources: AppResourcesType;
  teamId?: string;
  isRoot?: boolean;
}) => {
  const normalizedResources = mergeAppResources(Array.isArray(resources) ? resources : []);
  const resourceMap = new Map(
    normalizedResources.map((resource) => [getResourceKey(resource.type, resource.id), resource])
  );
  const appIds = normalizedResources
    .filter((resource) => resource.type === 'agent' || resource.type === 'tool')
    .map((resource) => resource.id);
  const datasetIds = normalizedResources
    .filter((resource) => resource.type === 'dataset')
    .map((resource) => resource.id);
  const skillIds = normalizedResources
    .filter((resource) => resource.type === 'skill')
    .map((resource) => resource.id);

  const [apps, datasets, skills] = await Promise.all([
    appIds.length
      ? MongoApp.find({
          _id: { $in: appIds },
          deleteTime: null,
          ...(teamId && !isRoot ? { teamId } : {})
        }).lean()
      : [],
    datasetIds.length
      ? MongoDataset.find({
          _id: { $in: datasetIds },
          deleteTime: null,
          ...(teamId && !isRoot ? { teamId } : {})
        }).lean()
      : [],
    skillIds.length
      ? MongoAgentSkills.find({
          _id: { $in: skillIds },
          deleteTime: null,
          ...(teamId && !isRoot
            ? {
                $or: [{ teamId }, { source: AgentSkillSourceEnum.system }]
              }
            : {})
        }).lean()
      : []
  ]);

  const appMap = new Map(apps.map((app) => [String(app._id), app]));
  const workflowMap = apps.length
    ? await getAppPublishedWorkflowMap(apps)
    : new Map<string, AppPublishedWorkflow>();
  const datasetMap = new Map(datasets.map((dataset) => [String(dataset._id), dataset]));
  const skillMap = new Map(skills.map((skill) => [String(skill._id), skill]));

  return {
    teamId,
    isRoot,
    appMap,
    workflowMap,
    datasetMap,
    skillMap,
    resources: normalizedResources,
    resourceMap
  } satisfies WorkflowResourceContext;
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

const getRuntimeModelId = (value: unknown): string | undefined => {
  const rawValue = (() => {
    if (typeof value === 'string' && value) return value;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    const record = value as Record<string, unknown>;
    if (typeof record.modelId === 'string' && record.modelId) return record.modelId;
    if (typeof record.model === 'string' && record.model) return record.model;
  })();
  if (!rawValue) return;

  return (
    global.systemModelMap?.get(`id:${rawValue}`)?.modelId ??
    global.systemModelMap?.get(`model:${rawValue}`)?.modelId ??
    rawValue
  );
};

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
    if (!context.datasetMap.has(id)) throw DatasetErrEnum.unExist;
  });
};

/** 读取当前资源上下文已批量加载的知识库实体。 */
export const getWorkflowDatasetResource = (datasetId: string) =>
  getWorkflowResourceContext()?.datasetMap.get(datasetId);

/** 读取当前资源上下文中 App 对应的正式工作流。 */
export const getWorkflowAppWorkflow = (appId: string) =>
  getWorkflowResourceContext()?.workflowMap?.get(appId);

/**
 * 读取工作流使用的知识库。
 * 静态引用必须命中当前 Version 快照；动态引用按运行人 tmbId 鉴权。
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
    const dataset = context.datasetMap.get(datasetId);
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
 * 静态引用命中当前 Version 快照；动态引用或没有 resourceContext 时按运行人读权限查询。
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
  const app = context.appMap.get(appId);
  if (!app) throw new WorkflowResourceError(`App resource is unavailable: ${type}:${appId}`);
  return app;
};

/** 为子 App 创建独立快照；父子 App 不共享资源声明，但继承 root 调试请求的跨团队权限。 */
export const createWorkflowChildResourceContext = (
  resources: AppResourcesType,
  teamId?: string,
  isRoot = getWorkflowResourceContext()?.isRoot ?? false
) => loadWorkflowResourceContext({ resources, teamId, isRoot });
