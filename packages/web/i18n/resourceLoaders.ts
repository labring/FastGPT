import type { I18nNsType } from './i18next';
import type { localeType } from '@fastgpt/global/common/i18n/type';

type LocaleResource = Record<string, string | Record<string, unknown>>;
type ResourceLoader = () => Promise<{ default: LocaleResource }>;

const loaders: Record<localeType, Record<I18nNsType[number], ResourceLoader>> = {
  en: {
    common: () => import('./en/common.json'),
    account: () => import('./en/account.json'),
    apikey: () => import('./en/apikey.json'),
    publish: () => import('./en/publish.json'),
    workflow: () => import('./en/workflow.json'),
    app: () => import('./en/app.json'),
    chat: () => import('./en/chat.json'),
    dataset: () => import('./en/dataset.json'),
    file: () => import('./en/file.json'),
    user: () => import('./en/user.json'),
    login: () => import('./en/login.json'),
    skill: () => import('./en/skill.json'),
    account_info: () => import('./en/account_info.json'),
    account_usage: () => import('./en/account_usage.json'),
    account_bill: () => import('./en/account_bill.json'),
    discount_coupon: () => import('./en/discount_coupon.json'),
    account_setting: () => import('./en/account_setting.json'),
    account_inform: () => import('./en/account_inform.json'),
    account_thirdParty: () => import('./en/account_thirdParty.json'),
    account_team: () => import('./en/account_team.json'),
    account_model: () => import('./en/account_model.json'),
    account_custom_domain: () => import('./en/account_custom_domain.json'),
    dashboard_mcp: () => import('./en/dashboard_mcp.json'),
    dashboard_evaluation: () => import('./en/dashboard_evaluation.json'),
    admin_plugin: () => import('./en/admin_plugin.json'),
    price: () => import('./en/price.json')
  },
  'zh-CN': {
    common: () => import('./zh-CN/common.json'),
    dataset: () => import('./zh-CN/dataset.json'),
    app: () => import('./zh-CN/app.json'),
    file: () => import('./zh-CN/file.json'),
    account: () => import('./zh-CN/account.json'),
    apikey: () => import('./zh-CN/apikey.json'),
    publish: () => import('./zh-CN/publish.json'),
    workflow: () => import('./zh-CN/workflow.json'),
    user: () => import('./zh-CN/user.json'),
    chat: () => import('./zh-CN/chat.json'),
    login: () => import('./zh-CN/login.json'),
    account_info: () => import('./zh-CN/account_info.json'),
    account_usage: () => import('./zh-CN/account_usage.json'),
    account_bill: () => import('./zh-CN/account_bill.json'),
    discount_coupon: () => import('./zh-CN/discount_coupon.json'),
    account_setting: () => import('./zh-CN/account_setting.json'),
    account_inform: () => import('./zh-CN/account_inform.json'),
    account_thirdParty: () => import('./zh-CN/account_thirdParty.json'),
    account_team: () => import('./zh-CN/account_team.json'),
    account_model: () => import('./zh-CN/account_model.json'),
    account_custom_domain: () => import('./zh-CN/account_custom_domain.json'),
    dashboard_mcp: () => import('./zh-CN/dashboard_mcp.json'),
    dashboard_evaluation: () => import('./zh-CN/dashboard_evaluation.json'),
    admin_plugin: () => import('./zh-CN/admin_plugin.json'),
    skill: () => import('./zh-CN/skill.json'),
    price: () => import('./zh-CN/price.json')
  },
  'zh-Hant': {
    common: () => import('./zh-Hant/common.json'),
    dataset: () => import('./zh-Hant/dataset.json'),
    app: () => import('./zh-Hant/app.json'),
    file: () => import('./zh-Hant/file.json'),
    account: () => import('./zh-Hant/account.json'),
    apikey: () => import('./zh-Hant/apikey.json'),
    publish: () => import('./zh-Hant/publish.json'),
    workflow: () => import('./zh-Hant/workflow.json'),
    user: () => import('./zh-Hant/user.json'),
    chat: () => import('./zh-Hant/chat.json'),
    login: () => import('./zh-Hant/login.json'),
    account_info: () => import('./zh-Hant/account_info.json'),
    account_usage: () => import('./zh-Hant/account_usage.json'),
    account_bill: () => import('./zh-Hant/account_bill.json'),
    discount_coupon: () => import('./zh-Hant/discount_coupon.json'),
    account_setting: () => import('./zh-Hant/account_setting.json'),
    account_inform: () => import('./zh-Hant/account_inform.json'),
    account_thirdParty: () => import('./zh-Hant/account_thirdParty.json'),
    account_team: () => import('./zh-Hant/account_team.json'),
    account_model: () => import('./zh-Hant/account_model.json'),
    account_custom_domain: () => import('./zh-Hant/account_custom_domain.json'),
    dashboard_mcp: () => import('./zh-Hant/dashboard_mcp.json'),
    dashboard_evaluation: () => import('./zh-Hant/dashboard_evaluation.json'),
    admin_plugin: () => import('./zh-Hant/admin_plugin.json'),
    skill: () => import('./zh-Hant/skill.json'),
    price: () => import('./zh-Hant/price.json')
  }
};

const loadLocaleResource = async (language: localeType, namespace: I18nNsType[number]) => {
  const loader = loaders[language][namespace];
  if (!loader) {
    throw new Error(`Missing i18n resource loader: ${language}/${namespace}`);
  }
  return (await loader()).default;
};

export { loaders, loadLocaleResource };
