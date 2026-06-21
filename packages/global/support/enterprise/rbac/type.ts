import type { EnterpriseRoleEnum } from './constants';

export type EnterpriseRoleBindingSchemaType = {
  _id: string;
  teamId: string;
  userId: string;
  tmbId?: string;
  roles: `${EnterpriseRoleEnum}`[];
  createdBy?: string;
  updateTime: Date;
  createTime: Date;
};
