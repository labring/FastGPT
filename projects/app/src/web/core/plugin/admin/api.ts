import { POST, DELETE } from '@/web/common/api/request';
import type {
  ConfirmUploadPkgPluginBodyType,
  InstallPluginFromUrlBodyType
} from '@fastgpt/global/openapi/core/plugin/admin/api';

import type { PluginSummaryType } from '@fastgpt/global/sdk/fastgpt-plugin';

// Pkg plugin
export const uploadPkgPlugin = (formData: FormData) =>
  POST<PluginSummaryType>(`/core/plugin/admin/pkg/upload`, formData);

export const confirmPkgPluginUpload = (data: ConfirmUploadPkgPluginBodyType) =>
  POST(`/core/plugin/admin/pkg/confirm`, data);

export const intallPluginWithUrl = (data: InstallPluginFromUrlBodyType) =>
  POST('/core/plugin/admin/installWithUrl', data);
