import { i18nT } from '../../../../web/i18n/utils';

export enum InformLevelEnum {
  'common' = 'common',
  'important' = 'important',
  'emergency' = 'emergency'
}

export const InformLevelMap = {
  [InformLevelEnum.common]: {
    label: i18nT('admin:level_normal_text')
  },
  [InformLevelEnum.important]: {
    label: i18nT('admin:level_important_text')
  },
  [InformLevelEnum.emergency]: {
    label: i18nT('admin:level_urgent_text')
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
  CUSTOM = 'CUSTOM',
  MANAGE_RENAME = 'MANAGE_RENAME'
}
