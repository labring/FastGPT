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
export const postImportPlugin = (data: CreateOnePluginParams[]) =>
  POST<string>('/core/plugin/import', data);
export const putUpdatePlugin = (data: UpdatePluginParams) => PUT('/core/plugin/update', data);
export const getPlugTemplates = () => GET<FlowNodeTemplateType[]>('/core/plugin/templates');
export const getUserPlugins = (data: { parentId?: string; type?: `${PluginTypeEnum}` }) =>
  GET<PluginListItemType[]>('/core/plugin/list', data);
export const getPluginPaths = (parentId?: string) =>
  GET<ParentTreePathItemType[]>('/core/plugin/paths', { parentId });
export const getSchema = (url: string) => GET<any>('/core/plugin/getSchema', { url });

/* work flow */
export const getTeamPlugTemplates = () =>
  GET<FlowNodeTemplateType[]>('/core/plugin/getTeamPluginTemplates');
export const getSystemPlugTemplates = () =>
  GET<FlowNodeTemplateType[]>('/core/plugin/getSystemPluginTemplates');

export const getPreviewPluginModule = (id: string) =>
  GET<FlowNodeTemplateType>('/core/plugin/getPreviewModule', { id });
export const getOnePlugin = (id: string) => GET<PluginItemSchema>('/core/plugin/detail', { id });
export const delOnePlugin = (id: string) => DELETE('/core/plugin/delete', { id });
