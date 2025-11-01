import { GET, PUT, POST, DELETE } from '@/web/common/api/request';
import type {
  GetAdminSystemToolsQueryType,
  GetAdminSystemToolsResponseType,
  UpdateToolOrderBodyType,
  UpdateToolBodyType,
  GetAdminSystemToolDetailQueryType,
  GetAdminSystemToolDetailResponseType,
  GetAllSystemAppsBodyType,
  DeleteSystemToolQueryType,
  GetAllSystemAppTypeToolsResponse,
  CreateAppToolBodyType
} from '@fastgpt/global/openapi/core/plugin/admin/tool/api';

export const getAdminSystemTools = (data: GetAdminSystemToolsQueryType) =>
  GET<GetAdminSystemToolsResponseType>('/core/plugin/admin/tool/list', data);

export const getAdminSystemToolDetail = (data: GetAdminSystemToolDetailQueryType) =>
  GET<GetAdminSystemToolDetailResponseType>('/core/plugin/admin/tool/detail', data);

export const putAdminUpdateTool = (data: UpdateToolBodyType) =>
  PUT('/core/plugin/admin/tool/update', data);

export const putAdminUpdateToolOrder = (data: UpdateToolOrderBodyType) =>
  PUT('/core/plugin/admin/tool/updateOrder', data);

export const delAdminSystemTool = (data: DeleteSystemToolQueryType) =>
  DELETE('/core/plugin/admin/tool/delete', data);

/* ===== App type tool ===== */
export const getAdminAllSystemAppTool = (data: GetAllSystemAppsBodyType) =>
  POST<GetAllSystemAppTypeToolsResponse>('/core/plugin/admin/tool/app/systemApps', data);

export const postAdminCreateAppTypeTool = (data: CreateAppToolBodyType) =>
  POST('/core/plugin/admin/tool/app/create', data);
