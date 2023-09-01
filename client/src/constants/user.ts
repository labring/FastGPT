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
  [BillSourceEnum.fastgpt]: 'FastGPT 平台',
  [BillSourceEnum.api]: 'Api',
  [BillSourceEnum.shareLink]: '免登录链接'
};

export enum PromotionEnum {
  register = 'register',
  pay = 'pay'
}

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
