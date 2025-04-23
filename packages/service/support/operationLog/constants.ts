import { OperationLogEventEnum } from '@fastgpt/global/support/operationLog/constants';
import { i18nT } from '../../../web/i18n/utils';

export const operationLogMap = {
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
  }
} as const;

export type TemplateParamsMap = {
  [K in OperationLogEventEnum]: (typeof operationLogMap)[K]['params'];
};
