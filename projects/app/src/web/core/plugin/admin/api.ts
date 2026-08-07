import { POST } from '@/web/common/api/request';
import type {
  ConfirmUploadPkgPluginBodyType,
  InstallPluginFromUrlBodyType,
  UploadPkgPluginResponseType
} from '@fastgpt/global/openapi/core/plugin/admin/api';
import type { PluginInstallResultType } from '@fastgpt/global/sdk/fastgpt-plugin';

// Pkg plugin
export const uploadPkgPlugin = (formData: FormData) =>
  POST<UploadPkgPluginResponseType>(`/core/plugin/admin/pkg/upload`, formData);

export const confirmPkgPluginUpload = (data: ConfirmUploadPkgPluginBodyType) =>
  POST(`/core/plugin/admin/pkg/confirm`, data);

export const intallPluginWithUrl = (data: InstallPluginFromUrlBodyType) =>
  POST<PluginInstallResultType>('/core/plugin/admin/installWithUrl', data);
