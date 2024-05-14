import { AuthUserTypeEnum } from './constant';

export type PermissionValueType = number;

export enum ResourceTypeEnum {
  team = 'team',
  app = 'app',
  dataset = 'dataset'
}

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
  teamMemberId: string;
  resourceType: ResourceType;
  permission: PermissionValueType;
};
