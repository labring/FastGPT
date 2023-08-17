import { useTranslation } from 'react-i18next';

const { t } = useTranslation();

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
  [BillSourceEnum.fastgpt]: 'FastGpt 平台',
  [BillSourceEnum.api]: 'Api',
  [BillSourceEnum.shareLink]: t('免登录链接')
};

export enum PromotionEnum {
  invite = 'invite',
  shareModel = 'shareModel',
  withdraw = 'withdraw'
}

export const PromotionTypeMap = {
  [PromotionEnum.invite]: t('好友充值'),
  [PromotionEnum.shareModel]: t('应用分享'),
  [PromotionEnum.withdraw]: t('提现')
};

export enum InformTypeEnum {
  system = 'system'
}

export const InformTypeMap = {
  [InformTypeEnum.system]: {
    label: t('系统通知')
  }
};

export enum MyModelsTypeEnum {
  my = 'my',
  collection = 'collection'
}
