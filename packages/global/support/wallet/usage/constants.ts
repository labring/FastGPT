export enum UsageSourceEnum {
  fastgpt = 'fastgpt',
  api = 'api',
  shareLink = 'shareLink',
  training = 'training',

  // abandon
  standSubPlan = 'standSubPlan',
  extraDatasetSub = 'extraDatasetSub'
}

export const UsageSourceMap = {
  [UsageSourceEnum.fastgpt]: {
    label: '在线使用'
  },
  [UsageSourceEnum.api]: {
    label: 'Api'
  },
  [UsageSourceEnum.shareLink]: {
    label: '免登录链接'
  },
  [UsageSourceEnum.training]: {
    label: 'dataset.Training Name'
  },
  [UsageSourceEnum.standSubPlan]: {
    label: 'support.wallet.subscription.type.standard'
  },
  [UsageSourceEnum.extraDatasetSub]: {
    label: 'support.wallet.subscription.type.extraDatasetSize'
  }
};
