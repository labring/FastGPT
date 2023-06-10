export enum BillTypeEnum {
  chat = 'chat',
  openapiChat = 'openapiChat',
  QA = 'QA',
  vector = 'vector',
  return = 'return'
}
export enum PageTypeEnum {
  login = 'login',
  register = 'register',
  forgetPassword = 'forgetPassword'
}

export const BillTypeMap: Record<`${BillTypeEnum}`, string> = {
  [BillTypeEnum.chat]: '对话',
  [BillTypeEnum.openapiChat]: 'api 对话',
  [BillTypeEnum.QA]: 'QA拆分',
  [BillTypeEnum.vector]: '索引生成',
  [BillTypeEnum.return]: '退款'
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
