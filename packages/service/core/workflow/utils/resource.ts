import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { isModelConfigError } from '@fastgpt/global/common/error/model';
import { UserError } from '@fastgpt/global/common/error/utils';
import type { LLMModelDataType, RerankModelDataType } from '@fastgpt/global/core/ai/model/schema';
import type {
  AppChatConfigType,
  AppResource,
  AppResourcesType,
  AppResourceType,
  AppSchemaType
} from '@fastgpt/global/core/app/type';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { formatModels } from '@fastgpt/global/core/workflow/utils';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { authAppByTmbId } from '../../../support/permission/app/auth';
import { resolveAppResourcesByPermission } from '../../../support/permission/app/resource';
import { authDatasetByTmbId } from '../../../support/permission/dataset/auth';
import { assertAuthModels } from '../../../support/permission/model/auth';
import type { ModelHandle } from '../../ai/model/catalog/handle';
import { getTeamModelHandle } from '../../ai/model/catalog/service';
import {
  extractAppResources,
  getAppResourceKey,
  mergeAppResources,
  resolveSystemModelId
} from '../../app/resources';
import { MongoApp } from '../../app/schema';
import {
  getAppLatestVersion,
  getAppVersionById,
  type AppPublishedWorkflow
} from '../../app/version/controller';
import { MongoDataset } from '../../dataset/schema';
import { getWorkflowResourceContext } from './context';

export type WorkflowResourceContext = {
  teamId?: string;
  /** root Test/Debug 请求允许子工作流沿用跨团队资源权限。 */
  isRoot: boolean;
  resourceMap: Map<string, AppResource>;
};

/** 静态资源快照实体不可用错误；不能被工具加载器降级为单个工具不可用。 */
export class WorkflowResourceError extends UserError {}

export const isWorkflowResourceError = (error: unknown): error is WorkflowResourceError =>
  error instanceof WorkflowResourceError;

const getResourceKey = (type: AppResourceType, id: string) =>
  getAppResourceKey({ type, id } as AppResource);

/** 按资源快照初始化内存白名单字典；纯内存操作，不执行数据库查询。 */
export const createWorkflowResourceContext = ({
  resources,
  teamId,
  isRoot = false
}: {
  resources: AppResourcesType;
  teamId?: string;
  isRoot?: boolean;
}): WorkflowResourceContext => {
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

/**
 * 系统工具运行上下文：提取内部静态资源写入快照且不携带 teamId（命中快照的静态资源按 ID 直接读取，不限制团队），
 * 并继承父级 root 标记；未命中快照的资源回退到调用方运行人权限校验。
 */
export const createSystemToolResourceContext = ({
  nodes,
  chatConfig
}: {
  nodes?: Array<StoreNodeItemType | RuntimeNodeItemType>;
  chatConfig?: AppChatConfigType;
} = {}): WorkflowResourceContext => {
  const isRoot = getWorkflowResourceContext()?.isRoot ?? false;
  return createWorkflowResourceContext({
    resources: extractAppResources({ nodes, chatConfig }),
    isRoot
  });
};

/**
 * 判断指定资源是否命中当前工作流版本的静态资源快照。
 * 命中快照的资源直接使用应用发布时的授权；未命中（或无上下文）的资源回退到运行人权限鉴权。
 */
export const hasWorkflowResource = ({
  context,
  type,
  id,
  toolName
}: {
  context?: WorkflowResourceContext;
  type: AppResourceType;
  id: string;
  toolName?: string;
}): boolean => {
  if (!context) return false;

  const resource = context.resourceMap.get(getResourceKey(type, id));
  if (!resource) return false;

  if (resource.type === 'tool' && toolName && resource.data?.toolNames?.length) {
    return resource.data.toolNames.includes(toolName);
  }

  return true;
};

type LoadWorkflowModelBaseParams = {
  teamId: string;
  tmbId: string;
  modelId?: string;
  model?: string;
  modelHandle?: ModelHandle;
};

/**
 * 在节点执行点加载并校验模型资源。
 *
 * 1. 先通过 `ModelHandle` 的 typed getter 解析模型对象，保持缺失、停用、类型不符等 `ModelConfigError` 语义；
 * 2. 若 `modelId` 命中当前 `WorkflowResourceContext` 快照，直接放行；
 * 3. 未命中快照（或无上下文）时，回退到运行成员的 `use` 权限校验（`assertAuthModels`）；
 * 4. 仅含 legacy `model`（无 `modelId`）的历史节点仅在系统模型目录内解析，不做快照或成员 ACL 校验；
 * 5. `fallbackToDefault: true` 时（如知识库重排/问题优化辅助模型），仅对 `ModelConfigError` 回退系统默认模型，权限错误不降级。
 */
export async function loadWorkflowModelResource(
  params: LoadWorkflowModelBaseParams & { type?: 'llm'; fallbackToDefault?: false }
): Promise<LLMModelDataType>;
export async function loadWorkflowModelResource(
  params: LoadWorkflowModelBaseParams & { type?: 'llm'; fallbackToDefault: true }
): Promise<LLMModelDataType | undefined>;
export async function loadWorkflowModelResource(
  params: LoadWorkflowModelBaseParams & { type: 'rerank'; fallbackToDefault?: false }
): Promise<RerankModelDataType>;
export async function loadWorkflowModelResource(
  params: LoadWorkflowModelBaseParams & { type: 'rerank'; fallbackToDefault: true }
): Promise<RerankModelDataType | undefined>;
export async function loadWorkflowModelResource({
  teamId,
  tmbId,
  modelId,
  model,
  type = 'llm',
  fallbackToDefault = false,
  modelHandle
}: LoadWorkflowModelBaseParams & {
  type?: 'llm' | 'rerank';
  fallbackToDefault?: boolean;
}): Promise<LLMModelDataType | RerankModelDataType | undefined> {
  const handle = modelHandle ?? (await getTeamModelHandle({ teamId }));

  try {
    const modelData =
      type === 'rerank'
        ? handle.getRerankModelData({ modelId, model })
        : handle.getLLMModelData({ modelId, model });

    const id = resolveSystemModelId(modelId);
    if (id) {
      const context = getWorkflowResourceContext();
      if (!hasWorkflowResource({ context, type: 'model', id })) {
        await assertAuthModels({
          actor: { teamId, tmbId, isRoot: context?.isRoot ?? false },
          modelIds: [id],
          action: 'use',
          handle
        });
      }
    }

    return modelData;
  } catch (error) {
    if (!fallbackToDefault || !isModelConfigError(error)) {
      throw error;
    }

    try {
      return type === 'rerank'
        ? handle.getDefaultModelData('rerank')
        : handle.getDefaultModelData('llm');
    } catch (fallbackError) {
      if (!isModelConfigError(fallbackError)) {
        throw fallbackError;
      }
      return undefined;
    }
  }
}

/**
 * 过滤工具集子工具：
 * 命中快照且声明了 `toolNames` 时按子工具白名单裁剪；未命中快照（已通过运行人整包鉴权）或未限制子工具时返回完整工具集。
 */
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
    return tools;
  }

  const toolNames = resource.data?.toolNames;
  if (!toolNames?.length) return tools;

  const allowedNames = new Set(toolNames);
  return tools.filter((tool) => allowedNames.has(tool.name));
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
 * 命中当前 Version 快照的知识库直接实时查询数据库；未命中快照（或无 resourceContext）的知识库统一按运行人 tmbId 鉴权。
 */
export const loadWorkflowDatasetResource = async ({
  datasetId,
  datasetIds = [datasetId],
  tmbId
}: {
  datasetId: string;
  /** 工作流可能一次使用多个知识库，加载首个实体前需要完整校验未命中快照的知识库权限。 */
  datasetIds?: string[];
  tmbId?: string;
}) => {
  const context = getWorkflowResourceContext();
  const allDatasetIds = Array.from(new Set([datasetId, ...datasetIds]));
  const uncheckedDatasetIds = allDatasetIds.filter(
    (id) => !hasWorkflowResource({ context, type: 'dataset', id })
  );

  if (uncheckedDatasetIds.length > 0) {
    if (!tmbId) {
      return Promise.reject(DatasetErrEnum.unExist);
    }

    const authResults = await Promise.all(
      uncheckedDatasetIds.map(async (id) => ({
        id,
        dataset: (
          await authDatasetByTmbId({
            tmbId,
            datasetId: id,
            per: ReadPermissionVal
          })
        ).dataset
      }))
    );

    const matched = authResults.find((item) => item.id === datasetId);
    if (matched) return matched.dataset;
  }

  let dataset = null;
  try {
    dataset = await MongoDataset.findOne({
      _id: datasetId,
      deleteTime: null,
      ...(context?.teamId && !context.isRoot ? { teamId: context.teamId } : {})
    }).lean();
  } catch {
    throw DatasetErrEnum.unExist;
  }
  if (!dataset) throw DatasetErrEnum.unExist;
  return dataset;
};

/**
 * 加载 App 或工具集。
 * 命中当前 Version 快照时实时查询数据库；未命中快照或没有 resourceContext 时按运行人读权限查询。
 */
export const loadWorkflowAppResource = async ({
  appId,
  tmbId,
  type,
  toolName
}: {
  appId: string;
  tmbId: string;
  type: Extract<AppResourceType, 'agent' | 'tool'>;
  toolName?: string;
}) => {
  const context = getWorkflowResourceContext();
  if (!hasWorkflowResource({ context, type, id: appId, toolName })) {
    return (
      await authAppByTmbId({
        appId,
        tmbId,
        per: ReadPermissionVal
      })
    ).app;
  }

  let app = null;
  try {
    app = await MongoApp.findOne({
      _id: appId,
      deleteTime: null,
      ...(context?.teamId && !context.isRoot ? { teamId: context.teamId } : {})
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
) => createWorkflowResourceContext({ resources, teamId, isRoot });

/**
 * 加载子应用/插件工作流及其独立资源快照上下文。
 * 封装“校验应用 -> 加载版本 -> 初始化子快照上下文”流程。
 */
export const loadChildWorkflowWithResource = async ({
  appId,
  versionId,
  tmbId,
  type,
  toolName,
  teamId
}: {
  appId: string;
  versionId?: string;
  tmbId: string;
  type: Extract<AppResourceType, 'agent' | 'tool'>;
  toolName?: string;
  teamId?: string;
}) => {
  const appData = await loadWorkflowAppResource({
    appId,
    tmbId,
    type,
    toolName
  });
  const childVersion = await getAppVersionById({
    appId,
    versionId,
    app: appData
  });
  const resourceContext = createWorkflowChildResourceContext(
    childVersion.resources,
    teamId || String(appData.teamId)
  );

  return {
    appData,
    childVersion,
    resourceContext
  };
};

/**
 * 为工作流调试与测试（chatTest 与 debug）准备未发布工作流的资源上下文并校验权限。
 * 1. 规范化工作流模型引用与字段（formatModels）；
 * 2. 静态提取工作流节点与配置声明的资源快照（extractAppResources）；
 * 3. 按资源快照初始化白名单上下文（createWorkflowResourceContext）；
 * 4. 相对应用当前草稿快照基线校验新增资源读取权限（阻断未授权操作，root 请求保留跨团队权限）。
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
  teamId: string;
  tmbId: string;
  isRoot?: boolean;
}) => {
  const modelHandle = await getTeamModelHandle({ teamId });
  formatModels({
    nodes: nodes as StoreNodeItemType[] | undefined,
    chatConfig,
    models: modelHandle.getActiveModels(),
    defaultModelIds: modelHandle.getSystemDefaultModelIds(),
    modelReferencePolicy: 'preserve'
  });
  const extractedResources = extractAppResources({
    nodes,
    chatConfig
  });
  const resourceContext = createWorkflowResourceContext({
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
    allowRootCrossTeam: isRoot,
    modelHandle
  });
  return resourceContext;
};
