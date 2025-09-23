import {
  NullRoleVal,
  CommonPerKeyEnum,
  CommonRoleList,
  CommonPerList,
  CommonRolePerMap
} from '../constant';
import type { PermissionListType, PermissionValueType, RolePerMapType } from '../type';
import { type RoleListType } from '../type';
import { i18nT } from '../../../../web/i18n/utils';
import { sumPer } from '../utils';

export enum AppPermissionKeyEnum {
  ReadChatLog = 'readChatLog'
}

export const AppPerList: PermissionListType<AppPermissionKeyEnum> = {
  ...CommonPerList,
  readChatLog: 0b1000
};

export const AppRoleList: RoleListType<AppPermissionKeyEnum> = {
  [CommonPerKeyEnum.read]: {
    ...CommonRoleList[CommonPerKeyEnum.read],
    name: i18nT('app:permission.name.read'),
    description: i18nT('app:permission.des.read')
  },
  [CommonPerKeyEnum.write]: {
    ...CommonRoleList[CommonPerKeyEnum.write],
    description: i18nT('app:permission.des.write')
  },
  [CommonPerKeyEnum.manage]: {
    ...CommonRoleList[CommonPerKeyEnum.manage],
    description: i18nT('app:permission.des.manage')
  },
  [AppPermissionKeyEnum.ReadChatLog]: {
    value: 0b1000,
    checkBoxType: 'multiple',
    name: i18nT('app:permission.name.readChatLog'),
    description: ''
  }
};

export const AppRolePerMap: RolePerMapType = new Map([
  ...CommonRolePerMap,
  [
    CommonRoleList[CommonPerKeyEnum.manage].value,
    sumPer(
      CommonPerList[CommonPerKeyEnum.read],
      CommonPerList[CommonPerKeyEnum.write],
      CommonPerList[CommonPerKeyEnum.manage],
      AppPerList[AppPermissionKeyEnum.ReadChatLog]
    )!
  ],
  [
    AppRoleList[AppPermissionKeyEnum.ReadChatLog].value,
    sumPer(CommonPerList[CommonPerKeyEnum.read], AppPerList[AppPermissionKeyEnum.ReadChatLog])!
  ]
]);

export const AppDefaultRoleVal = NullRoleVal;
export const AppReadChatLogPerVal = AppPerList[AppPermissionKeyEnum.ReadChatLog];
export const AppReadChatLogRoleVal = AppRoleList[AppPermissionKeyEnum.ReadChatLog].value;
