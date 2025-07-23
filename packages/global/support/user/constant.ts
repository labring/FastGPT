export enum UserStatusEnum {
  active = 'active',
  inactive = 'inactive',
  forbidden = 'forbidden'
}
export const userStatusMap = {
  [UserStatusEnum.active]: {
    label: 'support.user.status.active'
  },
  [UserStatusEnum.inactive]: {
    label: 'support.user.status.inactive'
  },
  [UserStatusEnum.forbidden]: {
    label: 'support.user.status.forbidden'
  }
};

export enum OAuthEnum {
  github = 'github',
  google = 'google',
  wechat = 'wechat',
  microsoft = 'microsoft',
  sso = 'sso'
}
