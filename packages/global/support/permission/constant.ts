import { Permission } from './controller';
import { PermissionListType } from './type';

export enum AuthUserTypeEnum {
  token = 'token',
  root = 'root',
  apikey = 'apikey',
  outLink = 'outLink',
  teamDomain = 'teamDomain'
}

export enum PermissionTypeEnum {
  'private' = 'private',
  'public' = 'public',
  clbPrivate = 'clbPrivate',
  publicRead = 'publicRead',
  publicWrite = 'publicWrite'
}
export const PermissionTypeMap = {
  [PermissionTypeEnum.private]: {
    iconLight: 'support/permission/privateLight',
    label: 'permission.Private'
  },
  [PermissionTypeEnum.public]: {
    iconLight: 'support/permission/publicLight',
    label: 'permission.Public'
  },
  [PermissionTypeEnum.publicRead]: {
    iconLight: 'support/permission/publicLight',
    label: '团队可访问'
  },
  [PermissionTypeEnum.publicWrite]: {
    iconLight: 'support/permission/publicLight',
    label: '团队可编辑'
  },
  [PermissionTypeEnum.clbPrivate]: {
    iconLight: 'support/permission/privateLight',
    label: '仅协作者'
  }
};

export enum PerResourceTypeEnum {
  team = 'team',
  app = 'app',
  dataset = 'dataset'
}

/* new permission */
export enum PermissionKeyEnum {
  read = 'read',
  write = 'write',
  manage = 'manage'
}
export const PermissionList: PermissionListType = {
  [PermissionKeyEnum.read]: {
    name: '读权限',
    description: '',
    value: 0b100,
    checkBoxType: 'single'
  },
  [PermissionKeyEnum.write]: {
    name: '写权限',
    description: '',
    value: 0b110, // 如果某个资源有特殊要求，再重写这个值
    checkBoxType: 'single'
  },
  [PermissionKeyEnum.manage]: {
    name: '管理员',
    description: '',
    value: 0b111,
    checkBoxType: 'single'
  }
};

export const NullPermission = 0;
export const OwnerPermissionVal = ~0 >>> 0;
export const ReadPermissionVal = PermissionList['read'].value;
export const WritePermissionVal = PermissionList['write'].value;
export const ManagePermissionVal = PermissionList['manage'].value;
