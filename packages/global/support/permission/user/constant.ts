import { PermissionKeyEnum, PermissionList, ReadPermissionVal } from '../constant';
import { PermissionListType } from '../type';
import { i18nT } from '../../../../web/i18n/utils';
export const TeamPermissionList: PermissionListType = {
  [PermissionKeyEnum.read]: {
    ...PermissionList[PermissionKeyEnum.read],
    description: i18nT('user:permission_des.read')
  },
  [PermissionKeyEnum.write]: {
    ...PermissionList[PermissionKeyEnum.write],
    description: i18nT('user:permission_des.write')
  },
  [PermissionKeyEnum.manage]: {
    ...PermissionList[PermissionKeyEnum.manage],
    description: i18nT('user:permission_des.manage')
  }
};

export const TeamDefaultPermissionVal = ReadPermissionVal;
