import { ModelProviders } from '../../sdk/fastgpt-plugin';

export type ModelProviderIdType = keyof typeof ModelProviders;
type ProviderValueTypes = (typeof ModelProviders)[ModelProviderIdType];
type langType = 'en' | 'zh-CN' | 'zh-Hant';

export type ModelProviderType = {
  id: ModelProviderIdType;
  name: any;
  avatar: string;
  order: number;
};

const getLocalizedName = (translations: ProviderValueTypes, language = 'en'): string => {
  return translations[language as langType];
};

export const formatModelProviderList = (language?: string) => {
  return Object.entries(ModelProviders).map(([id, translations], index) => ({
    id: id as ModelProviderIdType,
    name: getLocalizedName(translations, language),
    avatar: `/api/system/plugin/models/${id}.svg`,
    order: index
  }));
};
export const formatModelProviderMap = (language?: string) => {
  const provider = {} as Record<
    ModelProviderIdType,
    {
      id: string;
      name: string;
      avatar: string;
      order: number;
    }
  >;

  Object.entries(ModelProviders).forEach(([id, translations], index) => {
    provider[id as ModelProviderIdType] = {
      id: id as ModelProviderIdType,
      name: getLocalizedName(translations, language),
      avatar: `/api/system/plugin/models/${id}.svg`,
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

const defaultProvider = {
  id: 'Other' as ModelProviderIdType,
  name: 'Other',
  avatar: 'model/other',
  order: 0
};

export const getModelProviders = (language = 'en') => {
  return ModelProviderListCache[language as langType];
};

export const getModelProvider = (provider?: ModelProviderIdType, language = 'en') => {
  if (!provider) {
    return defaultProvider;
  }

  return ModelProviderMapCache[language as langType][provider] ?? defaultProvider;
};
