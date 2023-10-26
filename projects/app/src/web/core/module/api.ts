import { GET, POST, DELETE, PUT } from '@/web/common/api/request';
import {
  CreateOneModuleParams,
  ModuleListItemType,
  UpdateNoduleParams
} from '@fastgpt/global/core/module/controller';
import { FlowModuleItemSchema } from '@fastgpt/global/core/module/type';

export const postCreateModule = (data: CreateOneModuleParams) =>
  POST<string>('/core/module/create', data);
export const putUpdateModule = (data: UpdateNoduleParams) => PUT('/core/module/update', data);
export const getUserModules = () => GET<ModuleListItemType[]>('/core/module/list');
export const getOneModule = (id: string) =>
  GET<FlowModuleItemSchema[]>('/core/module/detail', { id });
export const delOneModule = (id: string) => DELETE('/core/module/delete', { id });
