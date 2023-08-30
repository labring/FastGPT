export enum BillSourceEnum {
  fastgpt = 'fastgpt',
  api = 'api',
  shareLink = 'shareLink'
}
export enum PageTypeEnum {
  login = 'login',
  register = 'register',
  forgetPassword = 'forgetPassword'
}

export const BillSourceMap: Record<`${BillSourceEnum}`, string> = {
  [BillSourceEnum.fastgpt]: 'FastGpt platform',
  [BillSourceEnum.api]: 'Api',
  [BillSourceEnum.shareLink]: 'Login free link'
};

export enum PromotionEnum {
  invite = 'invite',
  shareModel = 'shareModel',
  withdraw = 'withdraw'
}

export const PromotionTypeMap = {
  [PromotionEnum.invite]: 'friend recharge',
  [PromotionEnum.shareModel]: 'app sharing',
  [PromotionEnum.withdraw]: 'withdraw'
};

export enum InformTypeEnum {
  system = 'system'
}

export const InformTypeMap = {
  [InformTypeEnum.system]: {
    label: 'system notification'
  }
};

export enum MyModelsTypeEnum {
  my = 'my',
  collection = 'collection'
}
