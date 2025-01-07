export enum UserStatusEnum {
  active = 'active',
  forbidden = 'forbidden'
}
export const userStatusMap = {
  [UserStatusEnum.active]: {
    label: 'support.user.status.active'
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
  dingtalk = 'dingtalk',
  wecom = 'wecom',
  sso = 'sso'
}

export const defaultAvatars = [
  '/imgs/avatar/RoyalBlueAvatar.svg',
  '/imgs/avatar/PurpleAvatar.svg',
  '/imgs/avatar/AdoraAvatar.svg',
  '/imgs/avatar/OrangeAvatar.svg',
  '/imgs/avatar/RedAvatar.svg',
  '/imgs/avatar/GrayModernAvatar.svg',
  '/imgs/avatar/TealAvatar.svg',
  '/imgs/avatar/GreenAvatar.svg',
  '/imgs/avatar/BrightBlueAvatar.svg',
  '/imgs/avatar/BlueAvatar.svg'
];
