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
  REGISTER = 'REGISTER', // 注册
  RESET_PASSWORD = 'RESET_PASSWORD', // 重置密码
  BIND_NOTIFICATION = 'BIND_NOTIFICATION', // 绑定通知

  EXPIRE_SOON = 'EXPIRE_SOON', // 即将过期
  EXPIRED = 'EXPIRED', // 已过期
  FREE_CLEAN = 'FREE_CLEAN', // 免费版清理

  POINTS_THIRTY_PERCENT_REMAIN = 'POINTS_THIRTY_PERCENT_REMAIN', // 积分30%剩余
  POINTS_TEN_PERCENT_REMAIN = 'POINTS_TEN_PERCENT_REMAIN', // 积分10%剩余
  LACK_OF_POINTS = 'LACK_OF_POINTS', // 积分不足

  DATASET_INDEX_NO_REMAIN = 'DATASET_INDEX_NO_REMAIN', // 数据集索引0剩余
  DATASET_INDEX_TEN_PERCENT_REMAIN = 'DATASET_INDEX_TEN_PERCENT_REMAIN', // 数据集索引10%剩余
  DATASET_INDEX_THIRTY_PERCENT_REMAIN = 'DATASET_INDEX_THIRTY_PERCENT_REMAIN', // 数据集索引30%剩余

  MANAGE_RENAME = 'MANAGE_RENAME', // 管理员重命名
  CUSTOM = 'CUSTOM' // 自定义
}
