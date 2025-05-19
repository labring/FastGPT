import { OperationLogEventEnum } from '@fastgpt/global/support/operationLog/constants';
import { i18nT } from '../../../web/i18n/utils';

export const operationLogI18nMap = {
  [OperationLogEventEnum.LOGIN]: {
    content: i18nT('account_team:log_login'),
    typeLabel: i18nT('account_team:login')
  },
  [OperationLogEventEnum.CREATE_INVITATION_LINK]: {
    content: i18nT('account_team:log_create_invitation_link'),
    typeLabel: i18nT('account_team:create_invitation_link')
  },
  [OperationLogEventEnum.JOIN_TEAM]: {
    content: i18nT('account_team:log_join_team'),
    typeLabel: i18nT('account_team:join_team')
  },
  [OperationLogEventEnum.CHANGE_MEMBER_NAME]: {
    content: i18nT('account_team:log_change_member_name'),
    typeLabel: i18nT('account_team:change_member_name')
  },
  [OperationLogEventEnum.KICK_OUT_TEAM]: {
    content: i18nT('account_team:log_kick_out_team'),
    typeLabel: i18nT('account_team:kick_out_team')
  },
  [OperationLogEventEnum.CREATE_DEPARTMENT]: {
    content: i18nT('account_team:log_create_department'),
    typeLabel: i18nT('account_team:create_department')
  },
  [OperationLogEventEnum.CHANGE_DEPARTMENT]: {
    content: i18nT('account_team:log_change_department'),
    typeLabel: i18nT('account_team:change_department_name')
  },
  [OperationLogEventEnum.DELETE_DEPARTMENT]: {
    content: i18nT('account_team:log_delete_department'),
    typeLabel: i18nT('account_team:delete_department')
  },
  [OperationLogEventEnum.RELOCATE_DEPARTMENT]: {
    content: i18nT('account_team:log_relocate_department'),
    typeLabel: i18nT('account_team:relocate_department')
  },
  [OperationLogEventEnum.CREATE_GROUP]: {
    content: i18nT('account_team:log_create_group'),
    typeLabel: i18nT('account_team:create_group')
  },
  [OperationLogEventEnum.DELETE_GROUP]: {
    content: i18nT('account_team:log_delete_group'),
    typeLabel: i18nT('account_team:delete_group')
  },
  [OperationLogEventEnum.ASSIGN_PERMISSION]: {
    content: i18nT('account_team:log_assign_permission'),
    typeLabel: i18nT('account_team:assign_permission')
  }
} as const;

export type TemplateParamsMap = {
  [OperationLogEventEnum.LOGIN]: { name?: string };
  [OperationLogEventEnum.CREATE_INVITATION_LINK]: { name?: string; link: string };
  [OperationLogEventEnum.JOIN_TEAM]: { name?: string; link: string };
  [OperationLogEventEnum.CHANGE_MEMBER_NAME]: {
    name?: string;
    memberName: string;
    newName: string;
  };
  [OperationLogEventEnum.KICK_OUT_TEAM]: {
    name?: string;
    memberName: string;
  };
  [OperationLogEventEnum.CREATE_DEPARTMENT]: { name?: string; departmentName: string };
  [OperationLogEventEnum.CHANGE_DEPARTMENT]: {
    name?: string;
    departmentName: string;
  };
  [OperationLogEventEnum.DELETE_DEPARTMENT]: { name?: string; departmentName: string };
  [OperationLogEventEnum.RELOCATE_DEPARTMENT]: {
    name?: string;
    departmentName: string;
  };
  [OperationLogEventEnum.CREATE_GROUP]: { name?: string; groupName: string };
  [OperationLogEventEnum.DELETE_GROUP]: { name?: string; groupName: string };
  [OperationLogEventEnum.ASSIGN_PERMISSION]: {
    name?: string;
    objectName: string;
    permission: string;
  };
};
