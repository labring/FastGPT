import { PermissionListType } from './type';
import { i18nT } from '../../../web/i18n/utils';
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
    name: i18nT('common:permission.read'),
    description: '',
    value: 0b100,
    checkBoxType: 'single'
  },
  [PermissionKeyEnum.write]: {
    name: i18nT('common:permission.write'),
    description: '',
    value: 0b110,
    checkBoxType: 'single'
  },
  [PermissionKeyEnum.manage]: {
    name: i18nT('common:permission.manager'),
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
