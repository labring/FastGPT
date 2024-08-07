import { i18nT } from '../../../../web/i18n/utils';

export enum UsageSourceEnum {
  fastgpt = 'fastgpt',
  api = 'api',
  shareLink = 'shareLink',
  training = 'training',
  cronJob = 'cronJob'
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
  [UsageSourceEnum.cronJob]: {
    label: i18nT('common:cron_job_run_app')
  }
};
