import { PUT } from '@/web/common/api/request';
import type {
  UpdatePluginDatasetStatusBody,
  UpdatePluginDatasetStatusResponse
} from '@fastgpt/global/openapi/core/plugin/admin/dataset/api';

// 更新插件知识库来源状态
export const updatePluginDatasetStatus = (data: UpdatePluginDatasetStatusBody) =>
  PUT<UpdatePluginDatasetStatusResponse>('/core/plugin/admin/dataset/updateStatus', data);
