import { operationLogTemplateCodeEnum } from '@fastgpt/global/support/operationLog/constants';
import { i18nT } from '../../../web/i18n/utils';

export const operationLogI18nMap = {
  [operationLogTemplateCodeEnum.LOGIN]: {
    content: i18nT('account_team:log_login'),
    typeLabel: i18nT('account_team:login')
  },
  [operationLogTemplateCodeEnum.CREATE_INVITATION_LINK]: {
    content: i18nT('account_team:log_create_invitation_link'),
    typeLabel: i18nT('account_team:create_invitation_link')
  },
  [operationLogTemplateCodeEnum.JOIN_TEAM]: {
    content: i18nT('account_team:log_join_team'),
    typeLabel: i18nT('account_team:join_team')
  },
  [operationLogTemplateCodeEnum.CHANGE_MEMBER_NAME]: {
    content: i18nT('account_team:log_change_member_name'),
    typeLabel: i18nT('account_team:change_member_name')
  },
  [operationLogTemplateCodeEnum.KICK_OUT_TEAM]: {
    content: i18nT('account_team:log_kick_out_team'),
    typeLabel: i18nT('account_team:kick_out_team')
  },
  [operationLogTemplateCodeEnum.CREATE_DEPARTMENT]: {
    content: i18nT('account_team:log_create_department'),
    typeLabel: i18nT('account_team:create_department')
  },
  [operationLogTemplateCodeEnum.CHANGE_DEPARTMENT]: {
    content: i18nT('account_team:log_change_department'),
    typeLabel: i18nT('account_team:change_department_name')
  },
  [operationLogTemplateCodeEnum.DELETE_DEPARTMENT]: {
    content: i18nT('account_team:log_delete_department'),
    typeLabel: i18nT('account_team:delete_department')
  },
  [operationLogTemplateCodeEnum.RELOCATE_DEPARTMENT]: {
    content: i18nT('account_team:log_relocate_department'),
    typeLabel: i18nT('account_team:relocate_department')
  },
  [operationLogTemplateCodeEnum.CREATE_GROUP]: {
    content: i18nT('account_team:log_create_group'),
    typeLabel: i18nT('account_team:create_group')
  },
  [operationLogTemplateCodeEnum.DELETE_GROUP]: {
    content: i18nT('account_team:log_delete_group'),
    typeLabel: i18nT('account_team:delete_group')
  },
  [operationLogTemplateCodeEnum.ASSIGN_PERMISSION]: {
    content: i18nT('account_team:log_assign_permission'),
    typeLabel: i18nT('account_team:assign_permission')
  }
} as const;

export type TemplateParamsMap = {
  [operationLogTemplateCodeEnum.LOGIN]: { name?: string };
  [operationLogTemplateCodeEnum.CREATE_INVITATION_LINK]: { name?: string; link: string };
  [operationLogTemplateCodeEnum.JOIN_TEAM]: { name?: string; link: string };
  [operationLogTemplateCodeEnum.CHANGE_MEMBER_NAME]: {
    name?: string;
    memberName: string;
    newName: string;
  };
  [operationLogTemplateCodeEnum.KICK_OUT_TEAM]: {
    name?: string;
    memberName: string;
  };
  [operationLogTemplateCodeEnum.CREATE_DEPARTMENT]: { name?: string; departmentName: string };
  [operationLogTemplateCodeEnum.CHANGE_DEPARTMENT]: {
    name?: string;
    departmentName: string;
  };
  [operationLogTemplateCodeEnum.DELETE_DEPARTMENT]: { name?: string; departmentName: string };
  [operationLogTemplateCodeEnum.RELOCATE_DEPARTMENT]: {
    name?: string;
    departmentName: string;
  };
  [operationLogTemplateCodeEnum.CREATE_GROUP]: { name?: string; groupName: string };
  [operationLogTemplateCodeEnum.DELETE_GROUP]: { name?: string; groupName: string };
  [operationLogTemplateCodeEnum.ASSIGN_PERMISSION]: {
    name?: string;
    objectName: string;
    permission: string;
  };
};
