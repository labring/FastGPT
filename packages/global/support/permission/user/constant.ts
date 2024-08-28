import { PermissionKeyEnum, PermissionList, ReadPermissionVal } from '../constant';
import { PermissionListType } from '../type';

export const TeamPermissionList: PermissionListType = {
  [PermissionKeyEnum.read]: {
    ...PermissionList[PermissionKeyEnum.read],
    description: '成员仅可阅读相关资源，无法新建资源'
  },
  [PermissionKeyEnum.write]: {
    ...PermissionList[PermissionKeyEnum.write],
    description: '除了可读资源外，还可以新建新的资源'
  },
  [PermissionKeyEnum.manage]: {
    ...PermissionList[PermissionKeyEnum.manage],
    description: '可创建资源、邀请、删除成员'
  }
};

export const TeamDefaultPermissionVal = ReadPermissionVal;
