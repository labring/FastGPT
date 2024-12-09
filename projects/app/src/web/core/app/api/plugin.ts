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
import { ParentIdType, ParentTreePathItemType } from '@fastgpt/global/common/parentFolder/type';
import { GetSystemPluginTemplatesBody } from '@/pages/api/core/app/plugin/getSystemPluginTemplates';
import { PluginGroupSchemaType } from '@fastgpt/service/core/app/plugin/type';

/* ============ team plugin ============== */
export const getTeamPlugTemplates = (data?: ListAppBody) =>
  getMyApps(data).then((res) =>
    res.map((app) => ({
      tmbId: app.tmbId,
      id: app._id,
      pluginId: app._id,
      isFolder: app.type === AppTypeEnum.folder || app.type === AppTypeEnum.httpPlugin,
      templateType: FlowNodeTemplateTypeEnum.teamApp,
      flowNodeType:
        app.type === AppTypeEnum.workflow
          ? FlowNodeTypeEnum.appModule
          : FlowNodeTypeEnum.pluginModule,
      avatar: app.avatar,
      name: app.name,
      intro: app.intro,
      showStatus: false,
      version: app.pluginData?.nodeVersion || defaultNodeVersion,
      isTool: true
    }))
  );

/* ============ system plugin ============== */
export const getSystemPlugTemplates = (data: GetSystemPluginTemplatesBody) =>
  POST<NodeTemplateListItemType[]>('/core/app/plugin/getSystemPluginTemplates', data);

export const getPluginGroups = () =>
  GET<PluginGroupSchemaType[]>('/core/app/plugin/getPluginGroups');

export const getSystemPluginPaths = (parentId: ParentIdType) => {
  if (!parentId) return Promise.resolve<ParentTreePathItemType[]>([]);
  return GET<ParentTreePathItemType[]>('/core/app/plugin/path', { parentId });
};

export const getPreviewPluginNode = (data: GetPreviewNodeQuery) =>
  GET<FlowNodeTemplateType>('/core/app/plugin/getPreviewNode', data);

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
