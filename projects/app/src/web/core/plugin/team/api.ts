import { GET } from '@/web/common/api/request';
import type {
  GetTeamSystemPluginListQueryType,
  GetTeamPluginListResponseType
} from '@fastgpt/global/openapi/core/plugin/team/tool/dto';
import type {
  GetTeamToolDetailQueryType,
  GetTeamToolDetailResponseType,
  GetTeamToolVersionsQueryType,
  GetTeamToolVersionsResponseType
} from '@fastgpt/global/openapi/core/plugin/team/tool/dto';

export const getTeamSystemPluginList = (data: GetTeamSystemPluginListQueryType) =>
  GET<GetTeamPluginListResponseType>(`/core/plugin/team/tool/list`, data);

/* ===== Tool ===== */
export const getTeamToolDetail = (data: GetTeamToolDetailQueryType) =>
  GET<GetTeamToolDetailResponseType>(`/core/plugin/team/tool/detail`, data);

export const getTeamToolVersions = (data: GetTeamToolVersionsQueryType) =>
  GET<GetTeamToolVersionsResponseType>(`/core/plugin/team/tool/versions`, data);
