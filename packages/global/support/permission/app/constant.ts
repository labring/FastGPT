import { NullPermission, PermissionKeyEnum, PermissionList } from '../constant';
import { PermissionListType } from '../type';
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

export const AppDefaultPermissionVal = NullPermission;
