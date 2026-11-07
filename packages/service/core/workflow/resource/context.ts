import type {
  WorkflowResourceContext,
  RuntimeNodeItemType
} from '@fastgpt/global/core/workflow/runtime/type';
import type {
  AppResourceType,
  AppResourcesType,
  AppChatConfigType
} from '@fastgpt/global/core/app/type';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import {
  extractAppResources,
  getAppResourceKey,
  mergeAppResources
} from '../../app/resource/utils';
import { getWorkflowResourceContext } from '../utils/context';

/** 按资源快照初始化内存白名单字典；纯内存操作，不执行数据库查询。 */
export const createWorkflowResourceContext = ({
  resources,
  teamId,
  isRoot = getWorkflowResourceContext()?.isRoot ?? false
}: {
  resources: AppResourcesType;
  teamId?: string;
  isRoot?: boolean;
}): WorkflowResourceContext => {
  const normalizedResources = mergeAppResources(resources);
  const resourceMap = new Map(
    normalizedResources.map((resource) => [getAppResourceKey(resource), resource])
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
} = {}): WorkflowResourceContext =>
  createWorkflowResourceContext({
    resources: extractAppResources({ nodes, chatConfig })
  });

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

  const resource = context.resourceMap.get(getAppResourceKey({ type, id }));
  if (!resource) return false;

  if (resource.type === 'tool' && toolName && resource.data?.toolNames?.length) {
    return resource.data.toolNames.includes(toolName);
  }

  return true;
};

/**
 * 过滤工具集子工具：
 * 只用于展开整个工具集：快照声明了 `toolNames` 时仅展开这些子工具。
 * 单个子工具在 loadWorkflowAppResource 中已按 toolName 授权，读取和执行时不再裁剪列表。
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

  const resource = context.resourceMap.get(getAppResourceKey({ type: 'tool', id: appId }));
  if (!resource || resource.type !== 'tool') {
    return tools;
  }

  const toolNames = resource.data?.toolNames;
  if (!toolNames?.length) return tools;

  const allowedNames = new Set(toolNames);
  return tools.filter((tool) => allowedNames.has(tool.name));
};
