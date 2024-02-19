export enum UsageSourceEnum {
  fastgpt = 'fastgpt',
  api = 'api',
  shareLink = 'shareLink',
  training = 'training'
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
  }
};
