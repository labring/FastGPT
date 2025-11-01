import { GET, PUT, POST, DELETE } from '@/web/common/api/request';
import type {
  CreateAppPluginBodyType,
  UpdatePluginBodyType,
  DeleteAppPluginQueryType,
  UpdatePluginOrderBodyType,
  GetPkgPluginUploadURLQueryType,
  GetPkgPluginUploadURLResponseType,
  ParseUploadedPkgPluginQueryType,
  ParseUploadedPkgPluginResponseType,
  ConfirmUploadPkgPluginBodyType,
  DeletePkgPluginQueryType,
  InstallPluginFromUrlBodyType,
  GetAllSystemPluginAppsResponseType,
  GetAllSystemPluginAppsBodyType
} from '@fastgpt/global/openapi/core/plugin/admin/api';

// Common
export const putUpdatePlugin = (data: UpdatePluginBodyType) =>
  PUT('/core/plugin/admin/update', data);
export const putUpdatePluginOrder = (data: UpdatePluginOrderBodyType) =>
  PUT('/core/plugin/admin/updateOrder', data);

// App Plugin
export const getAllSystemAppPlugins = (data: GetAllSystemPluginAppsBodyType) =>
  POST<GetAllSystemPluginAppsResponseType>('/core/plugin/admin/app/systemApps', data);

export const postCreateAppPlugin = (data: CreateAppPluginBodyType) =>
  POST('/core/plugin/admin/app/create', data);

export const delAppPlugin = (data: DeleteAppPluginQueryType) =>
  DELETE('/core/plugin/admin/app/delete', data);

// Pkg plugin
export const getPkgPluginUploadURL = (params: GetPkgPluginUploadURLQueryType) =>
  GET<GetPkgPluginUploadURLResponseType>(`/core/plugin/admin/pkg/presign`, params);

export const parseUploadedPkgPlugin = (params: ParseUploadedPkgPluginQueryType) =>
  GET<ParseUploadedPkgPluginResponseType>(`/core/plugin/admin/pkg/parse`, params);

export const confirmPkgPluginUpload = (data: ConfirmUploadPkgPluginBodyType) =>
  POST(`/core/plugin/admin/pkg/confirm`, data);

export const deletePkgPlugin = (data: DeletePkgPluginQueryType) =>
  DELETE('/core/plugin/admin/pkg/delete', data);

export const intallPluginWithUrl = (data: InstallPluginFromUrlBodyType) =>
  POST('/core/plugin/admin/installWithUrl', data);
