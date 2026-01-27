import { PUT } from '@/web/common/api/request';
import type {
  UpdatePluginDatasetStatusBody,
  UpdatePluginDatasetStatusResponse
} from '@/global/core/config/api';

export const updatePluginDatasetStatus = (data: UpdatePluginDatasetStatusBody) =>
  PUT<UpdatePluginDatasetStatusResponse>('/core/config/updatePluginDatasetStatus', data);
