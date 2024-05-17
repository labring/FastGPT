import { AuthUserTypeEnum } from './constant';

export type PermissionValueType = number;

export type AuthResponseType = {
  teamId: string;
  tmbId: string;
  isOwner: boolean;
  canWrite: boolean;
  authType?: `${AuthUserTypeEnum}`;
  appId?: string;
  apikey?: string;
};

export type ResourcePermissionType = {
  teamId: string;
  tmbId: string;
  resourceType: ResourceType;
  permission: PermissionValueType;
};
