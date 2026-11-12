import type { RestoreModerationPluginBodyType } from '@fastgpt/global/openapi/core/plugin/admin/moderation/api';
import { GET, POST } from '@/web/common/api/request';
import type {
  GetModerationPluginListQueryType,
  GetModerationPluginListResponseType,
  SaveModerationConfigBodyType,
  SaveModerationConfigResponseType,
  DeleteModerationPluginBodyType,
  RawModerationCheckBodyType,
  RawModerationCheckResponseType,
  GetModerationPolicyResponseType,
  UpdateModerationPolicyBodyType,
  UpdateModerationPolicyResponseType,
  GetModerationRecordsBodyType,
  GetModerationRecordsResponseType
} from '@fastgpt/global/openapi/core/plugin/admin/moderation/api';

/** 获取内容审查插件管理列表 */
export const getAdminModerationPluginList = (data?: GetModerationPluginListQueryType) =>
  GET<GetModerationPluginListResponseType>('/core/plugin/admin/moderation/list', data);

/** 保存内容审查插件配置（凭据 / 启用状态） */
export const postAdminSaveModerationConfig = (data: SaveModerationConfigBodyType) =>
  POST<SaveModerationConfigResponseType>('/core/plugin/admin/moderation/config', data);

/** 软卸载内容审查插件，保留本地配置 */
export const postAdminDeleteModerationPlugin = (data: DeleteModerationPluginBodyType) =>
  POST<void>('/core/plugin/admin/moderation/delete', data);

/** 测试调用审查插件 */
export const postAdminCheckModeration = (data: RawModerationCheckBodyType) =>
  POST<RawModerationCheckResponseType>('/core/plugin/admin/moderation/check', data);

/** 获取全局内容审核策略 */
export const getAdminModerationPolicy = () =>
  GET<GetModerationPolicyResponseType>('/core/plugin/admin/moderation/policy');

/** 更新全局内容审核策略 */
export const postAdminUpdateModerationPolicy = (data: UpdateModerationPolicyBodyType) =>
  POST<UpdateModerationPolicyResponseType>('/core/plugin/admin/moderation/policy', data);

/** 分页查询内容审核记录 */
export const postAdminGetModerationRecords = (data: GetModerationRecordsBodyType) =>
  POST<GetModerationRecordsResponseType>('/core/plugin/admin/moderation/records', data);

/** Restore an installed plugin while retaining its saved configuration. */
export const postAdminRestoreModerationPlugin = (data: RestoreModerationPluginBodyType) =>
  POST<void>('/core/plugin/admin/moderation/restore', data);
