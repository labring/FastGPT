import { NullPermission, PermissionKeyEnum, PermissionList } from '../constant';

export enum DatasetPermissionKeyEnum {}

export const DatasetPermissionList = {
  [PermissionKeyEnum.read]: {
    ...PermissionList[PermissionKeyEnum.read]
  },
  [PermissionKeyEnum.write]: {
    ...PermissionList[PermissionKeyEnum.write]
  },
  [PermissionKeyEnum.manage]: {
    ...PermissionList[PermissionKeyEnum.manage]
  }
};

export const DatasetDefaultPermission = NullPermission;
