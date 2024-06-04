import { PermissionKeyEnum, PermissionList, ReadPermissionVal } from '../constant';

export const TeamPermissionList = {
  [PermissionKeyEnum.read]: {
    ...PermissionList[PermissionKeyEnum.read]
  },
  [PermissionKeyEnum.write]: {
    ...PermissionList[PermissionKeyEnum.write]
  },
  [PermissionKeyEnum.manage]: {
    ...PermissionList[PermissionKeyEnum.manage],
    description: '可邀请, 删除成员'
  }
};

export const TeamDefaultPermissionVal = ReadPermissionVal;
