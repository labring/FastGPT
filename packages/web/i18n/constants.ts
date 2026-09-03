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
  'discount_coupon',
  'apikey',
  'account_setting',
  'account_inform',
  'account_thirdParty',
  'account',
  'account_team',
  'account_custom_domain',
  'config',
  'config_model',
  'system_migration',
  'marketplace',
  'dashboard_mcp',
  'dashboard_evaluation',
  'admin_plugin',
  'skill',
  'price'
];

export const I18N_NAMESPACES_MAP = I18N_NAMESPACES.reduce(
  (acc, namespace) => {
    acc[namespace] = true;
    return acc;
  },
  {} as Record<string, boolean>
);
