import { PermissionKeyEnum, PermissionList } from '../constant';
import { PermissionListType } from '../type';

export enum GroupMemberRole {
  owner = 'owner',
  admin = 'admin',
  member = 'member'
}

export const memberGroupPermissionList: PermissionListType = {
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
