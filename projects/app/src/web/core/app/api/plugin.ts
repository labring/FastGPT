import { DELETE, GET, POST } from '@/web/common/api/request';
import type { createHttpPluginBody } from '@/pages/api/core/app/httpPlugin/create';
import type { UpdateHttpPluginBody } from '@/pages/api/core/app/httpPlugin/update';
import { FlowNodeTemplateType } from '@fastgpt/global/core/workflow/type';
import { getMyApps } from '../api';
import type { ListAppBody } from '@/pages/api/core/app/list';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { FlowNodeTemplateTypeEnum } from '@fastgpt/global/core/workflow/constants';
import type { GetPreviewNodeQuery } from '@/pages/api/core/app/plugin/getPreviewNode';

/* ============ team plugin ============== */
export const getTeamPlugTemplates = (data?: ListAppBody) =>
  getMyApps(data).then((res) =>
    res.map<FlowNodeTemplateType>((app) => ({
      id: app._id,
      pluginId: app._id,
      pluginType: app.type,
      templateType: FlowNodeTemplateTypeEnum.personalPlugin,
      flowNodeType: FlowNodeTypeEnum.pluginModule,
      avatar: app.avatar,
      name: app.name,
      intro: app.intro,
      showStatus: false,
      version: app.pluginData?.nodeVersion || '481',
      inputs: [],
      outputs: []
    }))
  );

export const getSystemPlugTemplates = () =>
  GET<FlowNodeTemplateType[]>('/core/app/plugin/getSystemPluginTemplates');

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
