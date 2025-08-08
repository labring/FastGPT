import { NullRoleVal, CommonPerKeyEnum, CommonRoleList } from '../constant';
import { type RoleListType } from '../type';
import { i18nT } from '../../../../web/i18n/utils';
export enum AppPermissionKeyEnum {}
export const AppPermissionList: RoleListType = {
  [CommonPerKeyEnum.read]: {
    ...CommonRoleList[CommonPerKeyEnum.read],
    description: i18nT('app:permission.des.read')
  },
  [CommonPerKeyEnum.write]: {
    ...CommonRoleList[CommonPerKeyEnum.write],
    description: i18nT('app:permission.des.write')
  },
  [CommonPerKeyEnum.manage]: {
    ...CommonRoleList[CommonPerKeyEnum.manage],
    description: i18nT('app:permission.des.manage')
  }
};

export const AppDefaultPermissionVal = NullRoleVal;
