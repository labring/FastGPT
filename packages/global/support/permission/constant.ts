export enum AuthUserTypeEnum {
  token = 'token',
  root = 'root',
  apikey = 'apikey',
  outLink = 'outLink'
}

export enum PermissionTypeEnum {
  'private' = 'private',
  'public' = 'public'
}
export const PermissionTypeMap = {
  [PermissionTypeEnum.private]: {
    iconLight: 'support/permission/privateLight',
    label: 'permission.Private'
  },
  [PermissionTypeEnum.public]: {
    iconLight: 'support/permission/publicLight',
    label: 'permission.Public'
  }
};
