import { NullPermission, PermissionKeyEnum, PermissionList } from '../constant';

export enum DatasetPermissionKeyEnum {}

export const DatasetPermissionList = {
  [PermissionKeyEnum.read]: {
    ...PermissionList[PermissionKeyEnum.read],
    description: '可查看知识库内容'
  },
  [PermissionKeyEnum.write]: {
    ...PermissionList[PermissionKeyEnum.write],
    description: '可增加和变更知识库内容'
  },
  [PermissionKeyEnum.manage]: {
    ...PermissionList[PermissionKeyEnum.manage],
    description: '可管理整个知识库数据和信息'
  }
};

export const DatasetDefaultPermissionVal = NullPermission;
