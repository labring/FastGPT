import { GET, POST, DELETE, PUT } from '@/web/common/api/request';
import type { createHttpToolsBody } from '@/pages/api/core/app/httpTools/create';
import type { UpdateHttpPluginBody } from '@/pages/api/core/app/httpTools/update';
import type {
  FlowNodeTemplateType,
  NodeTemplateListItemType
} from '@fastgpt/global/core/workflow/type/node';
import { getAppDetailById, getMyApps } from '../api';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { FlowNodeTemplateTypeEnum } from '@fastgpt/global/core/workflow/constants';
import type { GetPreviewNodeQuery } from '@/pages/api/core/app/tool/getPreviewNode';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import type {
  GetPathProps,
  ParentIdType,
  ParentTreePathItemType
} from '@fastgpt/global/common/parentFolder/type';
import type { GetSystemPluginTemplatesBody } from '@/pages/api/core/app/tool/getSystemToolTemplates';
import type { createMCPToolsBody } from '@/pages/api/core/app/mcpTools/create';
import type { McpToolConfigType } from '@fastgpt/global/core/app/tool/mcpTool/type';
import type { updateMCPToolsBody } from '@/pages/api/core/app/mcpTools/update';
import type { RunMCPToolBody } from '@/pages/api/support/mcp/client/runTool';
import type { getMCPToolsBody } from '@/pages/api/support/mcp/client/getTools';
import type {
  getToolVersionListProps,
  getToolVersionResponse
} from '@/pages/api/core/app/tool/getVersionList';
import type {
  McpGetChildrenmQuery,
  McpGetChildrenmResponse
} from '@/pages/api/core/app/mcpTools/getChildren';
import { AppToolSourceEnum } from '@fastgpt/global/core/app/tool/constants';
import type { RunHTTPToolBody, RunHTTPToolResponse } from '@/pages/api/core/app/httpTools/runTool';

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
        isFolder: false
      }));
    }
  }
  return getMyApps(data).then((res) =>
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

/* ============ Tool ============== */
export const getAppToolTemplates = (data: GetSystemPluginTemplatesBody) =>
  POST<NodeTemplateListItemType[]>('/core/app/tool/getSystemToolTemplates', data);

export const getAppToolPaths = (data: GetPathProps) => {
  if (!data.sourceId) return Promise.resolve<ParentTreePathItemType[]>([]);
  return GET<ParentTreePathItemType[]>('/core/app/tool/path', data);
};

export const getToolPreviewNode = (data: GetPreviewNodeQuery) =>
  GET<FlowNodeTemplateType>('/core/app/tool/getPreviewNode', data);

export const getToolVersionList = (data: getToolVersionListProps) =>
  POST<getToolVersionResponse>('/core/app/tool/getVersionList', data);

/* ============ mcp tools ============== */
export const postCreateMCPTools = (data: createMCPToolsBody) =>
  POST<string>('/core/app/mcpTools/create', data);

export const postUpdateMCPTools = (data: updateMCPToolsBody) =>
  POST('/core/app/mcpTools/update', data);

export const getMCPTools = (data: getMCPToolsBody) =>
  POST<McpToolConfigType[]>('/support/mcp/client/getTools', data);

export const postRunMCPTool = (data: RunMCPToolBody) =>
  POST('/support/mcp/client/runTool', data, { timeout: 300000 });

export const getMcpChildren = (data: McpGetChildrenmQuery) =>
  GET<McpGetChildrenmResponse>('/core/app/mcpTools/getChildren', data);

/* ============ http tools ============== */
export const getApiSchemaByUrl = (url: string) =>
  POST<Object>(
    '/core/app/httpTools/getApiSchemaByUrl',
    { url },
    {
      timeout: 30000
    }
  );

export const postCreateHttpTools = (data: createHttpToolsBody) =>
  POST<string>('/core/app/httpTools/create', data);

export const putUpdateHttpPlugin = (data: UpdateHttpPluginBody) =>
  POST('/core/app/httpTools/update', data);

export const postRunHTTPTool = (data: RunHTTPToolBody) =>
  POST<RunHTTPToolResponse>('/core/app/httpTools/runTool', data);
