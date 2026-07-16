import { DELETE, GET, POST, PUT } from '@/web/common/api/request';
import type {
  DeleteTeamToolBodyType,
  GetTeamSystemPluginListQueryType,
  GetTeamPluginListResponseType,
  HideTeamSystemToolBodyType,
  UpdateTeamToolTagsBodyType
} from '@fastgpt/global/openapi/core/plugin/team/tool/api';
import type {
  GetTeamToolDetailQueryType,
  GetTeamToolDetailResponseType,
  GetTeamToolVersionsQueryType,
  GetTeamToolVersionsResponseType
} from '@fastgpt/global/openapi/core/plugin/team/tool/api';
import type {
  CreateTeamPluginTagBodyType,
  DeleteTeamPluginTagQueryType,
  ListTeamPluginTagsResponseType,
  TeamPluginTagItemType,
  UpdateTeamPluginTagBodyType,
  UpdateTeamPluginTagOrderBodyType
} from '@fastgpt/global/openapi/core/plugin/team/tag/api';
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

export const hideTeamSystemPlugin = (data: HideTeamSystemToolBodyType) =>
  POST(`/core/plugin/team/tool/hide`, data);

export const deleteTeamPlugin = (data: DeleteTeamToolBodyType) =>
  POST(`/core/plugin/team/tool/delete`, data);

export const updateTeamPluginTags = (data: UpdateTeamToolTagsBodyType) =>
  PUT(`/core/plugin/team/tool/tag/update`, data);

/* ===== Tag ===== */
export const listTeamPluginTags = () =>
  GET<ListTeamPluginTagsResponseType>(`/core/plugin/team/tag/list`);

export const createTeamPluginTag = (data: CreateTeamPluginTagBodyType) =>
  POST<TeamPluginTagItemType>(`/core/plugin/team/tag/create`, data);

export const updateTeamPluginTag = (data: UpdateTeamPluginTagBodyType) =>
  PUT<TeamPluginTagItemType>(`/core/plugin/team/tag/update`, data);

export const updateTeamPluginTagOrder = (data: UpdateTeamPluginTagOrderBodyType) =>
  PUT(`/core/plugin/team/tag/updateOrder`, data);

export const deleteTeamPluginTag = (data: DeleteTeamPluginTagQueryType) =>
  DELETE(`/core/plugin/team/tag/delete`, data);

/* ===== Pkg ===== */
export const uploadTeamPkgPlugin = (formData: FormData) =>
  POST<UploadTeamPkgPluginResponseType>(`/core/plugin/team/pkg/upload`, formData);

export const confirmTeamPkgPluginUpload = (data: ConfirmTeamUploadPkgPluginBodyType) =>
  POST(`/core/plugin/team/pkg/confirm`, data);

export const installTeamPluginWithUrl = (data: InstallTeamPluginFromUrlBodyType) =>
  POST(`/core/plugin/team/pkg/installWithUrl`, data);
