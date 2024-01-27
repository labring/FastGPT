import { GET, POST, DELETE, PUT } from '@/web/common/api/request';
import { FlowModuleTemplateType } from '@fastgpt/global/core/module/type';
import {
  CreateOneToolParams,
  ToolListItemType,
  UpdateOneToolParams
} from '@fastgpt/global/core/tool/controller';
import { ToolItemSchema } from '@fastgpt/global/core/tool/type';

export const postCreatePlugin = (data: CreateOneToolParams) =>
  POST<string>('/core/tool/create', data);
export const putUpdatePlugin = (data: UpdateOneToolParams) => PUT('/core/tool/update', data);
export const getUserPlugins = () => GET<ToolListItemType[]>('/core/tool/list');
export const getPlugTemplates = () => GET<FlowModuleTemplateType[]>('/core/tool/templates');
export const getPreviewPluginModule = (id: string) =>
  GET<FlowModuleTemplateType>('/core/tool/getPreviewModule', { id });
export const getOnePlugin = (id: string) => GET<ToolItemSchema>('/core/tool/detail', { id });
export const delOnePlugin = (id: string) => DELETE('/core/tool/delete', { id });
