import { AppTypeEnum } from '@fastgpt/global/core/app/constants';

type ResolveDashboardAppListTypesParams = {
  pathname: string;
  type?: AppTypeEnum | 'all';
};

export type DashboardAppListScene = 'agent' | 'tool' | 'chat' | 'other';

const allAgentAppTypes = [
  AppTypeEnum.folder,
  AppTypeEnum.simple,
  AppTypeEnum.workflow,
  AppTypeEnum.chatAgent
];

const allToolAppTypes = [
  AppTypeEnum.toolFolder,
  AppTypeEnum.workflowTool,
  AppTypeEnum.mcpToolSet,
  AppTypeEnum.httpToolSet,
  AppTypeEnum.httpPlugin
];

/**
 * 从路由 pathname 判断当前列表场景。
 * Agent / Tool 只认最后一段，避免 `/dashboard/systemTool` 被当成 tool。
 * 聊天页可能有嵌套段，按 path 里是否出现 `chat` 判断。
 */
export const getDashboardAppListScene = (pathname: string): DashboardAppListScene => {
  const segments = pathname.split('/').filter(Boolean);
  const pageName = segments[segments.length - 1];
  if (pageName === 'agent') return 'agent';
  if (pageName === 'tool') return 'tool';
  if (segments.includes('chat')) return 'chat';
  return 'other';
};

/**
 * 根据 dashboard 当前页面和类型筛选，生成 `/core/app/list` 的类型过滤条件。
 *
 * `httpPlugin` 是旧版 HTTP 工具类型，工具页的“全部”和新版 HTTP 工具筛选都要带上它，
 * 否则历史团队升级后仍存在的旧版 HTTP 工具不会出现在 dashboard/tool 列表里。
 */
export const resolveDashboardAppListTypes = ({
  pathname,
  type
}: ResolveDashboardAppListTypesParams): AppTypeEnum[] => {
  const scene = getDashboardAppListScene(pathname);

  // 聊天页只展示可直接对话/运行的应用和工具。
  if (scene === 'chat') {
    return [
      AppTypeEnum.folder,
      AppTypeEnum.toolFolder,
      AppTypeEnum.chatAgent,
      AppTypeEnum.simple,
      AppTypeEnum.workflow,
      AppTypeEnum.workflowTool
    ];
  }

  // Agent 页保留原有 Agent 类型筛选行为。
  if (scene === 'agent') {
    return !type || type === 'all' ? allAgentAppTypes : [AppTypeEnum.folder, type];
  }

  // 工具页（以及未识别页面的旧兜底）需要兼容旧版工具类型。
  if (!type || type === 'all') {
    return allToolAppTypes;
  }

  if (type === AppTypeEnum.httpToolSet) {
    return [AppTypeEnum.toolFolder, AppTypeEnum.httpToolSet, AppTypeEnum.httpPlugin];
  }

  return [AppTypeEnum.toolFolder, type];
};
