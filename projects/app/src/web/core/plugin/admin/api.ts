import { GET, PUT, POST, DELETE } from '@/web/common/api/request';
import type {
  GetPkgPluginUploadURLQueryType,
  GetPkgPluginUploadURLResponseType,
  ParseUploadedPkgPluginQueryType,
  ParseUploadedPkgPluginResponseType,
  ConfirmUploadPkgPluginBodyType,
  DeletePkgPluginQueryType,
  InstallPluginFromUrlBodyType
} from '@fastgpt/global/openapi/core/plugin/admin/api';

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
