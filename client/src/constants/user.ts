export enum OAuthEnum {
  github = 'github',
  google = 'google'
}
export enum BillSourceEnum {
  fastgpt = 'fastgpt',
  api = 'api',
  shareLink = 'shareLink',
  qa = 'qa',
  vector = 'vector'
}
export enum PageTypeEnum {
  login = 'login',
  register = 'register',
  forgetPassword = 'forgetPassword'
}

export const BillSourceMap: Record<`${BillSourceEnum}`, string> = {
  [BillSourceEnum.fastgpt]: '在线使用',
  [BillSourceEnum.api]: 'Api',
  [BillSourceEnum.shareLink]: '免登录链接',
  [BillSourceEnum.qa]: 'QA 拆分',
  [BillSourceEnum.vector]: '向量生成'
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
