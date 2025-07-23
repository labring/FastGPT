import { NullPermission, PermissionKeyEnum, PermissionList, ReadPermissionVal } from '../constant';
import { type PermissionListType } from '../type';
import { i18nT } from '../../../../web/i18n/utils';
export enum AppPermissionKeyEnum {}
export const AppPermissionList: PermissionListType = {
  [PermissionKeyEnum.read]: {
    ...PermissionList[PermissionKeyEnum.read],
    description: i18nT('app:permission.des.read')
  },
  [PermissionKeyEnum.write]: {
    ...PermissionList[PermissionKeyEnum.write],
    description: i18nT('app:permission.des.write')
  },
  [PermissionKeyEnum.manage]: {
    ...PermissionList[PermissionKeyEnum.manage],
    description: i18nT('app:permission.des.manage')
  }
};

// 修改默认权限：团队成员默认可以查看应用
export const AppDefaultPermissionVal = ReadPermissionVal;
