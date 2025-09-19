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
  dingtalk = 'dingtalk',
  official_account = 'official_account',
  pdfParse = 'pdfParse',
  mcp = 'mcp',
  evaluation = 'evaluation',
  optimize_prompt = 'optimize_prompt',
  code_copilot = 'code_copilot'
}

export const UsageSourceMap = {
  [UsageSourceEnum.fastgpt]: {
    label: i18nT('common:core.chat.logs.online')
  },
  [UsageSourceEnum.api]: {
    label: 'API'
  },
  [UsageSourceEnum.shareLink]: {
    label: i18nT('common:core.chat.logs.free_login')
  },
  [UsageSourceEnum.training]: {
    label: i18nT('common:dataset.Training Name')
  },
  [UsageSourceEnum.cronJob]: {
    label: i18nT('common:cron_job_run_app')
  },
  [UsageSourceEnum.feishu]: {
    label: i18nT('account_usage:feishu')
  },
  [UsageSourceEnum.official_account]: {
    label: i18nT('account_usage:official_account')
  },
  [UsageSourceEnum.share]: {
    label: i18nT('account_usage:share')
  },
  [UsageSourceEnum.wecom]: {
    label: i18nT('account_usage:wecom')
  },
  [UsageSourceEnum.dingtalk]: {
    label: i18nT('account_usage:dingtalk')
  },
  [UsageSourceEnum.pdfParse]: {
    label: i18nT('account_usage:pdf_parse')
  },
  [UsageSourceEnum.mcp]: {
    label: i18nT('account_usage:mcp')
  },
  [UsageSourceEnum.evaluation]: {
    label: i18nT('account_usage:evaluation')
  },
  [UsageSourceEnum.optimize_prompt]: {
    label: i18nT('common:support.wallet.usage.Optimize Prompt')
  },
  [UsageSourceEnum.code_copilot]: {
    label: i18nT('common:support.wallet.usage.Code Copilot')
  }
};

export enum UsageItemTypeEnum {
  training_vector = 1,
  training_qa = 2,
  training_autoIndex = 3,
  training_imageIndex = 4,
  training_paragraph = 5,
  training_imageParse = 6,

  evaluation_generateAnswer = 7,
  evaluation_answerAccuracy = 8
}
