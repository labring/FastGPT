import { GET, POST } from '@/web/common/api/request';
import type { createHttpPluginBody } from '@/pages/api/core/app/httpPlugin/create';
import type { UpdateHttpPluginBody } from '@/pages/api/core/app/httpPlugin/update';
import type {
  FlowNodeTemplateType,
  NodeTemplateListItemType
} from '@fastgpt/global/core/workflow/type/node';
import { getMyApps } from '../api';
import type { ListAppBody } from '@/pages/api/core/app/list';
import { defaultNodeVersion, FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { FlowNodeTemplateTypeEnum } from '@fastgpt/global/core/workflow/constants';
import type { GetPreviewNodeQuery } from '@/pages/api/core/app/plugin/getPreviewNode';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import type {
  GetPathProps,
  ParentTreePathItemType
} from '@fastgpt/global/common/parentFolder/type';
import type { GetSystemPluginTemplatesBody } from '@/pages/api/core/app/plugin/getSystemPluginTemplates';
import type { PluginGroupSchemaType } from '@fastgpt/service/core/app/plugin/type';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { defaultGroup } from '@fastgpt/web/core/workflow/constants';
import { createMCPToolsBody } from '@/pages/api/core/app/mcpTools/create';
import { ToolType } from '@fastgpt/global/core/app/type';
import { getMCPToolsBody } from '@/pages/api/core/app/mcpTools/getMCPTools';
import { RunToolTestBody } from '@/pages/api/core/app/mcpTools/runTest';
import { updateMCPToolsBody } from '@/pages/api/core/app/mcpTools/update';

/* ============ team plugin ============== */
export const getTeamPlugTemplates = (data?: ListAppBody) =>
  getMyApps(data).then((res) =>
    res.map((app) => ({
      tmbId: app.tmbId,
      id: app._id,
      pluginId: app._id,
      isFolder:
        app.type === AppTypeEnum.folder ||
        app.type === AppTypeEnum.httpPlugin ||
        app.type === AppTypeEnum.toolSet,
      templateType: FlowNodeTemplateTypeEnum.teamApp,
      flowNodeType:
        app.type === AppTypeEnum.workflow
          ? FlowNodeTypeEnum.appModule
          : app.type === AppTypeEnum.toolSet
            ? FlowNodeTypeEnum.toolSet
            : FlowNodeTypeEnum.pluginModule,
      avatar: app.avatar,
      name: app.name,
      intro: app.intro,
      showStatus: false,
      version: app.pluginData?.nodeVersion || defaultNodeVersion,
      isTool: true,
      sourceMember: app.sourceMember
    }))
  );

/* ============ system plugin ============== */
export const getSystemPlugTemplates = (data: GetSystemPluginTemplatesBody) =>
  POST<NodeTemplateListItemType[]>('/core/app/plugin/getSystemPluginTemplates', data);

export const getPluginGroups = () => {
  return useSystemStore.getState()?.feConfigs?.isPlus
    ? GET<PluginGroupSchemaType[]>('/proApi/core/app/plugin/getPluginGroups')
    : Promise.resolve([defaultGroup]);
};

export const getSystemPluginPaths = (data: GetPathProps) => {
  if (!data.sourceId) return Promise.resolve<ParentTreePathItemType[]>([]);
  return GET<ParentTreePathItemType[]>('/core/app/plugin/path', data);
};

export const getPreviewPluginNode = (data: GetPreviewNodeQuery) =>
  GET<FlowNodeTemplateType>('/core/app/plugin/getPreviewNode', data);

/* ============ mcp tools ============== */
export const getMCPTools = (data: getMCPToolsBody) =>
  POST<ToolType[]>('/core/app/mcpTools/getMCPTools', data);

export const postCreateMCPTools = (data: createMCPToolsBody) =>
  POST('/core/app/mcpTools/create', data);

export const postUpdateMCPTools = (data: updateMCPToolsBody) =>
  POST('/core/app/mcpTools/update', data);

export const postRunMCPTools = (data: RunToolTestBody) => POST('/core/app/mcpTools/runTest', data);

/* ============ http plugin ============== */
export const postCreateHttpPlugin = (data: createHttpPluginBody) =>
  POST('/core/app/httpPlugin/create', data);

export const putUpdateHttpPlugin = (body: UpdateHttpPluginBody) =>
  POST('/core/app/httpPlugin/update', body);

export const getApiSchemaByUrl = (url: string) =>
  POST<Object>(
    '/core/app/httpPlugin/getApiSchemaByUrl',
    { url },
    {
      timeout: 30000
    }
  );
