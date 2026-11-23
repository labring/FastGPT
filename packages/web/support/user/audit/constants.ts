import {
  AuditEventEnum,
  AdminAuditEventEnum,
  type AdminAuditEventParamsType,
  type AuditEventParamsType,
  type DatasetAuditEventParamsType
} from '@fastgpt/global/support/user/audit/constants';
import { i18nT } from '@fastgpt/global/common/i18n/utils';

export const adminAuditLogMap = {
  [AdminAuditEventEnum.ADMIN_LOGIN]: {
    content: i18nT('account_team:log_admin_login'),
    typeLabel: i18nT('account_team:admin_login'),
    params: {} as AdminAuditEventParamsType[AdminAuditEventEnum.ADMIN_LOGIN]
  },
  [AdminAuditEventEnum.ADMIN_ADD_USER]: {
    content: i18nT('account_team:log_admin_add_user'),
    typeLabel: i18nT('account_team:admin_add_user'),
    params: {} as AdminAuditEventParamsType[AdminAuditEventEnum.ADMIN_ADD_USER]
  },
  [AdminAuditEventEnum.ADMIN_UPDATE_USER]: {
    content: i18nT('account_team:log_admin_update_user'),
    typeLabel: i18nT('account_team:admin_update_user'),
    params: {} as AdminAuditEventParamsType[AdminAuditEventEnum.ADMIN_UPDATE_USER]
  },
  [AdminAuditEventEnum.ADMIN_DELETE_USER]: {
    content: i18nT('account_team:log_admin_delete_user'),
    typeLabel: i18nT('account_team:admin_delete_user'),
    params: {} as AdminAuditEventParamsType[AdminAuditEventEnum.ADMIN_DELETE_USER]
  },
  [AdminAuditEventEnum.ADMIN_UPDATE_TEAM]: {
    content: i18nT('account_team:log_admin_update_team'),
    typeLabel: i18nT('account_team:admin_update_team'),
    params: {} as AdminAuditEventParamsType[AdminAuditEventEnum.ADMIN_UPDATE_TEAM]
  },
  [AdminAuditEventEnum.ADMIN_SWITCH_TEAM]: {
    content: i18nT('account_team:log_admin_switch_team'),
    typeLabel: i18nT('account_team:admin_switch_team'),
    params: {} as AdminAuditEventParamsType[AdminAuditEventEnum.ADMIN_SWITCH_TEAM]
  },
  [AdminAuditEventEnum.ADMIN_ADD_PLAN]: {
    content: i18nT('account_team:log_admin_add_plan'),
    typeLabel: i18nT('account_team:admin_add_plan'),
    params: {} as AdminAuditEventParamsType[AdminAuditEventEnum.ADMIN_ADD_PLAN]
  },
  [AdminAuditEventEnum.ADMIN_UPDATE_PLAN]: {
    content: i18nT('account_team:log_admin_update_plan'),
    typeLabel: i18nT('account_team:admin_update_plan'),
    params: {} as AdminAuditEventParamsType[AdminAuditEventEnum.ADMIN_UPDATE_PLAN]
  },
  [AdminAuditEventEnum.ADMIN_FINISH_INVOICE]: {
    content: i18nT('account_team:log_admin_finish_invoice'),
    typeLabel: i18nT('account_team:admin_finish_invoice'),
    params: {} as AdminAuditEventParamsType[AdminAuditEventEnum.ADMIN_FINISH_INVOICE]
  },
  [AdminAuditEventEnum.ADMIN_UPDATE_SYSTEM_CONFIG]: {
    content: i18nT('account_team:log_admin_update_system_config'),
    typeLabel: i18nT('account_team:admin_update_system_config'),
    params: {} as AdminAuditEventParamsType[AdminAuditEventEnum.ADMIN_UPDATE_SYSTEM_CONFIG]
  },
  [AdminAuditEventEnum.ADMIN_CREATE_APP_TEMPLATE]: {
    content: i18nT('account_team:log_admin_create_app_template'),
    typeLabel: i18nT('account_team:admin_create_app_template'),
    params: {} as AdminAuditEventParamsType[AdminAuditEventEnum.ADMIN_CREATE_APP_TEMPLATE]
  },
  [AdminAuditEventEnum.ADMIN_UPDATE_APP_TEMPLATE]: {
    content: i18nT('account_team:log_admin_update_app_template'),
    typeLabel: i18nT('account_team:admin_update_app_template'),
    params: {} as AdminAuditEventParamsType[AdminAuditEventEnum.ADMIN_UPDATE_APP_TEMPLATE]
  },
  [AdminAuditEventEnum.ADMIN_DELETE_APP_TEMPLATE]: {
    content: i18nT('account_team:log_admin_delete_app_template'),
    typeLabel: i18nT('account_team:admin_delete_app_template'),
    params: {} as AdminAuditEventParamsType[AdminAuditEventEnum.ADMIN_DELETE_APP_TEMPLATE]
  },
  [AdminAuditEventEnum.ADMIN_SAVE_TEMPLATE_TYPE]: {
    content: i18nT('account_team:log_admin_save_template_type'),
    typeLabel: i18nT('account_team:admin_save_template_type'),
    params: {} as AdminAuditEventParamsType[AdminAuditEventEnum.ADMIN_SAVE_TEMPLATE_TYPE]
  },
  [AdminAuditEventEnum.ADMIN_DELETE_TEMPLATE_TYPE]: {
    content: i18nT('account_team:log_admin_delete_template_type'),
    typeLabel: i18nT('account_team:admin_delete_template_type'),
    params: {} as AdminAuditEventParamsType[AdminAuditEventEnum.ADMIN_DELETE_TEMPLATE_TYPE]
  },
  [AdminAuditEventEnum.ADMIN_CREATE_PLUGIN]: {
    content: i18nT('account_team:log_admin_create_plugin'),
    typeLabel: i18nT('account_team:admin_create_plugin'),
    params: {} as AdminAuditEventParamsType[AdminAuditEventEnum.ADMIN_CREATE_PLUGIN]
  },
  [AdminAuditEventEnum.ADMIN_UPDATE_PLUGIN]: {
    content: i18nT('account_team:log_admin_update_plugin'),
    typeLabel: i18nT('account_team:admin_update_plugin'),
    params: {} as AdminAuditEventParamsType[AdminAuditEventEnum.ADMIN_UPDATE_PLUGIN]
  },
  [AdminAuditEventEnum.ADMIN_DELETE_PLUGIN]: {
    content: i18nT('account_team:log_admin_delete_plugin'),
    typeLabel: i18nT('account_team:admin_delete_plugin'),
    params: {} as AdminAuditEventParamsType[AdminAuditEventEnum.ADMIN_DELETE_PLUGIN]
  },
  [AdminAuditEventEnum.ADMIN_CREATE_PLUGIN_GROUP]: {
    content: i18nT('account_team:log_admin_create_plugin_group'),
    typeLabel: i18nT('account_team:admin_create_plugin_group'),
    params: {} as AdminAuditEventParamsType[AdminAuditEventEnum.ADMIN_CREATE_PLUGIN_GROUP]
  },
  [AdminAuditEventEnum.ADMIN_UPDATE_PLUGIN_GROUP]: {
    content: i18nT('account_team:log_admin_update_plugin_group'),
    typeLabel: i18nT('account_team:admin_update_plugin_group'),
    params: {} as AdminAuditEventParamsType[AdminAuditEventEnum.ADMIN_UPDATE_PLUGIN_GROUP]
  },
  [AdminAuditEventEnum.ADMIN_DELETE_PLUGIN_GROUP]: {
    content: i18nT('account_team:log_admin_delete_plugin_group'),
    typeLabel: i18nT('account_team:admin_delete_plugin_group'),
    params: {} as AdminAuditEventParamsType[AdminAuditEventEnum.ADMIN_DELETE_PLUGIN_GROUP]
  },

  // Inform
  [AdminAuditEventEnum.ADMIN_UPDATE_SYSTEM_MODAL]: {
    content: i18nT('account_team:log_admin_update_system_modal'),
    typeLabel: i18nT('account_team:admin_update_system_modal'),
    params: {} as AdminAuditEventParamsType[AdminAuditEventEnum.ADMIN_UPDATE_SYSTEM_MODAL]
  },
  [AdminAuditEventEnum.ADMIN_SEND_SYSTEM_INFORM]: {
    content: i18nT('account_team:log_admin_send_system_inform'),
    typeLabel: i18nT('account_team:admin_send_system_inform'),
    params: {} as AdminAuditEventParamsType[AdminAuditEventEnum.ADMIN_SEND_SYSTEM_INFORM]
  },
  [AdminAuditEventEnum.ADMIN_UPDATE_ACTIVITY_AD]: {
    content: i18nT('account_team:log_admin_update_activity_ad'),
    typeLabel: i18nT('account_team:admin_update_activity_ad'),
    params: {} as AdminAuditEventParamsType[AdminAuditEventEnum.ADMIN_UPDATE_ACTIVITY_AD]
  },
  [AdminAuditEventEnum.ADMIN_UPDATE_OPERATIONAL_AD]: {
    content: i18nT('account_team:log_admin_update_operational_ad'),
    typeLabel: i18nT('account_team:admin_update_operational_ad'),
    params: {} as AdminAuditEventParamsType[AdminAuditEventEnum.ADMIN_UPDATE_OPERATIONAL_AD]
  },

  // Moderation
  [AdminAuditEventEnum.ADMIN_ENABLE_MODERATION_PLUGIN]: {
    content: i18nT('account_team:log_admin_enable_moderation_plugin'),
    typeLabel: i18nT('account_team:admin_enable_moderation_plugin'),
    params: {} as AdminAuditEventParamsType[AdminAuditEventEnum.ADMIN_ENABLE_MODERATION_PLUGIN]
  },
  [AdminAuditEventEnum.ADMIN_DISABLE_MODERATION_PLUGIN]: {
    content: i18nT('account_team:log_admin_disable_moderation_plugin'),
    typeLabel: i18nT('account_team:admin_disable_moderation_plugin'),
    params: {} as AdminAuditEventParamsType[AdminAuditEventEnum.ADMIN_DISABLE_MODERATION_PLUGIN]
  },
  [AdminAuditEventEnum.ADMIN_INSTALL_MODERATION_PLUGIN]: {
    content: i18nT('account_team:log_admin_install_moderation_plugin'),
    typeLabel: i18nT('account_team:admin_install_moderation_plugin'),
    params: {} as AdminAuditEventParamsType[AdminAuditEventEnum.ADMIN_INSTALL_MODERATION_PLUGIN]
  },
  [AdminAuditEventEnum.ADMIN_UNINSTALL_MODERATION_PLUGIN]: {
    content: i18nT('account_team:log_admin_uninstall_moderation_plugin'),
    typeLabel: i18nT('account_team:admin_uninstall_moderation_plugin'),
    params: {} as AdminAuditEventParamsType[AdminAuditEventEnum.ADMIN_UNINSTALL_MODERATION_PLUGIN]
  },
  [AdminAuditEventEnum.ADMIN_UPDATE_MODERATION_PLUGIN_CONFIG]: {
    content: i18nT('account_team:log_admin_update_moderation_plugin_config'),
    typeLabel: i18nT('account_team:admin_update_moderation_plugin_config'),
    params:
      {} as AdminAuditEventParamsType[AdminAuditEventEnum.ADMIN_UPDATE_MODERATION_PLUGIN_CONFIG]
  },
  [AdminAuditEventEnum.ADMIN_UPDATE_MODERATION_POLICY]: {
    content: i18nT('account_team:log_admin_update_moderation_policy'),
    typeLabel: i18nT('account_team:admin_update_moderation_policy'),
    params: {} as AdminAuditEventParamsType[AdminAuditEventEnum.ADMIN_UPDATE_MODERATION_POLICY]
  }
};

export const auditLogMap = {
  [AuditEventEnum.EXPORT_AUDIT_LOGS]: {
    content: i18nT('account_team:log_export_audit_logs'),
    typeLabel: i18nT('account_team:export_audit_logs'),
    params: {} as AuditEventParamsType[AuditEventEnum.EXPORT_AUDIT_LOGS]
  },
  //Team
  [AuditEventEnum.LOGIN]: {
    content: i18nT('account_team:log_login'),
    typeLabel: i18nT('account_team:login'),
    params: {} as AuditEventParamsType[AuditEventEnum.LOGIN]
  },
  [AuditEventEnum.CREATE_INVITATION_LINK]: {
    content: i18nT('account_team:log_create_invitation_link'),
    typeLabel: i18nT('account_team:create_invitation_link'),
    params: {} as AuditEventParamsType[AuditEventEnum.CREATE_INVITATION_LINK]
  },
  [AuditEventEnum.JOIN_TEAM]: {
    content: i18nT('account_team:log_join_team'),
    typeLabel: i18nT('account_team:join_team'),
    params: {} as AuditEventParamsType[AuditEventEnum.JOIN_TEAM]
  },
  [AuditEventEnum.CHANGE_MEMBER_NAME]: {
    content: i18nT('account_team:log_change_member_name'),
    typeLabel: i18nT('account_team:change_member_name'),
    params: {} as AuditEventParamsType[AuditEventEnum.CHANGE_MEMBER_NAME]
  },
  [AuditEventEnum.KICK_OUT_TEAM]: {
    content: i18nT('account_team:log_kick_out_team'),
    typeLabel: i18nT('account_team:kick_out_team'),
    params: {} as AuditEventParamsType[AuditEventEnum.KICK_OUT_TEAM]
  },
  [AuditEventEnum.RECOVER_TEAM_MEMBER]: {
    content: i18nT('account_team:log_recover_team_member'),
    typeLabel: i18nT('account_team:recover_team_member'),
    params: {} as AuditEventParamsType[AuditEventEnum.RECOVER_TEAM_MEMBER]
  },
  [AuditEventEnum.CREATE_DEPARTMENT]: {
    content: i18nT('account_team:log_create_department'),
    typeLabel: i18nT('account_team:create_department'),
    params: {} as AuditEventParamsType[AuditEventEnum.CREATE_DEPARTMENT]
  },
  [AuditEventEnum.CHANGE_DEPARTMENT]: {
    content: i18nT('account_team:log_change_department'),
    typeLabel: i18nT('account_team:change_department_name'),
    params: {} as AuditEventParamsType[AuditEventEnum.CHANGE_DEPARTMENT]
  },
  [AuditEventEnum.DELETE_DEPARTMENT]: {
    content: i18nT('account_team:log_delete_department'),
    typeLabel: i18nT('account_team:delete_department'),
    params: {} as AuditEventParamsType[AuditEventEnum.DELETE_DEPARTMENT]
  },
  [AuditEventEnum.RELOCATE_DEPARTMENT]: {
    content: i18nT('account_team:log_relocate_department'),
    typeLabel: i18nT('account_team:relocate_department'),
    params: {} as AuditEventParamsType[AuditEventEnum.RELOCATE_DEPARTMENT]
  },
  [AuditEventEnum.CREATE_GROUP]: {
    content: i18nT('account_team:log_create_group'),
    typeLabel: i18nT('account_team:create_group'),
    params: {} as AuditEventParamsType[AuditEventEnum.CREATE_GROUP]
  },
  [AuditEventEnum.DELETE_GROUP]: {
    content: i18nT('account_team:log_delete_group'),
    typeLabel: i18nT('account_team:delete_group'),
    params: {} as AuditEventParamsType[AuditEventEnum.DELETE_GROUP]
  },
  [AuditEventEnum.ASSIGN_PERMISSION]: {
    content: i18nT('account_team:log_assign_permission'),
    typeLabel: i18nT('account_team:assign_permission'),
    params: {} as AuditEventParamsType[AuditEventEnum.ASSIGN_PERMISSION]
  },
  [AuditEventEnum.TRANSFER_TEAM_OWNERSHIP]: {
    content: i18nT('account_team:log_transfer_team_ownership'),
    typeLabel: i18nT('account_team:transfer_team_ownership'),
    params: {} as AuditEventParamsType[AuditEventEnum.TRANSFER_TEAM_OWNERSHIP]
  },
  // Resource permission
  [AuditEventEnum.RESUME_INHERIT_PERMISSION]: {
    content: i18nT('account_team:log_resume_inherit_permission'),
    typeLabel: i18nT('account_team:resume_inherit_permission'),
    params: {} as AuditEventParamsType[AuditEventEnum.RESUME_INHERIT_PERMISSION]
  },
  //APP
  [AuditEventEnum.CREATE_APP]: {
    content: i18nT('account_team:log_create_app'),
    typeLabel: i18nT('account_team:create_app'),
    params: {} as AuditEventParamsType[AuditEventEnum.CREATE_APP]
  },
  [AuditEventEnum.UPDATE_APP_INFO]: {
    content: i18nT('account_team:log_update_app_info'),
    typeLabel: i18nT('account_team:update_app_info'),
    params: {} as AuditEventParamsType[AuditEventEnum.UPDATE_APP_INFO]
  },
  [AuditEventEnum.MOVE_APP]: {
    content: i18nT('account_team:log_move_app'),
    typeLabel: i18nT('account_team:move_app'),
    params: {} as AuditEventParamsType[AuditEventEnum.MOVE_APP]
  },
  [AuditEventEnum.DELETE_APP]: {
    content: i18nT('account_team:log_delete_app'),
    typeLabel: i18nT('account_team:delete_app'),
    params: {} as AuditEventParamsType[AuditEventEnum.DELETE_APP]
  },
  [AuditEventEnum.UPDATE_APP_COLLABORATOR]: {
    content: i18nT('account_team:log_update_app_collaborator'),
    typeLabel: i18nT('account_team:update_app_collaborator'),
    params: {} as AuditEventParamsType[AuditEventEnum.UPDATE_APP_COLLABORATOR]
  },
  [AuditEventEnum.DELETE_APP_COLLABORATOR]: {
    content: i18nT('account_team:log_delete_app_collaborator'),
    typeLabel: i18nT('account_team:delete_app_collaborator'),
    params: {} as AuditEventParamsType[AuditEventEnum.DELETE_APP_COLLABORATOR]
  },
  [AuditEventEnum.TRANSFER_APP_OWNERSHIP]: {
    content: i18nT('account_team:log_transfer_app_ownership'),
    typeLabel: i18nT('account_team:transfer_app_ownership'),
    params: {} as AuditEventParamsType[AuditEventEnum.TRANSFER_APP_OWNERSHIP]
  },
  [AuditEventEnum.CREATE_APP_COPY]: {
    content: i18nT('account_team:log_create_app_copy'),
    typeLabel: i18nT('account_team:create_app_copy'),
    params: {} as AuditEventParamsType[AuditEventEnum.CREATE_APP_COPY]
  },
  [AuditEventEnum.CREATE_APP_FOLDER]: {
    content: i18nT('account_team:log_create_app_folder'),
    typeLabel: i18nT('account_team:create_app_folder'),
    params: {} as AuditEventParamsType[AuditEventEnum.CREATE_APP_FOLDER]
  },
  [AuditEventEnum.SAVE_APP]: {
    content: i18nT('account_team:log_save_app'),
    typeLabel: i18nT('account_team:save_app'),
    params: {} as AuditEventParamsType[AuditEventEnum.SAVE_APP]
  },
  [AuditEventEnum.PUBLISH_APP]: {
    content: i18nT('account_team:log_publish_app'),
    typeLabel: i18nT('account_team:publish_app'),
    params: {} as AuditEventParamsType[AuditEventEnum.PUBLISH_APP]
  },
  [AuditEventEnum.UPDATE_PUBLISH_APP]: {
    content: i18nT('account_team:log_update_publish_app'),
    typeLabel: i18nT('account_team:update_publish_app'),
    params: {} as AuditEventParamsType[AuditEventEnum.UPDATE_PUBLISH_APP]
  },
  [AuditEventEnum.CREATE_APP_PUBLISH_CHANNEL]: {
    content: i18nT('account_team:log_create_app_publish_channel'),
    typeLabel: i18nT('account_team:create_app_publish_channel'),
    params: {} as AuditEventParamsType[AuditEventEnum.CREATE_APP_PUBLISH_CHANNEL]
  },
  [AuditEventEnum.UPDATE_APP_PUBLISH_CHANNEL]: {
    content: i18nT('account_team:log_update_app_publish_channel'),
    typeLabel: i18nT('account_team:update_app_publish_channel'),
    params: {} as AuditEventParamsType[AuditEventEnum.UPDATE_APP_PUBLISH_CHANNEL]
  },
  [AuditEventEnum.DELETE_APP_PUBLISH_CHANNEL]: {
    content: i18nT('account_team:log_delete_app_publish_channel'),
    typeLabel: i18nT('account_team:delete_app_publish_channel'),
    params: {} as AuditEventParamsType[AuditEventEnum.DELETE_APP_PUBLISH_CHANNEL]
  },
  [AuditEventEnum.EXPORT_APP_CHAT_LOG]: {
    content: i18nT('account_team:log_export_app_chat_log'),
    typeLabel: i18nT('account_team:export_app_chat_log'),
    params: {} as AuditEventParamsType[AuditEventEnum.EXPORT_APP_CHAT_LOG]
  },

  // Eval
  [AuditEventEnum.CREATE_EVALUATION]: {
    content: i18nT('account_team:log_create_evaluation'),
    typeLabel: i18nT('account_team:create_evaluation'),
    params: {} as AuditEventParamsType[AuditEventEnum.CREATE_EVALUATION]
  },
  [AuditEventEnum.EXPORT_EVALUATION]: {
    content: i18nT('account_team:log_export_evaluation'),
    typeLabel: i18nT('account_team:export_evaluation'),
    params: {} as AuditEventParamsType[AuditEventEnum.EXPORT_EVALUATION]
  },
  [AuditEventEnum.DELETE_EVALUATION]: {
    content: i18nT('account_team:log_delete_evaluation'),
    typeLabel: i18nT('account_team:delete_evaluation'),
    params: {} as AuditEventParamsType[AuditEventEnum.DELETE_EVALUATION]
  },

  //Dataset
  [AuditEventEnum.CREATE_DATASET]: {
    content: i18nT('account_team:log_create_dataset'),
    typeLabel: i18nT('account_team:create_dataset'),
    params: {} as AuditEventParamsType[AuditEventEnum.CREATE_DATASET]
  },
  [AuditEventEnum.UPDATE_DATASET]: {
    content: i18nT('account_team:log_update_dataset'),
    typeLabel: i18nT('account_team:update_dataset'),
    params: {} as AuditEventParamsType[AuditEventEnum.UPDATE_DATASET]
  },
  /**
   * 修改知识库配置：每个实际变化的配置项一条日志。
   *
   * `changeItem` 是「配置项 i18n key」，对象型配置再拼 `.字段路径`（如 `… · chunkSize`），
   * 因此这里是 string 而不是枚举。
   */
  ['dataset.config.update']: {
    content: i18nT('account_team:log_dataset_config_updated'),
    typeLabel: i18nT('account_team:dataset_config_updated'),
    params: {} as DatasetAuditEventParamsType['dataset.config.update']
  },
  /** 创建知识库标签定义。 */
  ['dataset.tag.create']: {
    content: i18nT('account_team:log_dataset_tag_created'),
    typeLabel: i18nT('account_team:dataset_tag_created'),
    params: {} as DatasetAuditEventParamsType['dataset.tag.create']
  },
  /** 重命名知识库标签定义。 */
  ['dataset.tag.rename']: {
    content: i18nT('account_team:log_dataset_tag_renamed'),
    typeLabel: i18nT('account_team:dataset_tag_renamed'),
    params: {} as DatasetAuditEventParamsType['dataset.tag.rename']
  },
  /** 删除知识库标签定义。 */
  ['dataset.tag.delete']: {
    content: i18nT('account_team:log_dataset_tag_deleted'),
    typeLabel: i18nT('account_team:dataset_tag_deleted'),
    params: {} as DatasetAuditEventParamsType['dataset.tag.delete']
  },
  [AuditEventEnum.DELETE_DATASET]: {
    content: i18nT('account_team:log_delete_dataset'),
    typeLabel: i18nT('account_team:delete_dataset'),
    params: {} as AuditEventParamsType[AuditEventEnum.DELETE_DATASET]
  },
  [AuditEventEnum.MOVE_DATASET]: {
    content: i18nT('account_team:log_move_dataset'),
    typeLabel: i18nT('account_team:move_dataset'),
    params: {} as AuditEventParamsType[AuditEventEnum.MOVE_DATASET]
  },
  [AuditEventEnum.UPDATE_DATASET_COLLABORATOR]: {
    content: i18nT('account_team:log_update_dataset_collaborator'),
    typeLabel: i18nT('account_team:update_dataset_collaborator'),
    params: {} as AuditEventParamsType[AuditEventEnum.UPDATE_DATASET_COLLABORATOR]
  },
  [AuditEventEnum.DELETE_DATASET_COLLABORATOR]: {
    content: i18nT('account_team:log_delete_dataset_collaborator'),
    typeLabel: i18nT('account_team:delete_dataset_collaborator'),
    params: {} as AuditEventParamsType[AuditEventEnum.DELETE_DATASET_COLLABORATOR]
  },
  [AuditEventEnum.TRANSFER_DATASET_OWNERSHIP]: {
    content: i18nT('account_team:log_transfer_dataset_ownership'),
    typeLabel: i18nT('account_team:transfer_dataset_ownership'),
    params: {} as AuditEventParamsType[AuditEventEnum.TRANSFER_DATASET_OWNERSHIP]
  },
  [AuditEventEnum.EXPORT_DATASET]: {
    content: i18nT('account_team:log_export_dataset'),
    typeLabel: i18nT('account_team:export_dataset'),
    params: {} as AuditEventParamsType[AuditEventEnum.EXPORT_DATASET]
  },
  [AuditEventEnum.CREATE_DATASET_FOLDER]: {
    content: i18nT('account_team:log_create_dataset_folder'),
    typeLabel: i18nT('account_team:create_dataset_folder'),
    params: {} as AuditEventParamsType[AuditEventEnum.CREATE_DATASET_FOLDER]
  },
  //Collection
  ['dataset.collection.create']: {
    typeLabel: i18nT('account_team:dataset_collection_created'),
    params: {} as DatasetAuditEventParamsType['dataset.collection.create']
  },
  /** @deprecated 历史日志展示用，新写入统一走 'dataset.collection.create'。 */
  [AuditEventEnum.CREATE_COLLECTION]: {
    content: i18nT('account_team:log_create_collection'),
    typeLabel: i18nT('account_team:create_collection'),
    params: {} as AuditEventParamsType[AuditEventEnum.CREATE_COLLECTION]
  },
  /** @deprecated 历史日志展示用，新写入已拆分为 rename/move/enable/disable 独立事件。 */
  [AuditEventEnum.UPDATE_COLLECTION]: {
    content: i18nT('account_team:log_update_collection'),
    typeLabel: i18nT('account_team:update_collection'),
    params: {} as AuditEventParamsType[AuditEventEnum.UPDATE_COLLECTION]
  },
  ['dataset.collection.rename']: {
    typeLabel: i18nT('account_team:dataset_collection_renamed'),
    params: {} as DatasetAuditEventParamsType['dataset.collection.rename']
  },
  ['dataset.collection.move']: {
    typeLabel: i18nT('account_team:dataset_collection_moved'),
    params: {} as DatasetAuditEventParamsType['dataset.collection.move']
  },
  ['dataset.collection.enable']: {
    typeLabel: i18nT('account_team:dataset_collection_enabled'),
    params: {} as DatasetAuditEventParamsType['dataset.collection.enable']
  },
  ['dataset.collection.disable']: {
    typeLabel: i18nT('account_team:dataset_collection_disabled'),
    params: {} as DatasetAuditEventParamsType['dataset.collection.disable']
  },
  ['dataset.collection.source.read']: {
    typeLabel: i18nT('account_team:dataset_collection_source_read'),
    params: {} as DatasetAuditEventParamsType['dataset.collection.source.read']
  },
  ['dataset.collection.qa.export']: {
    typeLabel: i18nT('account_team:dataset_collection_qa_exported'),
    params: {} as DatasetAuditEventParamsType['dataset.collection.qa.export']
  },
  ['dataset.collection.sync']: {
    typeLabel: i18nT('account_team:dataset_collection_synced'),
    params: {} as DatasetAuditEventParamsType['dataset.collection.sync']
  },
  ['dataset.collection.tag.add']: {
    typeLabel: i18nT('account_team:collection_tag_added'),
    params: {} as DatasetAuditEventParamsType['dataset.collection.tag.add']
  },
  ['dataset.collection.tag.remove']: {
    typeLabel: i18nT('account_team:collection_tag_removed'),
    params: {} as DatasetAuditEventParamsType['dataset.collection.tag.remove']
  },
  /** 集合权限恢复继承使用独立事件。 */
  ['dataset.collection.permission.inheritance_resume']: {
    typeLabel: i18nT('account_team:collection_permission_inheritance_resumed'),
    params: {} as DatasetAuditEventParamsType['dataset.collection.permission.inheritance_resume']
  },
  [AuditEventEnum.DELETE_COLLECTION]: {
    content: i18nT('account_team:log_delete_collection'),
    typeLabel: i18nT('account_team:delete_collection'),
    params: {} as AuditEventParamsType[AuditEventEnum.DELETE_COLLECTION]
  },
  [AuditEventEnum.RETRAIN_COLLECTION]: {
    content: i18nT('account_team:log_retrain_collection'),
    typeLabel: i18nT('account_team:retrain_collection'),
    params: {} as AuditEventParamsType[AuditEventEnum.RETRAIN_COLLECTION]
  },
  //Training
  ['dataset.training.retry']: {
    content: i18nT('account_team:log_dataset_training_retry'),
    typeLabel: i18nT('account_team:dataset_training_retry'),
    params: {} as DatasetAuditEventParamsType['dataset.training.retry']
  },
  ['dataset.collection.training.retry']: {
    content: i18nT('account_team:log_dataset_collection_training_retry'),
    typeLabel: i18nT('account_team:dataset_collection_training_retry'),
    params: {} as DatasetAuditEventParamsType['dataset.collection.training.retry']
  },
  ['dataset.training.task.retry']: {
    content: i18nT('account_team:log_dataset_training_task_retry'),
    typeLabel: i18nT('account_team:dataset_training_task_retry'),
    params: {} as DatasetAuditEventParamsType['dataset.training.task.retry']
  },
  ['dataset.training.record.delete']: {
    content: i18nT('account_team:log_dataset_training_record_delete'),
    typeLabel: i18nT('account_team:dataset_training_record_delete'),
    params: {} as DatasetAuditEventParamsType['dataset.training.record.delete']
  },
  ['dataset.index.rebuild']: {
    content: i18nT('account_team:log_dataset_index_rebuild'),
    typeLabel: i18nT('account_team:dataset_index_rebuild'),
    params: {} as DatasetAuditEventParamsType['dataset.index.rebuild']
  },
  //Data
  [AuditEventEnum.CREATE_DATA]: {
    content: i18nT('account_team:log_create_data'),
    typeLabel: i18nT('account_team:create_data'),
    params: {} as AuditEventParamsType[AuditEventEnum.CREATE_DATA]
  },
  [AuditEventEnum.UPDATE_DATA]: {
    content: i18nT('account_team:log_update_data'),
    typeLabel: i18nT('account_team:update_data'),
    params: {} as AuditEventParamsType[AuditEventEnum.UPDATE_DATA]
  },
  [AuditEventEnum.DELETE_DATA]: {
    content: i18nT('account_team:log_delete_data'),
    typeLabel: i18nT('account_team:delete_data'),
    params: {} as AuditEventParamsType[AuditEventEnum.DELETE_DATA]
  },
  //SearchTest
  [AuditEventEnum.SEARCH_TEST]: {
    content: i18nT('account_team:log_search_test'),
    typeLabel: i18nT('account_team:search_test'),
    params: {} as AuditEventParamsType[AuditEventEnum.SEARCH_TEST]
  },
  //Account
  [AuditEventEnum.CHANGE_PASSWORD]: {
    content: i18nT('account_team:log_change_password'),
    typeLabel: i18nT('account_team:change_password'),
    params: {} as AuditEventParamsType[AuditEventEnum.CHANGE_PASSWORD]
  },
  [AuditEventEnum.CHANGE_NOTIFICATION_SETTINGS]: {
    content: i18nT('account_team:log_change_notification_settings'),
    typeLabel: i18nT('account_team:change_notification_settings'),
    params: {} as AuditEventParamsType[AuditEventEnum.CHANGE_NOTIFICATION_SETTINGS]
  },
  [AuditEventEnum.CHANGE_MEMBER_NAME_ACCOUNT]: {
    content: i18nT('account_team:log_change_member_name_self'),
    typeLabel: i18nT('account_team:change_member_name_self'),
    params: {} as AuditEventParamsType[AuditEventEnum.CHANGE_MEMBER_NAME_ACCOUNT]
  },
  [AuditEventEnum.ACCOUNT_CANCELLATION_SUBMIT]: {
    content: i18nT('account_team:log_account_cancellation_submit'),
    typeLabel: i18nT('account_team:account_cancellation_submit'),
    params: {} as AuditEventParamsType[AuditEventEnum.ACCOUNT_CANCELLATION_SUBMIT]
  },
  [AuditEventEnum.ACCOUNT_CANCELLATION_CANCEL]: {
    content: i18nT('account_team:log_account_cancellation_cancel'),
    typeLabel: i18nT('account_team:account_cancellation_cancel'),
    params: {} as AuditEventParamsType[AuditEventEnum.ACCOUNT_CANCELLATION_CANCEL]
  },
  [AuditEventEnum.ACCOUNT_CANCELLATION_FINALIZE]: {
    content: i18nT('account_team:log_account_cancellation_finalize'),
    typeLabel: i18nT('account_team:account_cancellation_finalize'),
    params: {} as AuditEventParamsType[AuditEventEnum.ACCOUNT_CANCELLATION_FINALIZE]
  },
  [AuditEventEnum.PURCHASE_PLAN]: {
    content: i18nT('account_team:log_purchase_plan'),
    typeLabel: i18nT('account_team:purchase_plan'),
    params: {} as AuditEventParamsType[AuditEventEnum.PURCHASE_PLAN]
  },
  [AuditEventEnum.EXPORT_BILL_RECORDS]: {
    content: i18nT('account_team:log_export_bill_records'),
    typeLabel: i18nT('account_team:export_bill_records'),
    params: {} as AuditEventParamsType[AuditEventEnum.EXPORT_BILL_RECORDS]
  },
  [AuditEventEnum.CREATE_INVOICE]: {
    content: i18nT('account_team:log_create_invoice'),
    typeLabel: i18nT('account_team:create_invoice'),
    params: {} as AuditEventParamsType[AuditEventEnum.CREATE_INVOICE]
  },
  [AuditEventEnum.SET_INVOICE_HEADER]: {
    content: i18nT('account_team:log_set_invoice_header'),
    typeLabel: i18nT('account_team:set_invoice_header'),
    params: {} as AuditEventParamsType[AuditEventEnum.SET_INVOICE_HEADER]
  },
  [AuditEventEnum.START_ENTERPRISE_AUTH]: {
    content: i18nT('account_team:log_start_enterprise_auth'),
    typeLabel: i18nT('account_team:start_enterprise_auth'),
    params: {} as AuditEventParamsType[AuditEventEnum.START_ENTERPRISE_AUTH]
  },
  [AuditEventEnum.VERIFY_ENTERPRISE_AUTH_AMOUNT]: {
    content: i18nT('account_team:log_verify_enterprise_auth_amount'),
    typeLabel: i18nT('account_team:verify_enterprise_auth_amount'),
    params: {} as AuditEventParamsType[AuditEventEnum.VERIFY_ENTERPRISE_AUTH_AMOUNT]
  },
  [AuditEventEnum.RESET_ENTERPRISE_AUTH_TASK]: {
    content: i18nT('account_team:log_reset_enterprise_auth_task'),
    typeLabel: i18nT('account_team:reset_enterprise_auth_task'),
    params: {} as AuditEventParamsType[AuditEventEnum.RESET_ENTERPRISE_AUTH_TASK]
  },
  [AuditEventEnum.CREATE_API_KEY]: {
    content: i18nT('account_team:log_create_api_key'),
    typeLabel: i18nT('account_team:create_api_key'),
    params: {} as AuditEventParamsType[AuditEventEnum.CREATE_API_KEY]
  },
  [AuditEventEnum.UPDATE_API_KEY]: {
    content: i18nT('account_team:log_update_api_key'),
    typeLabel: i18nT('account_team:update_api_key'),
    params: {} as AuditEventParamsType[AuditEventEnum.UPDATE_API_KEY]
  },
  [AuditEventEnum.COPY_API_KEY]: {
    content: i18nT('account_team:log_copy_api_key'),
    typeLabel: i18nT('account_team:copy_api_key'),
    params: {} as AuditEventParamsType[AuditEventEnum.COPY_API_KEY]
  },
  [AuditEventEnum.DELETE_API_KEY]: {
    content: i18nT('account_team:log_delete_api_key'),
    typeLabel: i18nT('account_team:delete_api_key'),
    params: {} as AuditEventParamsType[AuditEventEnum.DELETE_API_KEY]
  },
  //Account sync / claim（V3 账号同步与登录侧认领；操作者均为 system）
  [AuditEventEnum.SYNC_ACCOUNT_CLAIM]: {
    content: i18nT('account_team:log_sync_account_claim'),
    typeLabel: i18nT('account_team:sync_account_claim'),
    params: {} as {
      syncId: string;
      claimedUsername: string;
      matchedBy: 'username' | 'contact';
    }
  },
  [AuditEventEnum.SSO_ACCOUNT_CLAIM]: {
    content: i18nT('account_team:log_sso_account_claim'),
    typeLabel: i18nT('account_team:sso_account_claim'),
    params: {} as {
      ssoSource: string;
      ssoId: string;
      claimedUsername: string;
    }
  },
  //Agent Skills
  [AuditEventEnum.CREATE_SKILL]: {
    content: i18nT('account_team:log_create_skill'),
    typeLabel: i18nT('account_team:create_skill'),
    params: {} as AuditEventParamsType[AuditEventEnum.CREATE_SKILL]
  },
  [AuditEventEnum.UPDATE_SKILL]: {
    content: i18nT('account_team:log_update_skill'),
    typeLabel: i18nT('account_team:update_skill'),
    params: {} as AuditEventParamsType[AuditEventEnum.UPDATE_SKILL]
  },
  [AuditEventEnum.DEPLOY_SKILL]: {
    content: i18nT('account_team:log_deploy_skill'),
    typeLabel: i18nT('account_team:deploy_skill'),
    params: {} as AuditEventParamsType[AuditEventEnum.DEPLOY_SKILL]
  },
  [AuditEventEnum.DELETE_SKILL]: {
    content: i18nT('account_team:log_delete_skill'),
    typeLabel: i18nT('account_team:delete_skill'),
    params: {} as AuditEventParamsType[AuditEventEnum.DELETE_SKILL]
  },
  [AuditEventEnum.IMPORT_SKILL]: {
    content: i18nT('account_team:log_import_skill'),
    typeLabel: i18nT('account_team:import_skill'),
    params: {} as AuditEventParamsType[AuditEventEnum.IMPORT_SKILL]
  },
  [AuditEventEnum.CREATE_SKILL_FOLDER]: {
    content: i18nT('account_team:log_create_skill_folder'),
    typeLabel: i18nT('account_team:create_skill_folder'),
    params: {} as AuditEventParamsType[AuditEventEnum.CREATE_SKILL_FOLDER]
  },
  [AuditEventEnum.EXPORT_SKILL]: {
    content: i18nT('account_team:log_export_skill'),
    typeLabel: i18nT('account_team:export_skill'),
    params: {} as AuditEventParamsType[AuditEventEnum.EXPORT_SKILL]
  },
  [AuditEventEnum.COPY_SKILL]: {
    content: i18nT('account_team:log_copy_skill'),
    typeLabel: i18nT('account_team:copy_skill'),
    params: {} as AuditEventParamsType[AuditEventEnum.COPY_SKILL]
  },
  [AuditEventEnum.MOVE_SKILL]: {
    content: i18nT('account_team:log_move_skill'),
    typeLabel: i18nT('account_team:move_skill'),
    params: {} as AuditEventParamsType[AuditEventEnum.MOVE_SKILL]
  },
  [AuditEventEnum.UPDATE_SKILL_COLLABORATOR]: {
    content: i18nT('account_team:log_update_skill_collaborator'),
    typeLabel: i18nT('account_team:update_skill_collaborator'),
    params: {} as AuditEventParamsType[AuditEventEnum.UPDATE_SKILL_COLLABORATOR]
  },
  [AuditEventEnum.DELETE_SKILL_COLLABORATOR]: {
    content: i18nT('account_team:log_delete_skill_collaborator'),
    typeLabel: i18nT('account_team:delete_skill_collaborator'),
    params: {} as AuditEventParamsType[AuditEventEnum.DELETE_SKILL_COLLABORATOR]
  },
  [AuditEventEnum.TRANSFER_SKILL_OWNERSHIP]: {
    content: i18nT('account_team:log_transfer_skill_ownership'),
    typeLabel: i18nT('account_team:transfer_skill_ownership'),
    params: {} as AuditEventParamsType[AuditEventEnum.TRANSFER_SKILL_OWNERSHIP]
  }
} as const;
