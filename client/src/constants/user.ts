export enum BillSourceEnum {
  fastgpt = 'fastgpt',
  api = 'api'
}
export enum PageTypeEnum {
  login = 'login',
  register = 'register',
  forgetPassword = 'forgetPassword'
}

export const BillSourceMap: Record<`${BillSourceEnum}`, string> = {
  [BillSourceEnum.fastgpt]: 'FastGpt 平台',
  [BillSourceEnum.api]: 'Api'
};

export enum PromotionEnum {
  invite = 'invite',
  shareModel = 'shareModel',
  withdraw = 'withdraw'
}

export const PromotionTypeMap = {
  [PromotionEnum.invite]: '好友充值',
  [PromotionEnum.shareModel]: '应用分享',
  [PromotionEnum.withdraw]: '提现'
};

export enum InformTypeEnum {
  system = 'system'
}

export const InformTypeMap = {
  [InformTypeEnum.system]: {
    label: '系统通知'
  }
};

export enum MyModelsTypeEnum {
  my = 'my',
  collection = 'collection'
}
