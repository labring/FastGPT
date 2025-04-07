import {
  loginTemplate,
  createInvitationLinkTemplate,
  joinTeamTemplate,
  changeMemberNameTemplate,
  kickOutTeamTemplate,
  createDepartmentTemplate,
  changeDepartmentNameTemplate,
  deleteDepartmentTemplate,
  relocateDepartmentTemplate,
  createGroupTemplate,
  deleteGroupTemplate,
  assignPermissionTemplate
} from './templates/operationLogTemplates';

import { operationLogTemplateCodeEnum } from '@fastgpt/global/support/operationLog/constants';

const OperationLogTemplateMap = {
  [operationLogTemplateCodeEnum.LOGIN]: {
    getTemplate: loginTemplate
  },
  [operationLogTemplateCodeEnum.CREATE_INVITATION_LINK]: {
    getTemplate: createInvitationLinkTemplate
  },
  [operationLogTemplateCodeEnum.JOIN_TEAM]: {
    getTemplate: joinTeamTemplate
  },
  [operationLogTemplateCodeEnum.CHANGE_MEMBER_NAME]: {
    getTemplate: changeMemberNameTemplate
  },
  [operationLogTemplateCodeEnum.KICK_OUT_TEAM]: {
    getTemplate: kickOutTeamTemplate
  },
  [operationLogTemplateCodeEnum.CREATE_DEPARTMENT]: {
    getTemplate: createDepartmentTemplate
  },
  [operationLogTemplateCodeEnum.CHANGE_DEPARTMENT]: {
    getTemplate: changeDepartmentNameTemplate
  },
  [operationLogTemplateCodeEnum.DELETE_DEPARTMENT]: {
    getTemplate: deleteDepartmentTemplate
  },
  [operationLogTemplateCodeEnum.RELOCATE_DEPARTMENT]: {
    getTemplate: relocateDepartmentTemplate
  },
  [operationLogTemplateCodeEnum.CREATE_GROUP]: {
    getTemplate: createGroupTemplate
  },
  [operationLogTemplateCodeEnum.DELETE_GROUP]: {
    getTemplate: deleteGroupTemplate
  },
  [operationLogTemplateCodeEnum.ASSIGN_PERMISSION]: {
    getTemplate: assignPermissionTemplate
  }
};

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

export function getoperationLogTemplate<T extends operationLogTemplateCodeEnum>(
  code: T,
  params: TemplateParamsMap[T]
): { operationLog: string } {
  const template = OperationLogTemplateMap[code].getTemplate;

  return template(params as any);
}
