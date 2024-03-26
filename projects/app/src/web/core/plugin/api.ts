import { GET, POST, DELETE, PUT } from '@/web/common/api/request';
import { FlowNodeTemplateType } from '@fastgpt/global/core/module/type';
import { ParentTreePathItemType } from '@fastgpt/global/common/parentFolder/type';
import { PluginTypeEnum } from '@fastgpt/global/core/plugin/constants';
import {
  CreateOnePluginParams,
  PluginListItemType,
  UpdatePluginParams
} from '@fastgpt/global/core/plugin/controller';
import { PluginItemSchema } from '@fastgpt/global/core/plugin/type';

export const postCreatePlugin = (data: CreateOnePluginParams) =>
  POST<string>('/core/plugin/create', data);
export const putUpdatePlugin = (data: UpdatePluginParams) => PUT('/core/plugin/update', data);
export const getPluginPaths = (parentId?: string) =>
  GET<ParentTreePathItemType[]>('/core/plugin/paths', { parentId });

// http plugin
export const getApiSchemaByUrl = (url: string) =>
  POST<Object>(
    '/core/plugin/httpPlugin/getApiSchemaByUrl',
    { url },
    {
      timeout: 30000
    }
  );

/* work flow */
export const getPlugTemplates = () => GET<FlowNodeTemplateType[]>('/core/plugin/templates');
export const getUserPlugins = (data: { parentId?: string; type?: `${PluginTypeEnum}` }) =>
  GET<PluginListItemType[]>('/core/plugin/list', data);

export const getTeamPlugTemplates = (data: { parentId?: string | null; searchKey?: string }) =>
  GET<FlowNodeTemplateType[]>('/core/plugin/pluginTemplate/getTeamPluginTemplates', data);
export const getSystemPlugTemplates = () =>
  GET<FlowNodeTemplateType[]>('/core/plugin/pluginTemplate/getSystemPluginTemplates');

export const getPreviewPluginModule = (id: string) =>
  GET<FlowNodeTemplateType>('/core/plugin/getPreviewModule', { id });
export const getOnePlugin = (id: string) => GET<PluginItemSchema>('/core/plugin/detail', { id });
export const delOnePlugin = (pluginId: string) => DELETE('/core/plugin/delete', { pluginId });
