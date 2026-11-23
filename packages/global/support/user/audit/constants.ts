import type { ApiKeyAuditParams } from '../../openapi/schema';
import { DatasetAuditEventEnum } from '../../../core/dataset/audit/constants/event';

export enum AdminAuditEventEnum {
  ADMIN_LOGIN = 'ADMIN_LOGIN',

  ADMIN_ADD_USER = 'ADMIN_ADD_USER',
  ADMIN_UPDATE_USER = 'ADMIN_UPDATE_USER',
  ADMIN_DELETE_USER = 'ADMIN_DELETE_USER',
  ADMIN_UPDATE_TEAM = 'ADMIN_UPDATE_TEAM',
  ADMIN_SWITCH_TEAM = 'ADMIN_SWITCH_TEAM',
  ADMIN_ADD_PLAN = 'ADMIN_ADD_PLAN',
  ADMIN_UPDATE_PLAN = 'ADMIN_UPDATE_PLAN',
  ADMIN_FINISH_INVOICE = 'ADMIN_FINISH_INVOICE',
  ADMIN_UPDATE_SYSTEM_CONFIG = 'ADMIN_UPDATE_SYSTEM_CONFIG',
  ADMIN_CREATE_APP_TEMPLATE = 'ADMIN_CREATE_APP_TEMPLATE',
  ADMIN_UPDATE_APP_TEMPLATE = 'ADMIN_UPDATE_APP_TEMPLATE',
  ADMIN_DELETE_APP_TEMPLATE = 'ADMIN_DELETE_APP_TEMPLATE',
  ADMIN_SAVE_TEMPLATE_TYPE = 'ADMIN_SAVE_TEMPLATE_TYPE',
  ADMIN_DELETE_TEMPLATE_TYPE = 'ADMIN_DELETE_TEMPLATE_TYPE',
  ADMIN_CREATE_PLUGIN = 'ADMIN_CREATE_PLUGIN',
  ADMIN_UPDATE_PLUGIN = 'ADMIN_UPDATE_PLUGIN',
  ADMIN_DELETE_PLUGIN = 'ADMIN_DELETE_PLUGIN',
  ADMIN_CREATE_PLUGIN_GROUP = 'ADMIN_CREATE_PLUGIN_GROUP',
  ADMIN_UPDATE_PLUGIN_GROUP = 'ADMIN_UPDATE_PLUGIN_GROUP',
  ADMIN_DELETE_PLUGIN_GROUP = 'ADMIN_DELETE_PLUGIN_GROUP',

  // Inform
  ADMIN_UPDATE_SYSTEM_MODAL = 'ADMIN_UPDATE_SYSTEM_MODAL',
  ADMIN_SEND_SYSTEM_INFORM = 'ADMIN_SEND_SYSTEM_INFORM',
  ADMIN_UPDATE_ACTIVITY_AD = 'ADMIN_UPDATE_ACTIVITY_AD',
  ADMIN_UPDATE_OPERATIONAL_AD = 'ADMIN_UPDATE_OPERATIONAL_AD',

  // Moderation
  ADMIN_ENABLE_MODERATION_PLUGIN = 'ADMIN_ENABLE_MODERATION_PLUGIN',
  ADMIN_DISABLE_MODERATION_PLUGIN = 'ADMIN_DISABLE_MODERATION_PLUGIN',
  ADMIN_INSTALL_MODERATION_PLUGIN = 'ADMIN_INSTALL_MODERATION_PLUGIN',
  ADMIN_UNINSTALL_MODERATION_PLUGIN = 'ADMIN_UNINSTALL_MODERATION_PLUGIN',
  ADMIN_UPDATE_MODERATION_PLUGIN_CONFIG = 'ADMIN_UPDATE_MODERATION_PLUGIN_CONFIG',
  ADMIN_UPDATE_MODERATION_POLICY = 'ADMIN_UPDATE_MODERATION_POLICY'
}

export enum AuditEventEnum {
  //Team
  LOGIN = 'LOGIN',
  CREATE_INVITATION_LINK = 'CREATE_INVITATION_LINK',
  JOIN_TEAM = 'JOIN_TEAM',
  CHANGE_MEMBER_NAME = 'CHANGE_MEMBER_NAME',
  KICK_OUT_TEAM = 'KICK_OUT_TEAM',
  RECOVER_TEAM_MEMBER = 'RECOVER_TEAM_MEMBER',
  CREATE_DEPARTMENT = 'CREATE_DEPARTMENT',
  CHANGE_DEPARTMENT = 'CHANGE_DEPARTMENT',
  DELETE_DEPARTMENT = 'DELETE_DEPARTMENT',
  RELOCATE_DEPARTMENT = 'RELOCATE_DEPARTMENT',
  CREATE_GROUP = 'CREATE_GROUP',
  DELETE_GROUP = 'DELETE_GROUP',
  ASSIGN_PERMISSION = 'ASSIGN_PERMISSION',
  TRANSFER_TEAM_OWNERSHIP = 'TRANSFER_TEAM_OWNERSHIP',
  EXPORT_AUDIT_LOGS = 'EXPORT_AUDIT_LOGS',
  // Resource permission
  RESUME_INHERIT_PERMISSION = 'RESUME_INHERIT_PERMISSION',
  //APP
  CREATE_APP = 'CREATE_APP',
  UPDATE_APP_INFO = 'UPDATE_APP_INFO',
  MOVE_APP = 'MOVE_APP',
  DELETE_APP = 'DELETE_APP',
  UPDATE_APP_COLLABORATOR = 'UPDATE_APP_COLLABORATOR',
  DELETE_APP_COLLABORATOR = 'DELETE_APP_COLLABORATOR',
  TRANSFER_APP_OWNERSHIP = 'TRANSFER_APP_OWNERSHIP',
  CREATE_APP_COPY = 'CREATE_APP_COPY',
  CREATE_APP_FOLDER = 'CREATE_APP_FOLDER',
  SAVE_APP = 'SAVE_APP',
  PUBLISH_APP = 'PUBLISH_APP',
  /** @deprecated 应用保存与发布已拆分为 SAVE_APP 和 PUBLISH_APP，保留枚举仅为兼容历史日志展示。 */
  UPDATE_PUBLISH_APP = 'UPDATE_PUBLISH_APP',
  CREATE_APP_PUBLISH_CHANNEL = 'CREATE_APP_PUBLISH_CHANNEL',
  UPDATE_APP_PUBLISH_CHANNEL = 'UPDATE_APP_PUBLISH_CHANNEL',
  DELETE_APP_PUBLISH_CHANNEL = 'DELETE_APP_PUBLISH_CHANNEL',
  EXPORT_APP_CHAT_LOG = 'EXPORT_APP_CHAT_LOG',
  CREATE_EVALUATION = 'CREATE_EVALUATION',
  EXPORT_EVALUATION = 'EXPORT_EVALUATION',
  DELETE_EVALUATION = 'DELETE_EVALUATION',
  //Dataset
  CREATE_DATASET = 'CREATE_DATASET',
  /** @deprecated 知识库配置变更已统一由 DatasetAuditEventEnum.DATASET_CONFIG_UPDATE 记录，保留枚举仅为兼容历史日志展示。 */
  UPDATE_DATASET = 'UPDATE_DATASET',
  DELETE_DATASET = 'DELETE_DATASET',
  MOVE_DATASET = 'MOVE_DATASET',
  UPDATE_DATASET_COLLABORATOR = 'UPDATE_DATASET_COLLABORATOR',
  DELETE_DATASET_COLLABORATOR = 'DELETE_DATASET_COLLABORATOR',
  TRANSFER_DATASET_OWNERSHIP = 'TRANSFER_DATASET_OWNERSHIP',
  EXPORT_DATASET = 'EXPORT_DATASET',
  CREATE_DATASET_FOLDER = 'CREATE_DATASET_FOLDER',
  //Collection
  /** @deprecated 创建集合已统一由 DatasetAuditEventEnum.DATASET_COLLECTION_CREATE 记录，保留枚举仅为兼容历史日志展示。 */
  CREATE_COLLECTION = 'CREATE_COLLECTION',
  /** @deprecated 集合更新已拆分为 rename/move/enable/disable 独立事件记录，保留枚举仅为兼容历史日志展示。 */
  UPDATE_COLLECTION = 'UPDATE_COLLECTION',
  DELETE_COLLECTION = 'DELETE_COLLECTION',
  RETRAIN_COLLECTION = 'RETRAIN_COLLECTION',
  //Data
  CREATE_DATA = 'CREATE_DATA',
  UPDATE_DATA = 'UPDATE_DATA',
  DELETE_DATA = 'DELETE_DATA',
  //SearchTest
  SEARCH_TEST = 'SEARCH_TEST',
  //Account
  CHANGE_PASSWORD = 'CHANGE_PASSWORD',
  CHANGE_NOTIFICATION_SETTINGS = 'CHANGE_NOTIFICATION_SETTINGS',
  CHANGE_MEMBER_NAME_ACCOUNT = 'CHANGE_MEMBER_NAME_ACCOUNT',
  ACCOUNT_CANCELLATION_SUBMIT = 'ACCOUNT_CANCELLATION_SUBMIT',
  ACCOUNT_CANCELLATION_CANCEL = 'ACCOUNT_CANCELLATION_CANCEL',
  ACCOUNT_CANCELLATION_FINALIZE = 'ACCOUNT_CANCELLATION_FINALIZE',
  PURCHASE_PLAN = 'PURCHASE_PLAN',
  EXPORT_BILL_RECORDS = 'EXPORT_BILL_RECORDS',
  CREATE_INVOICE = 'CREATE_INVOICE',
  SET_INVOICE_HEADER = 'SET_INVOICE_HEADER',
  START_ENTERPRISE_AUTH = 'START_ENTERPRISE_AUTH',
  VERIFY_ENTERPRISE_AUTH_AMOUNT = 'VERIFY_ENTERPRISE_AUTH_AMOUNT',
  RESET_ENTERPRISE_AUTH_TASK = 'RESET_ENTERPRISE_AUTH_TASK',
  CREATE_API_KEY = 'CREATE_API_KEY',
  UPDATE_API_KEY = 'UPDATE_API_KEY',
  COPY_API_KEY = 'COPY_API_KEY',
  DELETE_API_KEY = 'DELETE_API_KEY',
  //Account sync / claim（V3 账号同步与登录侧认领）
  SYNC_ACCOUNT_CLAIM = 'SYNC_ACCOUNT_CLAIM',
  SSO_ACCOUNT_CLAIM = 'SSO_ACCOUNT_CLAIM',
  SYNC_ACCOUNT_CONFLICT = 'SYNC_ACCOUNT_CONFLICT',
  //Agent Skills
  CREATE_SKILL = 'CREATE_SKILL',
  UPDATE_SKILL = 'UPDATE_SKILL',
  DEPLOY_SKILL = 'DEPLOY_SKILL',
  DELETE_SKILL = 'DELETE_SKILL',
  IMPORT_SKILL = 'IMPORT_SKILL',
  CREATE_SKILL_FOLDER = 'CREATE_SKILL_FOLDER',
  EXPORT_SKILL = 'EXPORT_SKILL',
  COPY_SKILL = 'COPY_SKILL',
  MOVE_SKILL = 'MOVE_SKILL',
  UPDATE_SKILL_COLLABORATOR = 'UPDATE_SKILL_COLLABORATOR',
  DELETE_SKILL_COLLABORATOR = 'DELETE_SKILL_COLLABORATOR',
  TRANSFER_SKILL_OWNERSHIP = 'TRANSFER_SKILL_OWNERSHIP'
}

export type AuditEventParamsType = {
  [AuditEventEnum.EXPORT_AUDIT_LOGS]: {
    name?: string;
    dateStart: string;
    dateEnd: string;
    tmbIds: string;
    events: string;
    total: string;
  };
  [AuditEventEnum.LOGIN]: { name?: string; ip?: string; region?: string };
  [AuditEventEnum.CREATE_INVITATION_LINK]: { name?: string; link: string };
  [AuditEventEnum.JOIN_TEAM]: { name?: string; link: string };
  [AuditEventEnum.CHANGE_MEMBER_NAME]: { name?: string; memberName: string; newName: string };
  [AuditEventEnum.KICK_OUT_TEAM]: { name?: string; memberName: string };
  [AuditEventEnum.RECOVER_TEAM_MEMBER]: { name?: string; memberName: string };
  [AuditEventEnum.CREATE_DEPARTMENT]: { name?: string; departmentName: string };
  [AuditEventEnum.CHANGE_DEPARTMENT]: {
    name?: string;
    departmentName: string;
    oldName?: string;
    newName?: string;
    newItemNames?: string[];
    newItemValues?: string[];
  };
  [AuditEventEnum.DELETE_DEPARTMENT]: { name?: string; departmentName: string };
  [AuditEventEnum.RELOCATE_DEPARTMENT]: {
    name?: string;
    departmentName: string;
    targetDepartmentName?: string;
  };
  [AuditEventEnum.CREATE_GROUP]: { name?: string; groupName: string };
  [AuditEventEnum.DELETE_GROUP]: { name?: string; groupName: string };
  [AuditEventEnum.ASSIGN_PERMISSION]: { name?: string; objectName: string; permission: string };
  [AuditEventEnum.TRANSFER_TEAM_OWNERSHIP]: {
    name?: string;
    teamName: string;
    oldOwnerName: string;
    newOwnerName: string;
  };
  [AuditEventEnum.RESUME_INHERIT_PERMISSION]: {
    name?: string;
    targetResource: string;
    parentResource?: string;
  };
  [AuditEventEnum.CREATE_APP]: { name?: string; appName: string; appType: string };
  [AuditEventEnum.UPDATE_APP_INFO]: {
    name?: string;
    appName: string;
    newItemNames: string[];
    newItemValues: string[];
    appType: string;
  };
  [AuditEventEnum.MOVE_APP]: {
    name?: string;
    appName: string;
    targetFolderName: string;
    appType: string;
  };
  [AuditEventEnum.DELETE_APP]: { name?: string; appName: string; appType: string };
  [AuditEventEnum.UPDATE_APP_COLLABORATOR]: {
    name?: string;
    appName: string;
    appType: string;
    tmbList: string[];
    groupList: string[];
    orgList: string[];
    permission: string;
  };
  [AuditEventEnum.DELETE_APP_COLLABORATOR]: {
    name?: string;
    appName: string;
    appType: string;
    itemName: string;
    itemValueName: string;
  };
  [AuditEventEnum.TRANSFER_APP_OWNERSHIP]: {
    name?: string;
    appName: string;
    appType: string;
    oldOwnerName: string;
    newOwnerName: string;
  };
  [AuditEventEnum.CREATE_APP_COPY]: { name?: string; appName: string; appType: string };
  [AuditEventEnum.CREATE_APP_FOLDER]: { name?: string; folderName: string };
  [AuditEventEnum.SAVE_APP]: { name?: string; appName: string; appId: string; appType: string };
  [AuditEventEnum.PUBLISH_APP]: { name?: string; appName: string; appId: string; appType: string };
  [AuditEventEnum.UPDATE_PUBLISH_APP]: {
    name?: string;
    operationName: string;
    appName: string;
    appId: string;
    appType: string;
  };
  [AuditEventEnum.CREATE_APP_PUBLISH_CHANNEL]: {
    name?: string;
    appName: string;
    channelName: string;
    appType: string;
  };
  [AuditEventEnum.UPDATE_APP_PUBLISH_CHANNEL]: {
    name?: string;
    appName: string;
    channelName: string;
    appType: string;
  };
  [AuditEventEnum.DELETE_APP_PUBLISH_CHANNEL]: {
    name?: string;
    appName: string;
    channelName: string;
    appType: string;
  };
  [AuditEventEnum.EXPORT_APP_CHAT_LOG]: { name?: string; appName: string; appType: string };
  [AuditEventEnum.CREATE_EVALUATION]: { name: string; appName: string; evalName?: string };
  [AuditEventEnum.EXPORT_EVALUATION]: { name: string; evalName?: string };
  [AuditEventEnum.DELETE_EVALUATION]: { name?: string; evalName?: string };
  [AuditEventEnum.CREATE_DATASET]: { name?: string; datasetName: string; datasetType: string };
  [AuditEventEnum.UPDATE_DATASET]: { name?: string; datasetName: string; datasetType: string };
  [AuditEventEnum.DELETE_DATASET]: { name?: string; datasetName: string; datasetType: string };
  [AuditEventEnum.MOVE_DATASET]: {
    name?: string;
    datasetName: string;
    targetFolderName: string;
    datasetType: string;
  };
  [AuditEventEnum.UPDATE_DATASET_COLLABORATOR]: {
    name?: string;
    datasetName: string;
    datasetType: string;
    tmbList: string[];
    groupList: string[];
    orgList: string[];
    permission: string;
  };
  [AuditEventEnum.DELETE_DATASET_COLLABORATOR]: {
    name?: string;
    datasetName: string;
    datasetType: string;
    itemName: string;
    itemValueName: string;
  };
  [AuditEventEnum.TRANSFER_DATASET_OWNERSHIP]: {
    name?: string;
    datasetName: string;
    datasetType: string;
    oldOwnerName: string;
    newOwnerName: string;
  };
  [AuditEventEnum.EXPORT_DATASET]: { name?: string; datasetName: string; datasetType: string };
  [AuditEventEnum.CREATE_DATASET_FOLDER]: { name?: string; folderName: string };
  [AuditEventEnum.CREATE_COLLECTION]: {
    name?: string;
    collectionName: string;
    datasetName: string;
    datasetType: string;
  };
  [AuditEventEnum.UPDATE_COLLECTION]: {
    name?: string;
    collectionName: string;
    datasetName: string;
    datasetType: string;
  };
  [AuditEventEnum.DELETE_COLLECTION]: {
    name?: string;
    collectionName: string;
    datasetName: string;
    datasetType: string;
  };
  [AuditEventEnum.RETRAIN_COLLECTION]: {
    name?: string;
    collectionName: string;
    datasetName: string;
    datasetType: string;
  };
  [AuditEventEnum.CREATE_DATA]: {
    name?: string;
    collectionName: string;
    datasetName: string;
    datasetType: string;
  };
  [AuditEventEnum.UPDATE_DATA]: {
    name?: string;
    collectionName: string;
    datasetName: string;
    datasetType: string;
  };
  [AuditEventEnum.DELETE_DATA]: {
    name?: string;
    collectionName: string;
    datasetName: string;
    datasetType: string;
  };
  [AuditEventEnum.SEARCH_TEST]: { name?: string; datasetName: string; datasetType: string };
  [AuditEventEnum.CHANGE_PASSWORD]: { name?: string };
  [AuditEventEnum.CHANGE_NOTIFICATION_SETTINGS]: { name?: string };
  [AuditEventEnum.CHANGE_MEMBER_NAME_ACCOUNT]: { name?: string; oldName: string; newName: string };
  [AuditEventEnum.ACCOUNT_CANCELLATION_SUBMIT]: {
    userId: string;
    operatorUserId: string;
    operatorType: 'self';
    requestSource: 'self';
    verificationMethod: string;
    verificationProvider?: string;
    affectedTeamIds: string[];
    requestedAt: Date;
    scheduledCancelAt: Date;
    requestId?: string;
  };
  [AuditEventEnum.ACCOUNT_CANCELLATION_CANCEL]: {
    userId: string;
    operatorUserId: string;
    operatorType: 'self';
    requestSource: 'self';
    requestedAt: Date;
    scheduledCancelAt: Date;
    requestId?: string;
  };
  [AuditEventEnum.ACCOUNT_CANCELLATION_FINALIZE]: {
    userId: string;
    operatorUserId: string;
    operatorType: 'system' | 'admin';
    requestSource: 'self' | 'admin';
    requestedAt: Date;
    scheduledCancelAt: Date;
    finalizedAt: Date;
    requestId?: string;
    cronExecutionId?: string;
  };
  [AuditEventEnum.PURCHASE_PLAN]: { name?: string };
  [AuditEventEnum.EXPORT_BILL_RECORDS]: { name?: string };
  [AuditEventEnum.CREATE_INVOICE]: { name?: string };
  [AuditEventEnum.SET_INVOICE_HEADER]: { name?: string };
  [AuditEventEnum.START_ENTERPRISE_AUTH]: { name?: string; enterpriseName: string };
  [AuditEventEnum.VERIFY_ENTERPRISE_AUTH_AMOUNT]: { name?: string; enterpriseName: string };
  [AuditEventEnum.RESET_ENTERPRISE_AUTH_TASK]: { name?: string; enterpriseName: string };
  [AuditEventEnum.CREATE_API_KEY]: ApiKeyAuditParams;
  [AuditEventEnum.UPDATE_API_KEY]: ApiKeyAuditParams;
  [AuditEventEnum.COPY_API_KEY]: ApiKeyAuditParams;
  [AuditEventEnum.DELETE_API_KEY]: ApiKeyAuditParams;
  //Account sync / claim（V3 账号认领审计；操作者均为 system）
  [AuditEventEnum.SYNC_ACCOUNT_CLAIM]: {
    syncId: string;
    claimedUsername: string;
    matchedBy: 'username' | 'contact';
  };
  [AuditEventEnum.SSO_ACCOUNT_CLAIM]: {
    ssoSource: string;
    ssoId: string;
    claimedUsername: string;
  };
  [AuditEventEnum.SYNC_ACCOUNT_CONFLICT]: {
    syncId: string;
    username?: string;
    reason: 'occupied' | 'ambiguous-contact';
    detail?: string;
  };
  [AuditEventEnum.CREATE_SKILL]: { name?: string; skillName: string; skillType: string };
  [AuditEventEnum.UPDATE_SKILL]: {
    name?: string;
    skillName: string;
    skillType: string;
    newItemNames?: string[];
    newItemValues?: string[];
  };
  [AuditEventEnum.DEPLOY_SKILL]: { name?: string; skillName: string; skillType: string };
  [AuditEventEnum.DELETE_SKILL]: { name?: string; skillName: string; skillType: string };
  [AuditEventEnum.IMPORT_SKILL]: { name?: string; skillName: string; skillType: string };
  [AuditEventEnum.CREATE_SKILL_FOLDER]: { name?: string; folderName: string };
  [AuditEventEnum.EXPORT_SKILL]: { name?: string; skillName: string; skillType: string };
  [AuditEventEnum.COPY_SKILL]: { name?: string; skillName: string; skillType: string };
  [AuditEventEnum.MOVE_SKILL]: {
    name?: string;
    skillName: string;
    skillType: string;
    targetFolderName: string;
  };
  [AuditEventEnum.UPDATE_SKILL_COLLABORATOR]: {
    name?: string;
    skillName: string;
    skillType: string;
    tmbList: string[];
    groupList: string[];
    orgList: string[];
    permission: string;
  };
  [AuditEventEnum.DELETE_SKILL_COLLABORATOR]: {
    name?: string;
    skillName: string;
    skillType: string;
    itemName: string;
    itemValueName: string;
  };
  [AuditEventEnum.TRANSFER_SKILL_OWNERSHIP]: {
    name?: string;
    skillName: string;
    skillType: string;
    oldOwnerName: string;
    newOwnerName: string;
  };
};

export type AdminAuditEventParamsType = {
  [AdminAuditEventEnum.ADMIN_LOGIN]: { name?: string };
  [AdminAuditEventEnum.ADMIN_ADD_USER]: { name?: string; userName: string };
  [AdminAuditEventEnum.ADMIN_UPDATE_USER]: {
    userName?: string;
  };
  [AdminAuditEventEnum.ADMIN_DELETE_USER]: {
    userId?: string;
    userName?: string;
    operatorUserId?: string;
    operatorType?: 'admin';
    requestSource?: 'admin';
    requestedAt?: Date;
    scheduledCancelAt?: Date;
    requestId?: string;
  };
  [AdminAuditEventEnum.ADMIN_UPDATE_TEAM]: {
    name?: string;
    teamName: string;
    newTeamName: string;
    newBalance: string;
  };
  [AdminAuditEventEnum.ADMIN_SWITCH_TEAM]: {
    name?: string;
    sourceTeamId: string;
    targetTeamId: string;
    targetTeamName: string;
    ip?: string | null;
  };
  [AdminAuditEventEnum.ADMIN_ADD_PLAN]: { name?: string; teamId: string };
  [AdminAuditEventEnum.ADMIN_UPDATE_PLAN]: { name?: string; teamId: string };
  [AdminAuditEventEnum.ADMIN_FINISH_INVOICE]: { name?: string; teamName: string };
  [AdminAuditEventEnum.ADMIN_UPDATE_SYSTEM_CONFIG]: { name?: string };
  [AdminAuditEventEnum.ADMIN_CREATE_APP_TEMPLATE]: { name?: string; templateName: string };
  [AdminAuditEventEnum.ADMIN_UPDATE_APP_TEMPLATE]: { name?: string; templateName: string };
  [AdminAuditEventEnum.ADMIN_DELETE_APP_TEMPLATE]: { name?: string; templateName: string };
  [AdminAuditEventEnum.ADMIN_SAVE_TEMPLATE_TYPE]: { name?: string; typeName: string };
  [AdminAuditEventEnum.ADMIN_DELETE_TEMPLATE_TYPE]: { name?: string; typeName: string };
  [AdminAuditEventEnum.ADMIN_CREATE_PLUGIN]: { name?: string; pluginName: string };
  [AdminAuditEventEnum.ADMIN_UPDATE_PLUGIN]: { name?: string; pluginName: string };
  [AdminAuditEventEnum.ADMIN_DELETE_PLUGIN]: { name?: string; pluginName: string };
  [AdminAuditEventEnum.ADMIN_CREATE_PLUGIN_GROUP]: { name?: string; groupName: string };
  [AdminAuditEventEnum.ADMIN_UPDATE_PLUGIN_GROUP]: { name?: string; groupName: string };
  [AdminAuditEventEnum.ADMIN_DELETE_PLUGIN_GROUP]: { name?: string; groupName: string };
  [AdminAuditEventEnum.ADMIN_UPDATE_SYSTEM_MODAL]: { name?: string };
  [AdminAuditEventEnum.ADMIN_SEND_SYSTEM_INFORM]: {
    name?: string;
    informTitle?: string;
    level?: string;
  };
  [AdminAuditEventEnum.ADMIN_UPDATE_ACTIVITY_AD]: Record<string, unknown>;
  [AdminAuditEventEnum.ADMIN_UPDATE_OPERATIONAL_AD]: Record<string, unknown>;
  [AdminAuditEventEnum.ADMIN_ENABLE_MODERATION_PLUGIN]: { name?: string; pluginName: string };
  [AdminAuditEventEnum.ADMIN_DISABLE_MODERATION_PLUGIN]: { name?: string; pluginName: string };
  [AdminAuditEventEnum.ADMIN_INSTALL_MODERATION_PLUGIN]: { name?: string; pluginName: string };
  [AdminAuditEventEnum.ADMIN_UNINSTALL_MODERATION_PLUGIN]: { name?: string; pluginName: string };
  [AdminAuditEventEnum.ADMIN_UPDATE_MODERATION_PLUGIN_CONFIG]: {
    name?: string;
    pluginName: string;
  };
  [AdminAuditEventEnum.ADMIN_UPDATE_MODERATION_POLICY]: { name?: string };
};

/** 允许以 system 作用域写入的知识库审计事件（无操作人成员 ID）。 */
export type DatasetAuditEvent = `${DatasetAuditEventEnum}`;

export type DatasetAuditEventParamsType = {
  [DatasetAuditEventEnum.DATASET_CONFIG_UPDATE]: {
    name?: string;
    datasetName: string;
    changeItem: string;
    oldValue: string;
    newValue: string;
  };
  [DatasetAuditEventEnum.DATASET_TAG_CREATE]: {
    name?: string;
    datasetName: string;
    tagName: string;
  };
  [DatasetAuditEventEnum.DATASET_TAG_RENAME]: {
    name?: string;
    datasetName: string;
    oldName: string;
    newName: string;
  };
  [DatasetAuditEventEnum.DATASET_TAG_DELETE]: {
    name?: string;
    datasetName: string;
    tagName: string;
  };
  [DatasetAuditEventEnum.DATASET_COLLECTION_CREATE]: {
    name?: string;
    objectType: string;
    /** 知识库名/父目录链，已包含知识库自身 */
    location: string;
  };
  [DatasetAuditEventEnum.DATASET_COLLECTION_RENAME]: {
    name?: string;
    oldName: string;
    newName: string;
  };
  [DatasetAuditEventEnum.DATASET_COLLECTION_MOVE]: {
    name?: string;
    oldPath: string;
    newPath: string;
  };
  [DatasetAuditEventEnum.DATASET_COLLECTION_ENABLE]: { name?: string };
  [DatasetAuditEventEnum.DATASET_COLLECTION_DISABLE]: { name?: string };
  [DatasetAuditEventEnum.DATASET_COLLECTION_SOURCE_READ]: { name?: string };
  [DatasetAuditEventEnum.DATASET_COLLECTION_QA_EXPORT]: { name?: string };
  [DatasetAuditEventEnum.DATASET_COLLECTION_SYNC]: { name?: string };
  [DatasetAuditEventEnum.DATASET_COLLECTION_TAG_ADD]: {
    name?: string;
    tagName: string;
  };
  [DatasetAuditEventEnum.DATASET_COLLECTION_TAG_REMOVE]: {
    name?: string;
    tagName: string;
  };
  [DatasetAuditEventEnum.DATASET_COLLECTION_PERMISSION_INHERITANCE_RESUME]: {
    name?: string;
    /** 恢复继承后跟随的上级：父目录名，根集合时为知识库名；父目录已不存在时省略。 */
    parentResource?: string;
  };
  [DatasetAuditEventEnum.DATASET_TRAINING_RETRY]: {
    name?: string;
    datasetName: string;
  };
  [DatasetAuditEventEnum.DATASET_COLLECTION_TRAINING_RETRY]: {
    name?: string;
    datasetName: string;
    collectionName: string;
  };
  [DatasetAuditEventEnum.DATASET_TRAINING_TASK_RETRY]: {
    name?: string;
    datasetName: string;
    collectionName: string;
  };
  [DatasetAuditEventEnum.DATASET_TRAINING_RECORD_DELETE]: {
    name?: string;
    datasetName: string;
    collectionName: string;
  };
  [DatasetAuditEventEnum.DATASET_INDEX_REBUILD]: {
    name?: string;
    datasetName: string;
    /** 展示名，日志正文使用；目录查不到模型时退回模型 ID。 */
    oldModelName: string;
    newModelName: string;
    /** 稳定模型 ID，正文不展示，仅供排查模型改名场景。 */
    oldModelId: string;
    newModelId: string;
  };
};

/**
 * 团队审计事件全集：成员事件 + 知识库事件。
 *
 * Mongo enum、Zod 校验、共享类型与前端筛选菜单都从这里派生，避免各个消费方
 * 各自维护一份事件列表而错配（曾导致知识库事件能写入、却读不出）。
 */
export const TeamAuditEventList = [
  ...Object.values(AuditEventEnum),
  ...Object.values(DatasetAuditEventEnum)
].map((event) => `${event}` as const);

export type TeamAuditEvent = `${AuditEventEnum | DatasetAuditEvent}`;
