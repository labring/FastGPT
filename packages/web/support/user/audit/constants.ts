import { AuditEventEnum, AdminAuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { i18nT } from '../../../i18n/utils';

export const adminAuditLogMap = {
  [AdminAuditEventEnum.ADMIN_LOGIN]: {
    content: i18nT('account_team:log_admin_login'),
    typeLabel: i18nT('account_team:admin_login'),
    params: {} as { name?: string }
  },
  [AdminAuditEventEnum.ADMIN_UPDATE_SYSTEM_MODAL]: {
    content: i18nT('account_team:log_admin_update_system_modal'),
    typeLabel: i18nT('account_team:admin_update_system_modal'),
    params: {} as { name?: string }
  },
  [AdminAuditEventEnum.ADMIN_SEND_SYSTEM_INFORM]: {
    content: i18nT('account_team:log_admin_send_system_inform'),
    typeLabel: i18nT('account_team:admin_send_system_inform'),
    params: {} as { name?: string; informTitle?: string; level?: string }
  },
  [AdminAuditEventEnum.ADMIN_ADD_USER]: {
    content: i18nT('account_team:log_admin_add_user'),
    typeLabel: i18nT('account_team:admin_add_user'),
    params: {} as { name?: string; userName: string }
  },
  [AdminAuditEventEnum.ADMIN_UPDATE_USER]: {
    content: i18nT('account_team:log_admin_update_user'),
    typeLabel: i18nT('account_team:admin_update_user'),
    params: {} as {
      userName?: string;
    }
  },
  [AdminAuditEventEnum.ADMIN_UPDATE_TEAM]: {
    content: i18nT('account_team:log_admin_update_team'),
    typeLabel: i18nT('account_team:admin_update_team'),
    params: {} as { name?: string; teamName: string; newTeamName: string; newBalance: string }
  },
  [AdminAuditEventEnum.ADMIN_ADD_PLAN]: {
    content: i18nT('account_team:log_admin_add_plan'),
    typeLabel: i18nT('account_team:admin_add_plan'),
    params: {} as { name?: string; teamId: string }
  },
  [AdminAuditEventEnum.ADMIN_UPDATE_PLAN]: {
    content: i18nT('account_team:log_admin_update_plan'),
    typeLabel: i18nT('account_team:admin_update_plan'),
    params: {} as { name?: string; teamId: string }
  },
  [AdminAuditEventEnum.ADMIN_FINISH_INVOICE]: {
    content: i18nT('account_team:log_admin_finish_invoice'),
    typeLabel: i18nT('account_team:admin_finish_invoice'),
    params: {} as { name?: string; teamName: string }
  },
  [AdminAuditEventEnum.ADMIN_UPDATE_SYSTEM_CONFIG]: {
    content: i18nT('account_team:log_admin_update_system_config'),
    typeLabel: i18nT('account_team:admin_update_system_config'),
    params: {} as { name?: string }
  },
  [AdminAuditEventEnum.ADMIN_CREATE_APP_TEMPLATE]: {
    content: i18nT('account_team:log_admin_create_app_template'),
    typeLabel: i18nT('account_team:admin_create_app_template'),
    params: {} as { name?: string; templateName: string }
  },
  [AdminAuditEventEnum.ADMIN_UPDATE_APP_TEMPLATE]: {
    content: i18nT('account_team:log_admin_update_app_template'),
    typeLabel: i18nT('account_team:admin_update_app_template'),
    params: {} as { name?: string; templateName: string }
  },
  [AdminAuditEventEnum.ADMIN_DELETE_APP_TEMPLATE]: {
    content: i18nT('account_team:log_admin_delete_app_template'),
    typeLabel: i18nT('account_team:admin_delete_app_template'),
    params: {} as { name?: string; templateName: string }
  },
  [AdminAuditEventEnum.ADMIN_SAVE_TEMPLATE_TYPE]: {
    content: i18nT('account_team:log_admin_save_template_type'),
    typeLabel: i18nT('account_team:admin_save_template_type'),
    params: {} as { name?: string; typeName: string }
  },
  [AdminAuditEventEnum.ADMIN_DELETE_TEMPLATE_TYPE]: {
    content: i18nT('account_team:log_admin_delete_template_type'),
    typeLabel: i18nT('account_team:admin_delete_template_type'),
    params: {} as { name?: string; typeName: string }
  },
  [AdminAuditEventEnum.ADMIN_CREATE_PLUGIN]: {
    content: i18nT('account_team:log_admin_create_plugin'),
    typeLabel: i18nT('account_team:admin_create_plugin'),
    params: {} as { name?: string; pluginName: string }
  },
  [AdminAuditEventEnum.ADMIN_UPDATE_PLUGIN]: {
    content: i18nT('account_team:log_admin_update_plugin'),
    typeLabel: i18nT('account_team:admin_update_plugin'),
    params: {} as { name?: string; pluginName: string }
  },
  [AdminAuditEventEnum.ADMIN_DELETE_PLUGIN]: {
    content: i18nT('account_team:log_admin_delete_plugin'),
    typeLabel: i18nT('account_team:admin_delete_plugin'),
    params: {} as { name?: string; pluginName: string }
  },
  [AdminAuditEventEnum.ADMIN_CREATE_PLUGIN_GROUP]: {
    content: i18nT('account_team:log_admin_create_plugin_group'),
    typeLabel: i18nT('account_team:admin_create_plugin_group'),
    params: {} as { name?: string; groupName: string }
  },
  [AdminAuditEventEnum.ADMIN_UPDATE_PLUGIN_GROUP]: {
    content: i18nT('account_team:log_admin_update_plugin_group'),
    typeLabel: i18nT('account_team:admin_update_plugin_group'),
    params: {} as { name?: string; groupName: string }
  },
  [AdminAuditEventEnum.ADMIN_DELETE_PLUGIN_GROUP]: {
    content: i18nT('account_team:log_admin_delete_plugin_group'),
    typeLabel: i18nT('account_team:admin_delete_plugin_group'),
    params: {} as { name?: string; groupName: string }
  }
};

export const auditLogMap = {
  //Team
  [AuditEventEnum.LOGIN]: {
    content: i18nT('account_team:log_login'),
    typeLabel: i18nT('account_team:login'),
    params: {} as { name?: string }
  },
  [AuditEventEnum.CREATE_INVITATION_LINK]: {
    content: i18nT('account_team:log_create_invitation_link'),
    typeLabel: i18nT('account_team:create_invitation_link'),
    params: {} as { name?: string; link: string }
  },
  [AuditEventEnum.JOIN_TEAM]: {
    content: i18nT('account_team:log_join_team'),
    typeLabel: i18nT('account_team:join_team'),
    params: {} as { name?: string; link: string }
  },
  [AuditEventEnum.CHANGE_MEMBER_NAME]: {
    content: i18nT('account_team:log_change_member_name'),
    typeLabel: i18nT('account_team:change_member_name'),
    params: {} as { name?: string; memberName: string; newName: string }
  },
  [AuditEventEnum.KICK_OUT_TEAM]: {
    content: i18nT('account_team:log_kick_out_team'),
    typeLabel: i18nT('account_team:kick_out_team'),
    params: {} as { name?: string; memberName: string }
  },
  [AuditEventEnum.RECOVER_TEAM_MEMBER]: {
    content: i18nT('account_team:log_recover_team_member'),
    typeLabel: i18nT('account_team:recover_team_member'),
    params: {} as { name?: string; memberName: string }
  },
  [AuditEventEnum.CREATE_DEPARTMENT]: {
    content: i18nT('account_team:log_create_department'),
    typeLabel: i18nT('account_team:create_department'),
    params: {} as { name?: string; departmentName: string }
  },
  [AuditEventEnum.CHANGE_DEPARTMENT]: {
    content: i18nT('account_team:log_change_department'),
    typeLabel: i18nT('account_team:change_department_name'),
    params: {} as { name?: string; departmentName: string }
  },
  [AuditEventEnum.DELETE_DEPARTMENT]: {
    content: i18nT('account_team:log_delete_department'),
    typeLabel: i18nT('account_team:delete_department'),
    params: {} as { name?: string; departmentName: string }
  },
  [AuditEventEnum.RELOCATE_DEPARTMENT]: {
    content: i18nT('account_team:log_relocate_department'),
    typeLabel: i18nT('account_team:relocate_department'),
    params: {} as { name?: string; departmentName: string }
  },
  [AuditEventEnum.CREATE_GROUP]: {
    content: i18nT('account_team:log_create_group'),
    typeLabel: i18nT('account_team:create_group'),
    params: {} as { name?: string; groupName: string }
  },
  [AuditEventEnum.DELETE_GROUP]: {
    content: i18nT('account_team:log_delete_group'),
    typeLabel: i18nT('account_team:delete_group'),
    params: {} as { name?: string; groupName: string }
  },
  [AuditEventEnum.ASSIGN_PERMISSION]: {
    content: i18nT('account_team:log_assign_permission'),
    typeLabel: i18nT('account_team:assign_permission'),
    params: {} as { name?: string; objectName: string; permission: string }
  },
  //APP
  [AuditEventEnum.CREATE_APP]: {
    content: i18nT('account_team:log_create_app'),
    typeLabel: i18nT('account_team:create_app'),
    params: {} as { name?: string; appName: string; appType: string }
  },
  [AuditEventEnum.UPDATE_APP_INFO]: {
    content: i18nT('account_team:log_update_app_info'),
    typeLabel: i18nT('account_team:update_app_info'),
    params: {} as {
      name?: string;
      appName: string;
      newItemNames: string[];
      newItemValues: string[];
      appType: string;
    }
  },
  [AuditEventEnum.MOVE_APP]: {
    content: i18nT('account_team:log_move_app'),
    typeLabel: i18nT('account_team:move_app'),
    params: {} as { name?: string; appName: string; targetFolderName: string; appType: string }
  },
  [AuditEventEnum.DELETE_APP]: {
    content: i18nT('account_team:log_delete_app'),
    typeLabel: i18nT('account_team:delete_app'),
    params: {} as { name?: string; appName: string; appType: string }
  },
  [AuditEventEnum.UPDATE_APP_COLLABORATOR]: {
    content: i18nT('account_team:log_update_app_collaborator'),
    typeLabel: i18nT('account_team:update_app_collaborator'),
    params: {} as {
      name?: string;
      appName: string;
      appType: string;
      tmbList: string[];
      groupList: string[];
      orgList: string[];
      permission: string;
    }
  },
  [AuditEventEnum.DELETE_APP_COLLABORATOR]: {
    content: i18nT('account_team:log_delete_app_collaborator'),
    typeLabel: i18nT('account_team:delete_app_collaborator'),
    params: {} as {
      name?: string;
      appName: string;
      appType: string;
      itemName: string;
      itemValueName: string;
    }
  },
  [AuditEventEnum.TRANSFER_APP_OWNERSHIP]: {
    content: i18nT('account_team:log_transfer_app_ownership'),
    typeLabel: i18nT('account_team:transfer_app_ownership'),
    params: {} as {
      name?: string;
      appName: string;
      appType: string;
      oldOwnerName: string;
      newOwnerName: string;
    }
  },
  [AuditEventEnum.CREATE_APP_COPY]: {
    content: i18nT('account_team:log_create_app_copy'),
    typeLabel: i18nT('account_team:create_app_copy'),
    params: {} as { name?: string; appName: string; appType: string }
  },
  [AuditEventEnum.CREATE_APP_FOLDER]: {
    content: i18nT('account_team:log_create_app_folder'),
    typeLabel: i18nT('account_team:create_app_folder'),
    params: {} as { name?: string; folderName: string }
  },
  [AuditEventEnum.UPDATE_PUBLISH_APP]: {
    content: i18nT('account_team:log_update_publish_app'),
    typeLabel: i18nT('account_team:update_publish_app'),
    params: {} as {
      name?: string;
      operationName: string;
      appName: string;
      appId: string;
      appType: string;
    }
  },
  [AuditEventEnum.CREATE_APP_PUBLISH_CHANNEL]: {
    content: i18nT('account_team:log_create_app_publish_channel'),
    typeLabel: i18nT('account_team:create_app_publish_channel'),
    params: {} as { name?: string; appName: string; channelName: string; appType: string }
  },
  [AuditEventEnum.UPDATE_APP_PUBLISH_CHANNEL]: {
    content: i18nT('account_team:log_update_app_publish_channel'),
    typeLabel: i18nT('account_team:update_app_publish_channel'),
    params: {} as { name?: string; appName: string; channelName: string; appType: string }
  },
  [AuditEventEnum.DELETE_APP_PUBLISH_CHANNEL]: {
    content: i18nT('account_team:log_delete_app_publish_channel'),
    typeLabel: i18nT('account_team:delete_app_publish_channel'),
    params: {} as { name?: string; appName: string; channelName: string; appType: string }
  },
  [AuditEventEnum.EXPORT_APP_CHAT_LOG]: {
    content: i18nT('account_team:log_export_app_chat_log'),
    typeLabel: i18nT('account_team:export_app_chat_log'),
    params: {} as { name?: string; appName: string; appType: string }
  },
  //Dataset
  [AuditEventEnum.CREATE_DATASET]: {
    content: i18nT('account_team:log_create_dataset'),
    typeLabel: i18nT('account_team:create_dataset'),
    params: {} as { name?: string; datasetName: string; datasetType: string }
  },
  [AuditEventEnum.UPDATE_DATASET]: {
    content: i18nT('account_team:log_update_dataset'),
    typeLabel: i18nT('account_team:update_dataset'),
    params: {} as { name?: string; datasetName: string; datasetType: string }
  },
  [AuditEventEnum.DELETE_DATASET]: {
    content: i18nT('account_team:log_delete_dataset'),
    typeLabel: i18nT('account_team:delete_dataset'),
    params: {} as { name?: string; datasetName: string; datasetType: string }
  },
  [AuditEventEnum.MOVE_DATASET]: {
    content: i18nT('account_team:log_move_dataset'),
    typeLabel: i18nT('account_team:move_dataset'),
    params: {} as {
      name?: string;
      datasetName: string;
      targetFolderName: string;
      datasetType: string;
    }
  },
  [AuditEventEnum.UPDATE_DATASET_COLLABORATOR]: {
    content: i18nT('account_team:log_update_dataset_collaborator'),
    typeLabel: i18nT('account_team:update_dataset_collaborator'),
    params: {} as {
      name?: string;
      datasetName: string;
      datasetType: string;
      tmbList: string[];
      groupList: string[];
      orgList: string[];
      permission: string;
    }
  },
  [AuditEventEnum.DELETE_DATASET_COLLABORATOR]: {
    content: i18nT('account_team:log_delete_dataset_collaborator'),
    typeLabel: i18nT('account_team:delete_dataset_collaborator'),
    params: {} as {
      name?: string;
      datasetName: string;
      datasetType: string;
      itemName: string;
      itemValueName: string;
    }
  },
  [AuditEventEnum.TRANSFER_DATASET_OWNERSHIP]: {
    content: i18nT('account_team:log_transfer_dataset_ownership'),
    typeLabel: i18nT('account_team:transfer_dataset_ownership'),
    params: {} as {
      name?: string;
      datasetName: string;
      datasetType: string;
      oldOwnerName: string;
      newOwnerName: string;
    }
  },
  [AuditEventEnum.EXPORT_DATASET]: {
    content: i18nT('account_team:log_export_dataset'),
    typeLabel: i18nT('account_team:export_dataset'),
    params: {} as { name?: string; datasetName: string; datasetType: string }
  },
  [AuditEventEnum.CREATE_DATASET_FOLDER]: {
    content: i18nT('account_team:log_create_dataset_folder'),
    typeLabel: i18nT('account_team:create_dataset_folder'),
    params: {} as { name?: string; folderName: string }
  },
  //Collection
  [AuditEventEnum.CREATE_COLLECTION]: {
    content: i18nT('account_team:log_create_collection'),
    typeLabel: i18nT('account_team:create_collection'),
    params: {} as {
      name?: string;
      collectionName: string;
      datasetName: string;
      datasetType: string;
    }
  },
  [AuditEventEnum.UPDATE_COLLECTION]: {
    content: i18nT('account_team:log_update_collection'),
    typeLabel: i18nT('account_team:update_collection'),
    params: {} as {
      name?: string;
      collectionName: string;
      datasetName: string;
      datasetType: string;
    }
  },
  [AuditEventEnum.DELETE_COLLECTION]: {
    content: i18nT('account_team:log_delete_collection'),
    typeLabel: i18nT('account_team:delete_collection'),
    params: {} as {
      name?: string;
      collectionName: string;
      datasetName: string;
      datasetType: string;
    }
  },
  [AuditEventEnum.RETRAIN_COLLECTION]: {
    content: i18nT('account_team:log_retrain_collection'),
    typeLabel: i18nT('account_team:retrain_collection'),
    params: {} as {
      name?: string;
      collectionName: string;
      datasetName: string;
      datasetType: string;
    }
  },
  //Data
  [AuditEventEnum.CREATE_DATA]: {
    content: i18nT('account_team:log_create_data'),
    typeLabel: i18nT('account_team:create_data'),
    params: {} as {
      name?: string;
      collectionName: string;
      datasetName: string;
      datasetType: string;
    }
  },
  [AuditEventEnum.UPDATE_DATA]: {
    content: i18nT('account_team:log_update_data'),
    typeLabel: i18nT('account_team:update_data'),
    params: {} as {
      name?: string;
      collectionName: string;
      datasetName: string;
      datasetType: string;
    }
  },
  [AuditEventEnum.DELETE_DATA]: {
    content: i18nT('account_team:log_delete_data'),
    typeLabel: i18nT('account_team:delete_data'),
    params: {} as {
      name?: string;
      collectionName: string;
      datasetName: string;
      datasetType: string;
    }
  },
  //SearchTest
  [AuditEventEnum.SEARCH_TEST]: {
    content: i18nT('account_team:log_search_test'),
    typeLabel: i18nT('account_team:search_test'),
    params: {} as { name?: string; datasetName: string; datasetType: string }
  },
  //Account
  [AuditEventEnum.CHANGE_PASSWORD]: {
    content: i18nT('account_team:log_change_password'),
    typeLabel: i18nT('account_team:change_password'),
    params: {} as { name?: string }
  },
  [AuditEventEnum.CHANGE_NOTIFICATION_SETTINGS]: {
    content: i18nT('account_team:log_change_notification_settings'),
    typeLabel: i18nT('account_team:change_notification_settings'),
    params: {} as { name?: string }
  },
  [AuditEventEnum.CHANGE_MEMBER_NAME_ACCOUNT]: {
    content: i18nT('account_team:log_change_member_name_self'),
    typeLabel: i18nT('account_team:change_member_name_self'),
    params: {} as { name?: string; oldName: string; newName: string }
  },
  [AuditEventEnum.PURCHASE_PLAN]: {
    content: i18nT('account_team:log_purchase_plan'),
    typeLabel: i18nT('account_team:purchase_plan'),
    params: {} as { name?: string }
  },
  [AuditEventEnum.EXPORT_BILL_RECORDS]: {
    content: i18nT('account_team:log_export_bill_records'),
    typeLabel: i18nT('account_team:export_bill_records'),
    params: {} as { name?: string }
  },
  [AuditEventEnum.CREATE_INVOICE]: {
    content: i18nT('account_team:log_create_invoice'),
    typeLabel: i18nT('account_team:create_invoice'),
    params: {} as { name?: string }
  },
  [AuditEventEnum.SET_INVOICE_HEADER]: {
    content: i18nT('account_team:log_set_invoice_header'),
    typeLabel: i18nT('account_team:set_invoice_header'),
    params: {} as { name?: string }
  },
  [AuditEventEnum.CREATE_API_KEY]: {
    content: i18nT('account_team:log_create_api_key'),
    typeLabel: i18nT('account_team:create_api_key'),
    params: {} as { name?: string; keyName: string }
  },
  [AuditEventEnum.UPDATE_API_KEY]: {
    content: i18nT('account_team:log_update_api_key'),
    typeLabel: i18nT('account_team:update_api_key'),
    params: {} as { name?: string; keyName: string }
  },
  [AuditEventEnum.DELETE_API_KEY]: {
    content: i18nT('account_team:log_delete_api_key'),
    typeLabel: i18nT('account_team:delete_api_key'),
    params: {} as { name?: string; keyName: string }
  }
} as const;
