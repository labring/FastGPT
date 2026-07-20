import enApp from '@fastgpt/web/i18n/en/app.json';
import enCommon from '@fastgpt/web/i18n/en/common.json';
import enWorkflow from '@fastgpt/web/i18n/en/workflow.json';
import zhCnApp from '@fastgpt/web/i18n/zh-CN/app.json';
import zhCnCommon from '@fastgpt/web/i18n/zh-CN/common.json';
import zhCnWorkflow from '@fastgpt/web/i18n/zh-CN/workflow.json';
import zhHantApp from '@fastgpt/web/i18n/zh-Hant/app.json';
import zhHantCommon from '@fastgpt/web/i18n/zh-Hant/common.json';
import zhHantWorkflow from '@fastgpt/web/i18n/zh-Hant/workflow.json';

type TranslationDictionary = Record<string, string>;

const resources: Record<string, Record<string, TranslationDictionary>> = {
  en: { app: enApp, common: enCommon, workflow: enWorkflow },
  'zh-CN': { app: zhCnApp, common: zhCnCommon, workflow: zhCnWorkflow },
  'zh-Hant': { app: zhHantApp, common: zhHantCommon, workflow: zhHantWorkflow }
};

/** 使用现有 Web 资源解析模板 key；未知 locale/key 明确回退英文或原值。 */
export const createTranslator = (locale: string) => {
  const localeResources = resources[locale] ?? resources.en;
  return (value: string) => {
    const separatorIndex = value.indexOf(':');
    if (separatorIndex <= 0) return value;
    const namespace = value.slice(0, separatorIndex);
    const key = value.slice(separatorIndex + 1);
    return localeResources[namespace]?.[key] ?? resources.en[namespace]?.[key] ?? value;
  };
};
