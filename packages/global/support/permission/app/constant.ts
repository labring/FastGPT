import { NullPermission, PermissionKeyEnum, PermissionList } from '../constant';
import { type PermissionListType } from '../type';
import { i18nT } from '../../../../web/i18n/utils';
export enum AppPermissionKeyEnum {}

export enum AppPermissionKeyEnum {
  log = 'log',
  quickGate = 'quickGate',
  featuredGate = 'featuredGate'
}

export const AppLogPermission = 0b100000;
export const GateQuickAppPermission = 0b001100;
export const GateFeaturedAppPermission = 0b010100;

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
    value: 0b111111,
    description: i18nT('app:permission.des.manage')
  },
  [AppPermissionKeyEnum.log]: {
    name: i18nT('app:permission.name.log'),
    value: AppLogPermission,
    checkBoxType: 'multiple',
    description: i18nT('app:permission.des.log')
  },
  [AppPermissionKeyEnum.quickGate]: {
    name: '门户快捷应用权限',
    description: '',
    value: GateQuickAppPermission,
    checkBoxType: 'multiple' // TODO: 加个隐藏选项
  },
  [AppPermissionKeyEnum.featuredGate]: {
    name: '门户推荐应用权限',
    description: '',
    value: GateFeaturedAppPermission,
    checkBoxType: 'multiple' // TODO: 加个隐藏选项
  }
};

export const AppDefaultPermissionVal = NullPermission;
export const AppLogPermissionVal = AppPermissionList[AppPermissionKeyEnum.log].value;
