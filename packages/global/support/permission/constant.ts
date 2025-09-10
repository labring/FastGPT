import type { PermissionListType, PermissionValueType, RolePerMapType } from './type';
import { type RoleListType } from './type';
import { i18nT } from '../../../web/i18n/utils';
import { sumPer } from './utils';
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

export const NullRoleVal = 0;
export const NullPermissionVal = 0;
export const OwnerRoleVal = ~0 >>> 0;
export const OwnerPermissionVal = ~0 >>> 0;

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
    label: i18nT('user:permission.team_read')
  },
  [PermissionTypeEnum.publicWrite]: {
    iconLight: 'support/permission/publicLight',
    label: i18nT('user:permission.team_write')
  },
  [PermissionTypeEnum.clbPrivate]: {
    iconLight: 'support/permission/privateLight',
    label: i18nT('user:permission.only_collaborators')
  }
};

export enum PerResourceTypeEnum {
  team = 'team',
  app = 'app',
  dataset = 'dataset',
  model = 'model'
}

/* new permission */
export enum CommonPerKeyEnum {
  owner = 'owner',
  read = 'read',
  write = 'write',
  manage = 'manage'
}

export enum CommonRoleKeyEnum {
  read = 'read',
  write = 'write',
  manage = 'manage'
}

export const CommonPerList: PermissionListType = {
  [CommonPerKeyEnum.owner]: OwnerRoleVal,
  [CommonPerKeyEnum.read]: 0b100,
  [CommonPerKeyEnum.write]: 0b010,
  [CommonPerKeyEnum.manage]: 0b001
} as const;

export const CommonRoleList: RoleListType = {
  [CommonRoleKeyEnum.read]: {
    name: i18nT('common:permission.read'),
    description: '',
    value: 0b100,
    checkBoxType: 'single'
  },
  [CommonRoleKeyEnum.write]: {
    name: i18nT('common:permission.write'),
    description: '',
    value: 0b010,
    checkBoxType: 'single'
  },
  [CommonRoleKeyEnum.manage]: {
    name: i18nT('common:permission.manager'),
    description: '',
    value: 0b001,
    checkBoxType: 'single'
  }
} as const;

export const CommonRolePerMap: RolePerMapType = new Map([
  [CommonRoleList['read'].value, CommonPerList.read],
  [
    CommonRoleList['write'].value,
    sumPer(CommonPerList.write, CommonPerList.read) as PermissionValueType
  ],
  [
    CommonRoleList['manage'].value,
    sumPer(CommonPerList.manage, CommonPerList.write, CommonPerList.read) as PermissionValueType
  ]
]);

export const ReadRoleVal = CommonRoleList['read'].value;
export const WriteRoleVal = CommonRoleList['write'].value;
export const ManageRoleVal = CommonRoleList['manage'].value;

export const ManagePermissionVal = CommonPerList.manage;
export const ReadPermissionVal = CommonPerList.read;
export const WritePermissionVal = CommonPerList.write;
