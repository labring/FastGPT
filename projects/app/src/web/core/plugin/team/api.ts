import { GET, POST } from '@/web/common/api/request';
import type {
  DeleteTeamToolBodyType,
  GetTeamSystemPluginListQueryType,
  GetTeamPluginListResponseType
} from '@fastgpt/global/openapi/core/plugin/team/tool/api';
import type {
  GetTeamToolDetailQueryType,
  GetTeamToolDetailResponseType,
  GetTeamToolVersionsQueryType,
  GetTeamToolVersionsResponseType
} from '@fastgpt/global/openapi/core/plugin/team/tool/api';
import type {
  ConfirmTeamUploadPkgPluginBodyType,
  InstallTeamPluginFromUrlBodyType,
  UploadTeamPkgPluginResponseType
} from '@fastgpt/global/openapi/core/plugin/team/pkg/api';

export const getTeamSystemPluginList = (data: GetTeamSystemPluginListQueryType) =>
  GET<GetTeamPluginListResponseType>(`/core/plugin/team/tool/list`, data);

/* ===== Tool ===== */
export const getTeamToolDetail = (data: GetTeamToolDetailQueryType) =>
  GET<GetTeamToolDetailResponseType>(`/core/plugin/team/tool/detail`, data);

export const getTeamToolVersions = (data: GetTeamToolVersionsQueryType) =>
  GET<GetTeamToolVersionsResponseType>(`/core/plugin/team/tool/versions`, data);

export const deleteTeamPlugin = (data: DeleteTeamToolBodyType) =>
  POST(`/core/plugin/team/tool/delete`, data);

/* ===== Pkg ===== */
export const uploadTeamPkgPlugin = (formData: FormData) =>
  POST<UploadTeamPkgPluginResponseType>(`/core/plugin/team/pkg/upload`, formData);

export const confirmTeamPkgPluginUpload = (data: ConfirmTeamUploadPkgPluginBodyType) =>
  POST(`/core/plugin/team/pkg/confirm`, data);

export const installTeamPluginWithUrl = (data: InstallTeamPluginFromUrlBodyType) =>
  POST(`/core/plugin/team/pkg/installWithUrl`, data);
