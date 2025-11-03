import { GET, POST } from '@/web/common/api/request';
import type {
  GetTeamToolDetailQueryType,
  GetTeamToolDetailResponseType
} from '@fastgpt/global/openapi/core/plugin/tool/api';

export const getTeamToolDetail = (data: GetTeamToolDetailQueryType) =>
  GET<GetTeamToolDetailResponseType>(`/core/plugin/tool/detail`, data);
