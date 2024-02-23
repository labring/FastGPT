// model price: xxx/1k tokens
// ￥1 = 100000.
export const PRICE_SCALE = 100000;

export enum BillSourceEnum {
  fastgpt = 'fastgpt',
  api = 'api',
  shareLink = 'shareLink',
  training = 'training',

  standSubPlan = 'standSubPlan',
  extraDatasetSub = 'extraDatasetSub'
}

export const BillSourceMap = {
  [BillSourceEnum.fastgpt]: {
    label: '在线使用'
  },
  [BillSourceEnum.api]: {
    label: 'Api'
  },
  [BillSourceEnum.shareLink]: {
    label: '免登录链接'
  },
  [BillSourceEnum.training]: {
    label: 'dataset.Training Name'
  },
  [BillSourceEnum.standSubPlan]: {
    label: 'support.wallet.subscription.type.standard'
  },
  [BillSourceEnum.extraDatasetSub]: {
    label: 'support.wallet.subscription.type.extraDatasetSize'
  }
};
