import enApp from './en/app.json';
import enCommon from './en/common.json';
import enWorkflow from './en/workflow.json';
import zhCnApp from './zh-CN/app.json';
import zhCnCommon from './zh-CN/common.json';
import zhCnWorkflow from './zh-CN/workflow.json';
import zhHantApp from './zh-Hant/app.json';
import zhHantCommon from './zh-Hant/common.json';
import zhHantWorkflow from './zh-Hant/workflow.json';
import koApp from './ko-KR/app.json';
import koCommon from './ko-KR/common.json';
import koWorkflow from './ko-KR/workflow.json';

type TranslationDictionary = Record<string, string>;

const resources: Record<string, Record<string, TranslationDictionary>> = {
  en: { app: enApp, common: enCommon, workflow: enWorkflow },
  'zh-CN': { app: zhCnApp, common: zhCnCommon, workflow: zhCnWorkflow },
  'zh-Hant': { app: zhHantApp, common: zhHantCommon, workflow: zhHantWorkflow },
  'ko-KR': { app: koApp, common: koCommon, workflow: koWorkflow }
};

/** CLI 与 Builder 共用模板文案，保证 checksum 一致；未知 locale/key 回退英文或原值。 */
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
