export enum InformLevelEnum {
  'common' = 'common',
  'important' = 'important',
  'emergency' = 'emergency'
}

export const InformLevelMap = {
  [InformLevelEnum.common]: {
    label: '普通'
  },
  [InformLevelEnum.important]: {
    label: '重要'
  },
  [InformLevelEnum.emergency]: {
    label: '紧急'
  }
};

export enum SendInformTemplateCodeEnum {
  EXPIRE_SOON = 'EXPIRE_SOON',
  EXPIRED = 'EXPIRED',
  FREE_CLEAN = 'FREE_CLEAN',
  REGISTER = 'REGISTER',
  RESET_PASSWORD = 'RESET_PASSWORD',
  BIND_NOTIFICATION = 'BIND_NOTIFICATION',
  LACK_OF_POINTS = 'LACK_OF_POINTS',
  CUSTOM = 'CUSTOM'
}
