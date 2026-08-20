import type {
  AppResource,
  AppResourcesType,
  AppResourceType,
  AppSchemaType
} from '@fastgpt/global/core/app/type';
import type { DatasetSchemaType } from '@fastgpt/global/core/dataset/type';
import type { AgentSkillSchemaType } from '@fastgpt/global/core/ai/skill/type';
import { AgentSkillSourceEnum } from '@fastgpt/global/core/ai/skill/constants';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';
import { UserError } from '@fastgpt/global/common/error/utils';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoApp } from '../../app/schema';
import { MongoDataset } from '../../dataset/schema';
import { MongoAgentSkills } from '../../ai/skill/model/schema';
import { authAppByTmbId } from '../../../support/permission/app/auth';
import { mergeAppResources } from '../../app/resources';
import { getWorkflowResourceContext } from './context';

export type WorkflowResourceContext = {
  teamId?: string;
  resources: AppResourcesType;
  resourceMap: Map<string, AppResource>;
  appMap: Map<string, AppSchemaType>;
  datasetMap: Map<string, DatasetSchemaType>;
  skillMap: Map<string, AgentSkillSchemaType>;
};

export type WorkflowResourceEntities = {
  apps: AppSchemaType[];
  datasets: DatasetSchemaType[];
  skills: AgentSkillSchemaType[];
};

/** 静态资源快照不一致错误；不能被工具加载器降级为单个工具不可用。 */
export class WorkflowResourceError extends UserError {}

export const isWorkflowResourceError = (error: unknown): error is WorkflowResourceError =>
  error instanceof WorkflowResourceError;

const getResourceKey = (type: AppResourceType, id: string, modelType?: string) =>
  type === 'model' ? `${type}:${modelType}:${id}` : `${type}:${id}`;

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
  if (!Array.isArray(resources)) throw new UserError('App resources are not migrated');

  const normalizedResources = mergeAppResources(resources);
  const resourceMap = new Map(
    normalizedResources.map((resource) => [
      getResourceKey(
        resource.type,
        resource.id,
        resource.type === 'model' ? resource.data.modelType : undefined
      ),
      resource
    ])
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
  const datasetMap = new Map(datasets.map((dataset) => [String(dataset._id), dataset]));
  const skillMap = new Map(skills.map((skill) => [String(skill._id), skill]));

  // 入口阶段一次性确认快照里的实体都还存在，避免先执行部分节点后才发现版本资源失效。
  normalizedResources.forEach((resource) => {
    if (resource.type === 'agent' || resource.type === 'tool') {
      if (!appMap.has(resource.id)) throw AppErrEnum.unExist;
    } else if (resource.type === 'dataset') {
      if (!datasetMap.has(resource.id)) throw DatasetErrEnum.unExist;
    } else if (resource.type === 'skill') {
      if (!skillMap.has(resource.id)) throw SkillErrEnum.unExist;
    }
  });

  return {
    teamId,
    appMap,
    datasetMap,
    skillMap,
    resources: normalizedResources,
    resourceMap
  } satisfies WorkflowResourceContext;
};

/** 将资源上下文转换为权限校验可复用的实体集合，避免重复查询资源实体。 */
export const getWorkflowResourceEntities = (
  context: WorkflowResourceContext
): WorkflowResourceEntities => ({
  apps: Array.from(context.appMap.values()),
  datasets: Array.from(context.datasetMap.values()),
  skills: Array.from(context.skillMap.values())
});

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

/** 校验工作流本次使用的知识库集合是否属于当前版本快照。 */
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

/** 读取工作流使用的知识库；静态引用复用快照，动态引用保留运行人权限查询。 */
export const loadWorkflowDatasetResource = async ({
  datasetId,
  dynamic = false,
  fields = 'vectorModel vlmModel'
}: {
  datasetId: string;
  dynamic?: boolean;
  fields?: string;
}) => {
  const context = getWorkflowResourceContext();
  if (context && !dynamic) {
    assertWorkflowResource({
      context,
      type: 'dataset',
      id: datasetId
    });
    const dataset = context.datasetMap.get(datasetId);
    if (!dataset) throw DatasetErrEnum.unExist;
    return dataset;
  }

  return MongoDataset.findById(datasetId, fields).lean();
};

/** 加载 App 或工具集，并将资源权限切换为当前 App Version 的快照。 */
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
  if (!app) throw AppErrEnum.unExist;
  return app;
};

/** 为子 App 创建独立快照；父子 App 不共享资源声明。 */
export const createWorkflowChildResourceContext = (resources: AppResourcesType, teamId?: string) =>
  loadWorkflowResourceContext({ resources, teamId });
