import { PUT } from '@/web/common/api/request';
import type {
  UpdatePluginDatasetStatusBody,
  UpdatePluginDatasetStatusResponse
} from '@/pages/api/core/config/updatePluginDatasetStatus';

export const updatePluginDatasetStatus = (data: UpdatePluginDatasetStatusBody) =>
  PUT<UpdatePluginDatasetStatusResponse>('/core/config/updatePluginDatasetStatus', data);
