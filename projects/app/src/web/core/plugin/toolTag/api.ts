import { GET, PUT, DELETE, POST } from '@/web/common/api/request';
import type {
  GetPluginTagListResponse,
  CreatePluginToolTagBody,
  UpdatePluginToolTagBody,
  DeletePluginToolTagQuery,
  UpdatePluginToolTagOrderBody
} from '@fastgpt/global/openapi/core/plugin/toolTag/api';

/* ============ plugin tags ============== */
export const getPluginToolTags = () => GET<GetPluginTagListResponse>(`/core/plugin/toolTag/list`);

export const createPluginToolag = (data: CreatePluginToolTagBody) =>
  POST<{}>(`/core/plugin/toolTag/config/create`, data);

export const updatePluginToolTag = (data: UpdatePluginToolTagBody) =>
  PUT<{}>(`/core/plugin/toolTag/config/update`, data);

export const deletePluginToolTag = (data: DeletePluginToolTagQuery) =>
  DELETE<{}>(`/core/plugin/toolTag/config/delete`, data);

export const updatePluginToolTagOrder = (data: UpdatePluginToolTagOrderBody) =>
  PUT<{}>(`/core/plugin/toolTag/config/updateOrder`, data);
