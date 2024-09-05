import { i18nT } from '../../../../web/i18n/utils';

export enum UsageSourceEnum {
  fastgpt = 'fastgpt',
  api = 'api',
  shareLink = 'shareLink',
  training = 'training',
  cronJob = 'cronJob',
  share = 'share',
  wecom = 'wecom',
  feishu = 'feishu',
  official_account = 'official_account'
}

export const UsageSourceMap = {
  [UsageSourceEnum.fastgpt]: {
    label: i18nT('common:core.chat.logs.online')
  },
  [UsageSourceEnum.api]: {
    label: 'Api'
  },
  [UsageSourceEnum.shareLink]: {
    label: i18nT('common:core.chat.logs.free_login')
  },
  [UsageSourceEnum.training]: {
    label: 'dataset.Training Name'
  },
  [UsageSourceEnum.cronJob]: {
    label: i18nT('common:cron_job_run_app')
  },
  [UsageSourceEnum.feishu]: {
    label: i18nT('user:usage.feishu')
  },
  [UsageSourceEnum.official_account]: {
    label: i18nT('user:usage.official_account')
  },
  [UsageSourceEnum.share]: {
    label: i18nT('user:usage.share')
  },
  [UsageSourceEnum.wecom]: {
    label: i18nT('user:usage.wecom')
  }
};
