import { PermissionKeyEnum } from '../constant';
import { PermissionListType } from '../type';
import { PermissionList } from '../constant';
export const TeamPermissionList: PermissionListType = {
  [PermissionKeyEnum.read]: {
    ...PermissionList[PermissionKeyEnum.read],
    value: 0b100
  },
  [PermissionKeyEnum.write]: {
    ...PermissionList[PermissionKeyEnum.write],
    value: 0b010
  },
  [PermissionKeyEnum.manage]: {
    ...PermissionList[PermissionKeyEnum.manage],
    value: 0b001
  }
};

export const TeamReadPermissionVal = TeamPermissionList['read'].value;
export const TeamWritePermissionVal = TeamPermissionList['write'].value;
export const TeamManagePermissionVal = TeamPermissionList['manage'].value;
export const TeamDefaultPermissionVal = TeamReadPermissionVal;
