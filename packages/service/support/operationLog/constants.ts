import { OperationLogEventEnum } from '@fastgpt/global/support/operationLog/constants';
import { i18nT } from '../../../web/i18n/utils';

export const operationLogMap = {
  //Team
  [OperationLogEventEnum.LOGIN]: {
    content: i18nT('account_team:log_login'),
    typeLabel: i18nT('account_team:login'),
    params: {} as { name?: string }
  },
  [OperationLogEventEnum.CREATE_INVITATION_LINK]: {
    content: i18nT('account_team:log_create_invitation_link'),
    typeLabel: i18nT('account_team:create_invitation_link'),
    params: {} as { name?: string; link: string }
  },
  [OperationLogEventEnum.JOIN_TEAM]: {
    content: i18nT('account_team:log_join_team'),
    typeLabel: i18nT('account_team:join_team'),
    params: {} as { name?: string; link: string }
  },
  [OperationLogEventEnum.CHANGE_MEMBER_NAME]: {
    content: i18nT('account_team:log_change_member_name'),
    typeLabel: i18nT('account_team:change_member_name'),
    params: {} as { name?: string; memberName: string; newName: string }
  },
  [OperationLogEventEnum.KICK_OUT_TEAM]: {
    content: i18nT('account_team:log_kick_out_team'),
    typeLabel: i18nT('account_team:kick_out_team'),
    params: {} as { name?: string; memberName: string }
  },
  [OperationLogEventEnum.RECOVER_TEAM_MEMBER]: {
    content: i18nT('account_team:log_recover_team_member'),
    typeLabel: i18nT('account_team:recover_team_member'),
    params: {} as { name?: string; memberName: string }
  },
  [OperationLogEventEnum.CREATE_DEPARTMENT]: {
    content: i18nT('account_team:log_create_department'),
    typeLabel: i18nT('account_team:create_department'),
    params: {} as { name?: string; departmentName: string }
  },
  [OperationLogEventEnum.CHANGE_DEPARTMENT]: {
    content: i18nT('account_team:log_change_department'),
    typeLabel: i18nT('account_team:change_department_name'),
    params: {} as { name?: string; departmentName: string }
  },
  [OperationLogEventEnum.DELETE_DEPARTMENT]: {
    content: i18nT('account_team:log_delete_department'),
    typeLabel: i18nT('account_team:delete_department'),
    params: {} as { name?: string; departmentName: string }
  },
  [OperationLogEventEnum.RELOCATE_DEPARTMENT]: {
    content: i18nT('account_team:log_relocate_department'),
    typeLabel: i18nT('account_team:relocate_department'),
    params: {} as { name?: string; departmentName: string }
  },
  [OperationLogEventEnum.CREATE_GROUP]: {
    content: i18nT('account_team:log_create_group'),
    typeLabel: i18nT('account_team:create_group'),
    params: {} as { name?: string; groupName: string }
  },
  [OperationLogEventEnum.DELETE_GROUP]: {
    content: i18nT('account_team:log_delete_group'),
    typeLabel: i18nT('account_team:delete_group'),
    params: {} as { name?: string; groupName: string }
  },
  [OperationLogEventEnum.ASSIGN_PERMISSION]: {
    content: i18nT('account_team:log_assign_permission'),
    typeLabel: i18nT('account_team:assign_permission'),
    params: {} as { name?: string; objectName: string; permission: string }
  },
  //APP
  [OperationLogEventEnum.CREATE_APP]: {
    content: i18nT('account_team:log_create_app'),
    typeLabel: i18nT('account_team:create_app'),
    params: {} as { name?: string; appName: string; appType: string }
  },
  [OperationLogEventEnum.UPDATE_APP_INFO]: {
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
  [OperationLogEventEnum.MOVE_APP]: {
    content: i18nT('account_team:log_move_app'),
    typeLabel: i18nT('account_team:move_app'),
    params: {} as { name?: string; appName: string; targetFolderName: string; appType: string }
  },
  [OperationLogEventEnum.DELETE_APP]: {
    content: i18nT('account_team:log_delete_app'),
    typeLabel: i18nT('account_team:delete_app'),
    params: {} as { name?: string; appName: string; appType: string }
  },
  [OperationLogEventEnum.UPDATE_APP_COLLABORATOR]: {
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
  [OperationLogEventEnum.DELETE_APP_COLLABORATOR]: {
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
  [OperationLogEventEnum.TRANSFER_APP_OWNERSHIP]: {
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
  [OperationLogEventEnum.CREATE_APP_COPY]: {
    content: i18nT('account_team:log_create_app_copy'),
    typeLabel: i18nT('account_team:create_app_copy'),
    params: {} as { name?: string; appName: string; appType: string }
  },
  [OperationLogEventEnum.CREATE_APP_FOLDER]: {
    content: i18nT('account_team:log_create_app_folder'),
    typeLabel: i18nT('account_team:create_app_folder'),
    params: {} as { name?: string; folderName: string }
  },
  [OperationLogEventEnum.UPDATE_PUBLISH_APP]: {
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
  [OperationLogEventEnum.CREATE_APP_PUBLISH_CHANNEL]: {
    content: i18nT('account_team:log_create_app_publish_channel'),
    typeLabel: i18nT('account_team:create_app_publish_channel'),
    params: {} as { name?: string; appName: string; channelName: string; appType: string }
  },
  [OperationLogEventEnum.UPDATE_APP_PUBLISH_CHANNEL]: {
    content: i18nT('account_team:log_update_app_publish_channel'),
    typeLabel: i18nT('account_team:update_app_publish_channel'),
    params: {} as { name?: string; appName: string; channelName: string; appType: string }
  },
  [OperationLogEventEnum.DELETE_APP_PUBLISH_CHANNEL]: {
    content: i18nT('account_team:log_delete_app_publish_channel'),
    typeLabel: i18nT('account_team:delete_app_publish_channel'),
    params: {} as { name?: string; appName: string; channelName: string; appType: string }
  },
  [OperationLogEventEnum.EXPORT_APP_CHAT_LOG]: {
    content: i18nT('account_team:log_export_app_chat_log'),
    typeLabel: i18nT('account_team:export_app_chat_log'),
    params: {} as { name?: string; appName: string; appType: string }
  },
  //Dataset
  [OperationLogEventEnum.CREATE_DATASET]: {
    content: i18nT('account_team:log_create_dataset'),
    typeLabel: i18nT('account_team:create_dataset'),
    params: {} as { name?: string; datasetName: string; datasetType: string }
  },
  [OperationLogEventEnum.UPDATE_DATASET]: {
    content: i18nT('account_team:log_update_dataset'),
    typeLabel: i18nT('account_team:update_dataset'),
    params: {} as { name?: string; datasetName: string; datasetType: string }
  },
  [OperationLogEventEnum.DELETE_DATASET]: {
    content: i18nT('account_team:log_delete_dataset'),
    typeLabel: i18nT('account_team:delete_dataset'),
    params: {} as { name?: string; datasetName: string; datasetType: string }
  },
  [OperationLogEventEnum.MOVE_DATASET]: {
    content: i18nT('account_team:log_move_dataset'),
    typeLabel: i18nT('account_team:move_dataset'),
    params: {} as {
      name?: string;
      datasetName: string;
      targetFolderName: string;
      datasetType: string;
    }
  },
  [OperationLogEventEnum.UPDATE_DATASET_COLLABORATOR]: {
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
  [OperationLogEventEnum.DELETE_DATASET_COLLABORATOR]: {
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
  [OperationLogEventEnum.TRANSFER_DATASET_OWNERSHIP]: {
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
  [OperationLogEventEnum.EXPORT_DATASET]: {
    content: i18nT('account_team:log_export_dataset'),
    typeLabel: i18nT('account_team:export_dataset'),
    params: {} as { name?: string; datasetName: string; datasetType: string }
  },
  [OperationLogEventEnum.CREATE_DATASET_FOLDER]: {
    content: i18nT('account_team:log_create_dataset_folder'),
    typeLabel: i18nT('account_team:create_dataset_folder'),
    params: {} as { name?: string; folderName: string }
  },
  //Collection
  [OperationLogEventEnum.CREATE_COLLECTION]: {
    content: i18nT('account_team:log_create_collection'),
    typeLabel: i18nT('account_team:create_collection'),
    params: {} as {
      name?: string;
      collectionName: string;
      datasetName: string;
      datasetType: string;
    }
  },
  [OperationLogEventEnum.UPDATE_COLLECTION]: {
    content: i18nT('account_team:log_update_collection'),
    typeLabel: i18nT('account_team:update_collection'),
    params: {} as {
      name?: string;
      collectionName: string;
      datasetName: string;
      datasetType: string;
    }
  },
  [OperationLogEventEnum.DELETE_COLLECTION]: {
    content: i18nT('account_team:log_delete_collection'),
    typeLabel: i18nT('account_team:delete_collection'),
    params: {} as {
      name?: string;
      collectionName: string;
      datasetName: string;
      datasetType: string;
    }
  },
  [OperationLogEventEnum.RETRAIN_COLLECTION]: {
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
  [OperationLogEventEnum.CREATE_DATA]: {
    content: i18nT('account_team:log_create_data'),
    typeLabel: i18nT('account_team:create_data'),
    params: {} as {
      name?: string;
      collectionName: string;
      datasetName: string;
      datasetType: string;
    }
  },
  [OperationLogEventEnum.UPDATE_DATA]: {
    content: i18nT('account_team:log_update_data'),
    typeLabel: i18nT('account_team:update_data'),
    params: {} as {
      name?: string;
      collectionName: string;
      datasetName: string;
      datasetType: string;
    }
  },
  [OperationLogEventEnum.DELETE_DATA]: {
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
  [OperationLogEventEnum.SEARCH_TEST]: {
    content: i18nT('account_team:log_search_test'),
    typeLabel: i18nT('account_team:search_test'),
    params: {} as { name?: string; datasetName: string; datasetType: string }
  },
  //Account
  [OperationLogEventEnum.CHANGE_PASSWORD]: {
    content: i18nT('account_team:log_change_password'),
    typeLabel: i18nT('account_team:change_password'),
    params: {} as { name?: string }
  },
  [OperationLogEventEnum.CHANGE_NOTIFICATION_SETTINGS]: {
    content: i18nT('account_team:log_change_notification_settings'),
    typeLabel: i18nT('account_team:change_notification_settings'),
    params: {} as { name?: string }
  },
  [OperationLogEventEnum.CHANGE_MEMBER_NAME_ACCOUNT]: {
    content: i18nT('account_team:log_change_member_name_self'),
    typeLabel: i18nT('account_team:change_member_name_self'),
    params: {} as { name?: string; oldName: string; newName: string }
  },
  [OperationLogEventEnum.PURCHASE_PLAN]: {
    content: i18nT('account_team:log_purchase_plan'),
    typeLabel: i18nT('account_team:purchase_plan'),
    params: {} as { name?: string }
  },
  [OperationLogEventEnum.EXPORT_BILL_RECORDS]: {
    content: i18nT('account_team:log_export_bill_records'),
    typeLabel: i18nT('account_team:export_bill_records'),
    params: {} as { name?: string }
  },
  [OperationLogEventEnum.CREATE_INVOICE]: {
    content: i18nT('account_team:log_create_invoice'),
    typeLabel: i18nT('account_team:create_invoice'),
    params: {} as { name?: string }
  },
  [OperationLogEventEnum.SET_INVOICE_HEADER]: {
    content: i18nT('account_team:log_set_invoice_header'),
    typeLabel: i18nT('account_team:set_invoice_header'),
    params: {} as { name?: string }
  },
  [OperationLogEventEnum.CREATE_API_KEY]: {
    content: i18nT('account_team:log_create_api_key'),
    typeLabel: i18nT('account_team:create_api_key'),
    params: {} as { name?: string; keyName: string }
  },
  [OperationLogEventEnum.UPDATE_API_KEY]: {
    content: i18nT('account_team:log_update_api_key'),
    typeLabel: i18nT('account_team:update_api_key'),
    params: {} as { name?: string; keyName: string }
  },
  [OperationLogEventEnum.DELETE_API_KEY]: {
    content: i18nT('account_team:log_delete_api_key'),
    typeLabel: i18nT('account_team:delete_api_key'),
    params: {} as { name?: string; keyName: string }
  }
} as const;

export type TemplateParamsMap = {
  [K in OperationLogEventEnum]: (typeof operationLogMap)[K]['params'];
};
