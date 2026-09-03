import { GET, POST } from '@/web/common/api/request';
import type {
  FlowNodeTemplateType,
  NodeTemplateListItemType
} from '@fastgpt/global/core/workflow/type/node';
import type { PaginationResponseType } from '@fastgpt/global/openapi/api';
import type {
  ListAppV2BodyType,
  ListAppV2ResponseType
} from '@fastgpt/global/openapi/core/app/common/api';
import { getAllApps, getAppDetailById, getMyAppsV2 } from '../api';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { FlowNodeTemplateTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import type {
  ParentIdType,
  ParentTreePathItemType
} from '@fastgpt/global/common/parentFolder/type';
import { AppToolSourceEnum } from '@fastgpt/global/core/app/tool/constants';
import { getMcpChildren } from './mcpTools';
import type {
  GetPreviewNodeQuery,
  GetSystemToolTemplatesBodyType,
  GetToolPathQueryType
} from '@fastgpt/global/openapi/core/app/tool/api';

type TeamAppTemplatesV2Query = Omit<ListAppV2BodyType, 'type'> & {
  type?: AppTypeEnum[];
};

type AppListItem = ListAppV2ResponseType['list'][number];

const mapAppToTeamTemplate = (app: AppListItem) => ({
  tmbId: app.tmbId,
  id: app._id,
  pluginId: app._id,
  isFolder:
    app.type === AppTypeEnum.folder ||
    app.type === AppTypeEnum.toolFolder ||
    app.type === AppTypeEnum.httpToolSet ||
    app.type === AppTypeEnum.httpPlugin ||
    app.type === AppTypeEnum.mcpToolSet,
  templateType: FlowNodeTemplateTypeEnum.teamApp,
  flowNodeType:
    app.type === AppTypeEnum.workflow
      ? FlowNodeTypeEnum.appModule
      : app.type === AppTypeEnum.mcpToolSet || app.type === AppTypeEnum.httpToolSet
        ? FlowNodeTypeEnum.toolSet
        : FlowNodeTypeEnum.pluginModule,
  avatar: app.avatar,
  name: app.name,
  intro: app.intro,
  showStatus: false,
  version: app.pluginData?.nodeVersion,
  isTool: true,
  sourceMember: app.sourceMember,
  appType: app.type
});

/* ============ team plugin ============== */
export const getTeamAppTemplates = async (data?: {
  parentId?: ParentIdType;
  searchKey?: string;
  type?: AppTypeEnum[];
}) => {
  if (data?.parentId) {
    // handle get mcptools
    const app = await getAppDetailById(data.parentId);
    if (app.type === AppTypeEnum.mcpToolSet) {
      const children = await getMcpChildren({ id: data.parentId, searchKey: data.searchKey });
      return children.map((item) => ({
        ...item,
        intro: item.description || '',
        flowNodeType: FlowNodeTypeEnum.tool,
        templateType: FlowNodeTemplateTypeEnum.teamApp,
        appType: app.type,
        isTool: true,
        isFolder: false
      }));
      // handle http toolset
    } else if (app.type === AppTypeEnum.httpToolSet) {
      const toolList = app.modules[0]?.toolConfig?.httpToolSet?.toolList;
      if (!toolList) return [];
      return toolList.map((item) => ({
        id: `${AppToolSourceEnum.http}-${app._id}/${item.name}`,
        avatar: app.avatar,
        name: item.name,
        intro: item.description || '',
        flowNodeType: FlowNodeTypeEnum.tool,
        templateType: FlowNodeTemplateTypeEnum.teamApp,
        appType: app.type,
        isTool: true,
        isFolder: false
      }));
    }
  }
  return getAllApps(data).then((res) =>
    res.map((app) => ({
      tmbId: app.tmbId,
      id: app._id,
      pluginId: app._id,
      isFolder:
        app.type === AppTypeEnum.folder ||
        app.type === AppTypeEnum.toolFolder ||
        app.type === AppTypeEnum.httpToolSet ||
        app.type === AppTypeEnum.httpPlugin ||
        app.type === AppTypeEnum.mcpToolSet,
      templateType: FlowNodeTemplateTypeEnum.teamApp,
      flowNodeType:
        app.type === AppTypeEnum.workflow
          ? FlowNodeTypeEnum.appModule
          : app.type === AppTypeEnum.mcpToolSet || app.type === AppTypeEnum.httpToolSet
            ? FlowNodeTypeEnum.toolSet
            : FlowNodeTypeEnum.pluginModule,
      avatar: app.avatar,
      name: app.name,
      intro: app.intro,
      showStatus: false,
      version: app.pluginData?.nodeVersion,
      isTool: true,
      sourceMember: app.sourceMember,
      appType: app.type
    }))
  );
};

/** Load one paginated team app template page while preserving toolset child behavior. */
export const getTeamAppTemplatesV2 = async (
  data: TeamAppTemplatesV2Query
): Promise<PaginationResponseType<NodeTemplateListItemType>> => {
  const { parentId, searchKey, type, excludeAppId, ...pagination } = data;

  if (parentId) {
    const parent = await getAppDetailById(parentId);
    if (parent.type === AppTypeEnum.mcpToolSet || parent.type === AppTypeEnum.httpToolSet) {
      const list = await getTeamAppTemplates({ parentId, searchKey, type });
      return {
        list,
        total: list.length
      };
    }
  }

  const response = await getMyAppsV2({
    ...pagination,
    parentId,
    searchKey,
    type,
    excludeAppId
  });

  return {
    list: response.list.map(mapAppToTeamTemplate),
    total: response.total
  };
};

/* ============ Tool ============== */
export const getAppToolTemplates = (data: GetSystemToolTemplatesBodyType) =>
  POST<NodeTemplateListItemType[]>('/core/app/tool/getSystemToolTemplates', data);

export const getAppToolPaths = (data: GetToolPathQueryType) => {
  if (!data.sourceId) return Promise.resolve<ParentTreePathItemType[]>([]);
  return GET<ParentTreePathItemType[]>('/core/app/tool/path', data);
};

export const getClientToolPreviewNode = (data: GetPreviewNodeQuery) =>
  GET<FlowNodeTemplateType>('/core/app/tool/getPreviewNode', data);
