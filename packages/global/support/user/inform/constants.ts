export enum InformTypeEnum {
  system = 'system',
  admin = 'admin'
}

export const InformTypeMap = {
  [InformTypeEnum.system]: {
    label: '系统通知'
  },
  [InformTypeEnum.admin]: {
    label: '管理员'
  }
};
