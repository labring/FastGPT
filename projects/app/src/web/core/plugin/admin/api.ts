import { POST } from '@/web/common/api/request';
import type {
  ConfirmUploadPkgPluginBodyType,
  InstallPluginFromUrlBodyType,
  UploadPkgPluginResponseType
} from '@fastgpt/global/openapi/core/plugin/admin/api';

// Pkg plugin
export const uploadPkgPlugin = (formData: FormData) =>
  POST<UploadPkgPluginResponseType>(`/core/plugin/admin/pkg/upload`, formData);

export const confirmPkgPluginUpload = (data: ConfirmUploadPkgPluginBodyType) =>
  POST(`/core/plugin/admin/pkg/confirm`, data);

export const intallPluginWithUrl = (data: InstallPluginFromUrlBodyType) =>
  POST('/core/plugin/admin/installWithUrl', data);
