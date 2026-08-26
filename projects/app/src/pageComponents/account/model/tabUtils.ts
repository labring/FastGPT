export type AccountModelTabType = 'model' | 'config' | 'channel' | 'log' | 'monitor';

type AccountModelTabLabelKey =
  | 'config_model:active_model'
  | 'config_model:config_model'
  | 'config_model:channel'
  | 'config_model:log'
  | 'config_model:monitoring';

/**
 * 生成普通模型管理页的一级 Tab。
 * 渠道、日志和监控均依赖 AI Proxy，关闭该能力时需要一起隐藏，避免进入不可用页面。
 */
export const getAccountModelTabs = (
  showAiproxy?: boolean
): { labelKey: AccountModelTabLabelKey; value: AccountModelTabType }[] => [
  { labelKey: 'config_model:active_model', value: 'model' },
  { labelKey: 'config_model:config_model', value: 'config' },
  ...(showAiproxy
    ? [
        { labelKey: 'config_model:channel' as const, value: 'channel' as const },
        { labelKey: 'config_model:log' as const, value: 'log' as const },
        { labelKey: 'config_model:monitoring' as const, value: 'monitor' as const }
      ]
    : [])
];
