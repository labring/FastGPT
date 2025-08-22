import { ProviderTranslations } from '@fastgpt-sdk/plugin';

export type ModelProviderIdType = keyof typeof ProviderTranslations;

export type ModelProviderType = {
  id: ModelProviderIdType;
  name: any;
  avatar: string;
  order?: number;
};

const getLocalizedName = (translations: any, language: string): string => {
  const languageMap: Record<string, keyof typeof translations> = {
    en: 'en',
    'zh-CN': 'zh-CN',
    'zh-Hant': 'zh-Hant'
  };

  const targetLang = languageMap[language] || 'en';
  return translations[targetLang];
};

export const ModelProviderList = (language?: string) => {
  return Object.entries(ProviderTranslations).map(([id, translations], index) => ({
    id: id as ModelProviderIdType,
    name: getLocalizedName(translations, language || 'en'),
    avatar: `/api/system/plugin/models/${id}.svg`,
    order: index
  }));
};
export const getModelProvider = (provider?: ModelProviderIdType, language?: string) => {
  const providerTranslations = ModelProviderList(language);

  const defaultProvider = {
    id: 'Other' as ModelProviderIdType,
    name: 'Other',
    avatar: 'model/other',
    order: Infinity
  };

  if (!provider) {
    return defaultProvider;
  }

  return providerTranslations.find((item) => item.id === provider) ?? defaultProvider;
};
