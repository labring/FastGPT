import { AppTypeEnum } from '@fastgpt/global/core/app/constants';

type ResolveDashboardAppListTypesParams = {
  pathname: string;
  type?: AppTypeEnum | 'all';
};

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
 * 根据 dashboard 当前页面和类型筛选，生成 `/core/app/list` 的类型过滤条件。
 *
 * `httpPlugin` 是旧版 HTTP 工具类型，工具页的“全部”和新版 HTTP 工具筛选都要带上它，
 * 否则历史团队升级后仍存在的旧版 HTTP 工具不会出现在 dashboard/tool 列表里。
 */
export const resolveDashboardAppListTypes = ({
  pathname,
  type
}: ResolveDashboardAppListTypesParams): AppTypeEnum[] => {
  // 聊天页只展示可直接对话/运行的应用和工具。
  if (pathname.includes('/chat')) {
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
  if (pathname.includes('/agent')) {
    return !type || type === 'all' ? allAgentAppTypes : [AppTypeEnum.folder, type];
  }

  // 工具页需要兼容旧版工具类型。
  if (!type || type === 'all') {
    return allToolAppTypes;
  }

  if (type === AppTypeEnum.httpToolSet) {
    return [AppTypeEnum.toolFolder, AppTypeEnum.httpToolSet, AppTypeEnum.httpPlugin];
  }

  return [AppTypeEnum.toolFolder, type];
};
