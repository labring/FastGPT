import { GET, POST, DELETE, PUT } from '@/web/common/api/request';
import { FlowModuleTemplateType } from '@fastgpt/global/core/module/type';
import {
  CreateOnePluginParams,
  PluginListItemType,
  UpdatePluginParams
} from '@fastgpt/global/core/plugin/controller';
import { PluginItemSchema } from '@fastgpt/global/core/plugin/type';

export const postCreatePlugin = (data: CreateOnePluginParams) =>
  POST<string>('/core/plugin/create', data);
export const putUpdatePlugin = (data: UpdatePluginParams) => PUT('/core/plugin/update', data);
export const getUserPlugins = () => GET<PluginListItemType[]>('/core/plugin/list');
export const getUserPlugs2ModuleTemplates = () =>
  GET<FlowModuleTemplateType[]>('/core/plugin/templateList');
export const getPluginModuleDetail = (id: string) =>
  GET<FlowModuleTemplateType>('/core/plugin/moduleDetail', { id });
export const getOnePlugin = (id: string) => GET<PluginItemSchema>('/core/plugin/detail', { id });
export const delOnePlugin = (id: string) => DELETE('/core/plugin/delete', { id });
