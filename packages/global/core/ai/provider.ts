import type { I18nStringStrictType } from '../../sdk/fastgpt-plugin';

export type ModelProviderItemType = {
  id: string;
  name: string;
  avatar: string;
  order: number;
};

export type ModelProviderListType = {
  id: string;
  name: I18nStringStrictType | string;
  avatar: string;
  provider: string;
};

export type langType = keyof I18nStringStrictType;

export const defaultProvider: ModelProviderItemType = {
  id: 'Other',
  name: 'Other',
  avatar: 'model/huggingface',
  order: 999
};

export const formatModelProviders = (
  data: { provider: string; value: I18nStringStrictType; avatar: string }[]
) => {
  const getLocalizedName = (translations: I18nStringStrictType, language = 'en'): string => {
    return translations[language as langType] || translations.en;
  };

  const formatModelProviderList = (language?: string): ModelProviderItemType[] => {
    return data.map(({ provider, value, avatar }, index) => ({
      id: provider,
      name: getLocalizedName(value, language),
      avatar,
      order: index
    }));
  };

  const formatModelProviderMap = (language?: string) => {
    const provider = {} as Record<string, ModelProviderItemType>;

    data.forEach(({ provider: id, value, avatar }, index) => {
      provider[id] = {
        id,
        name: getLocalizedName(value, language),
        avatar,
        order: index
      };
    });

    return provider;
  };

  const ModelProviderListCache = {
    en: formatModelProviderList('en'),
    'zh-CN': formatModelProviderList('zh-CN'),
    'zh-Hant': formatModelProviderList('zh-Hant')
  };
  const ModelProviderMapCache = {
    en: formatModelProviderMap('en'),
    'zh-CN': formatModelProviderMap('zh-CN'),
    'zh-Hant': formatModelProviderMap('zh-Hant')
  };

  return {
    ModelProviderListCache,
    ModelProviderMapCache
  };
};
