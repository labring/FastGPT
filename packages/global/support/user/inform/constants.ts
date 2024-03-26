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
