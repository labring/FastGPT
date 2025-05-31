// Operation log metadata processors
import { OperationLogEventEnum } from '@fastgpt/global/support/operationLog/constants';
import { teamProcessors, processAssignPermissionMetadata } from './teamProcessors';
import { createAppProcessors } from './appProcessors';
import { createDatasetProcessors } from './datasetProcessors';
import { createCollectionProcessors } from './collectionProcessors';
import { createDataProcessors } from './dataProcessors';
import { createAccountProcessors } from './accountProcessors';

export type MetadataProcessor = (metadata: any) => any;

export const createMetadataProcessorMap = (
  t: any
): Record<OperationLogEventEnum, MetadataProcessor> => {
  const appProcessors = createAppProcessors(t);
  const datasetProcessors = createDatasetProcessors(t);
  const collectionProcessors = createCollectionProcessors(t);
  const dataProcessors = createDataProcessors(t);
  const accountProcessors = createAccountProcessors();

  return {
    // Team
    [OperationLogEventEnum.LOGIN]: teamProcessors.LOGIN,
    [OperationLogEventEnum.CREATE_INVITATION_LINK]: teamProcessors.CREATE_INVITATION_LINK,
    [OperationLogEventEnum.JOIN_TEAM]: teamProcessors.JOIN_TEAM,
    [OperationLogEventEnum.CHANGE_MEMBER_NAME]: teamProcessors.CHANGE_MEMBER_NAME,
    [OperationLogEventEnum.KICK_OUT_TEAM]: teamProcessors.KICK_OUT_TEAM,
    [OperationLogEventEnum.RECOVER_TEAM_MEMBER]: teamProcessors.RECOVER_TEAM_MEMBER,
    [OperationLogEventEnum.CREATE_DEPARTMENT]: teamProcessors.CREATE_DEPARTMENT,
    [OperationLogEventEnum.CHANGE_DEPARTMENT]: teamProcessors.CHANGE_DEPARTMENT,
    [OperationLogEventEnum.DELETE_DEPARTMENT]: teamProcessors.DELETE_DEPARTMENT,
    [OperationLogEventEnum.RELOCATE_DEPARTMENT]: teamProcessors.RELOCATE_DEPARTMENT,
    [OperationLogEventEnum.CREATE_GROUP]: teamProcessors.CREATE_GROUP,
    [OperationLogEventEnum.DELETE_GROUP]: teamProcessors.DELETE_GROUP,
    [OperationLogEventEnum.ASSIGN_PERMISSION]: processAssignPermissionMetadata,

    // App相关操作
    [OperationLogEventEnum.CREATE_APP]: appProcessors.CREATE_APP,
    [OperationLogEventEnum.UPDATE_APP_INFO]: appProcessors.UPDATE_APP_INFO,
    [OperationLogEventEnum.MOVE_APP]: appProcessors.MOVE_APP,
    [OperationLogEventEnum.DELETE_APP]: appProcessors.DELETE_APP,
    [OperationLogEventEnum.UPDATE_APP_COLLABORATOR]: appProcessors.UPDATE_APP_COLLABORATOR,
    [OperationLogEventEnum.DELETE_APP_COLLABORATOR]: appProcessors.DELETE_APP_COLLABORATOR,
    [OperationLogEventEnum.TRANSFER_APP_OWNERSHIP]: appProcessors.TRANSFER_APP_OWNERSHIP,
    [OperationLogEventEnum.CREATE_APP_COPY]: appProcessors.CREATE_APP_COPY,
    [OperationLogEventEnum.CREATE_APP_FOLDER]: appProcessors.CREATE_APP_FOLDER,
    [OperationLogEventEnum.UPDATE_PUBLISH_APP]: appProcessors.UPDATE_PUBLISH_APP,
    [OperationLogEventEnum.CREATE_APP_PUBLISH_CHANNEL]: appProcessors.CREATE_APP_PUBLISH_CHANNEL,
    [OperationLogEventEnum.UPDATE_APP_PUBLISH_CHANNEL]: appProcessors.UPDATE_APP_PUBLISH_CHANNEL,
    [OperationLogEventEnum.DELETE_APP_PUBLISH_CHANNEL]: appProcessors.DELETE_APP_PUBLISH_CHANNEL,
    [OperationLogEventEnum.EXPORT_APP_CHAT_LOG]: appProcessors.EXPORT_APP_CHAT_LOG,

    // Dataset
    [OperationLogEventEnum.CREATE_DATASET]: datasetProcessors.CREATE_DATASET,
    [OperationLogEventEnum.UPDATE_DATASET]: datasetProcessors.UPDATE_DATASET,
    [OperationLogEventEnum.DELETE_DATASET]: datasetProcessors.DELETE_DATASET,
    [OperationLogEventEnum.MOVE_DATASET]: datasetProcessors.MOVE_DATASET,
    [OperationLogEventEnum.UPDATE_DATASET_COLLABORATOR]:
      datasetProcessors.UPDATE_DATASET_COLLABORATOR,
    [OperationLogEventEnum.DELETE_DATASET_COLLABORATOR]:
      datasetProcessors.DELETE_DATASET_COLLABORATOR,
    [OperationLogEventEnum.TRANSFER_DATASET_OWNERSHIP]:
      datasetProcessors.TRANSFER_DATASET_OWNERSHIP,
    [OperationLogEventEnum.EXPORT_DATASET]: datasetProcessors.EXPORT_DATASET,
    [OperationLogEventEnum.CREATE_DATASET_FOLDER]: datasetProcessors.CREATE_DATASET_FOLDER,

    // Collection
    [OperationLogEventEnum.CREATE_COLLECTION]: collectionProcessors.CREATE_COLLECTION,
    [OperationLogEventEnum.UPDATE_COLLECTION]: collectionProcessors.UPDATE_COLLECTION,
    [OperationLogEventEnum.DELETE_COLLECTION]: collectionProcessors.DELETE_COLLECTION,
    [OperationLogEventEnum.RETRAIN_COLLECTION]: collectionProcessors.RETRAIN_COLLECTION,

    // Data
    [OperationLogEventEnum.CREATE_DATA]: dataProcessors.CREATE_DATA,
    [OperationLogEventEnum.UPDATE_DATA]: dataProcessors.UPDATE_DATA,
    [OperationLogEventEnum.DELETE_DATA]: dataProcessors.DELETE_DATA,
    [OperationLogEventEnum.SEARCH_TEST]: dataProcessors.SEARCH_TEST,

    // Account
    [OperationLogEventEnum.CHANGE_PASSWORD]: accountProcessors.CHANGE_PASSWORD,
    [OperationLogEventEnum.CHANGE_NOTIFICATION_SETTINGS]:
      accountProcessors.CHANGE_NOTIFICATION_SETTINGS,
    [OperationLogEventEnum.CHANGE_MEMBER_NAME_ACCOUNT]:
      accountProcessors.CHANGE_MEMBER_NAME_ACCOUNT,
    [OperationLogEventEnum.PURCHASE_PLAN]: accountProcessors.PURCHASE_PLAN,
    [OperationLogEventEnum.EXPORT_BILL_RECORDS]: accountProcessors.EXPORT_BILL_RECORDS,
    [OperationLogEventEnum.CREATE_INVOICE]: accountProcessors.CREATE_INVOICE,
    [OperationLogEventEnum.SET_INVOICE_HEADER]: accountProcessors.SET_INVOICE_HEADER,
    [OperationLogEventEnum.CREATE_API_KEY]: accountProcessors.CREATE_API_KEY,
    [OperationLogEventEnum.UPDATE_API_KEY]: accountProcessors.UPDATE_API_KEY,
    [OperationLogEventEnum.DELETE_API_KEY]: accountProcessors.DELETE_API_KEY
  };
};

export * from './teamProcessors';
export * from './appProcessors';
export * from './datasetProcessors';
export * from './collectionProcessors';
export * from './dataProcessors';
export * from './accountProcessors';
