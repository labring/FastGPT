import { NullPermission, PermissionKeyEnum, PermissionList } from '../constant';
import { PermissionListType } from '../type';

export enum AppPermissionKeyEnum {}
export const AppPermissionList: PermissionListType = {
  [PermissionKeyEnum.read]: {
    ...PermissionList[PermissionKeyEnum.read],
    description: '可使用该应用进行对话'
  },
  [PermissionKeyEnum.write]: {
    ...PermissionList[PermissionKeyEnum.write],
    description: '可查看和编辑应用'
  },
  [PermissionKeyEnum.manage]: {
    ...PermissionList[PermissionKeyEnum.manage],
    description: '写权限基础上，可配置发布渠道、查看对话日志、分配该应用权限'
  }
};

export const AppDefaultPermissionVal = NullPermission;
