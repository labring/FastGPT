import { NullPermission, PermissionKeyEnum, PermissionList } from '../constant';
import { type PermissionListType } from '../type';
import { i18nT } from '../../../../web/i18n/utils';
export enum AppPermissionKeyEnum {
  log = 'log'
}
export const AppPermissionList: PermissionListType<AppPermissionKeyEnum> = {
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
    value: 0b1111,
    description: i18nT('app:permission.des.manage')
  },
  [AppPermissionKeyEnum.log]: {
    name: i18nT('app:permission.name.log'),
    value: 0b1000,
    checkBoxType: 'multiple',
    description: i18nT('app:permission.des.log')
  }
};

export const AppDefaultPermissionVal = NullPermission;
export const AppLogPermissionVal = AppPermissionList[AppPermissionKeyEnum.log].value;
