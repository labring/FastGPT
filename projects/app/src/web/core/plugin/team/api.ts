import { GET, POST } from '@/web/common/api/request';
import type {
  GetTeamSystemPluginListQueryType,
  ToggleInstallPluginBodyType,
  GetTeamPluginListResponseType
} from '@fastgpt/global/openapi/core/plugin/team/api';
import type {
  GetTeamToolDetailQueryType,
  GetTeamToolDetailResponseType
} from '@fastgpt/global/openapi/core/plugin/team/toolApi';

export const getTeamSystemPluginList = (data: GetTeamSystemPluginListQueryType) =>
  GET<GetTeamPluginListResponseType>(`/core/plugin/team/list`, data);
export const postToggleInstallPlugin = (data: ToggleInstallPluginBodyType) =>
  POST(`/core/plugin/team/toggleInstall`, data);

/* ===== Tool ===== */
export const getTeamToolDetail = (data: GetTeamToolDetailQueryType) =>
  GET<GetTeamToolDetailResponseType>(`/core/plugin/team/toolDetail`, data);
