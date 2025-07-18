export const I18N_NAMESPACES = [
  'common',
  'dataset',
  'app',
  'file',
  'publish',
  'workflow',
  'user',
  'chat',
  'login',
  'account_info',
  'account_usage',
  'account_bill',
  'account_apikey',
  'account_setting',
  'account_inform',
  'account_promotion',
  'account_thirdParty',
  'account',
  'account_team',
  'account_model',
  'dashboard_mcp',
  'dashboard_evaluation'
];

export const I18N_NAMESPACES_MAP = I18N_NAMESPACES.reduce(
  (acc, namespace) => {
    acc[namespace] = true;
    return acc;
  },
  {} as Record<string, boolean>
);
