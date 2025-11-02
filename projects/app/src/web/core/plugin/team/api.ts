import { GET, POST } from '@/web/common/api/request';
import type {
  GetTeamSystemPluginListQueryType,
  ToggleInstallPluginBodyType,
  GetTeamSystemPluginListResponseType
} from '@fastgpt/global/openapi/core/plugin/team/api';

export const getTeamSystemPluginList = (data: GetTeamSystemPluginListQueryType) =>
  GET<GetTeamSystemPluginListResponseType>(`/core/plugin/team/list`, data);
export const postToggleInstallPlugin = (data: ToggleInstallPluginBodyType) =>
  POST(`/core/plugin/team/toggleInstall`, data);
