import { defaultProvider } from '@fastgpt/service/core/app/provider/controller';
import { useSystemStore } from './useSystemStore';
import type { I18nStringType } from '@fastgpt/global/common/i18n/type';

// get model providers from store
export const getModelProviders = () => {
  const { ModelProviders, aiproxyIdMap } = useSystemStore.getState();

  return {
    providerList: ModelProviders.listData,
    providerMap: ModelProviders.mapData,
    aiproxyIdList: aiproxyIdMap.listData,
    aiproxyIdMap: aiproxyIdMap.mapData
  };
};

// get exact model provider from store
export const getModelProvider = (provider?: string, language = 'en') => {
  const { ModelProviders } = useSystemStore.getState();

  if (!provider) {
    return defaultProvider;
  }

  const mapData = new Map(ModelProviders.listData.map((item) => [item.id, item]));
  const providerData = mapData.get(provider) ?? defaultProvider;

  if (!providerData) {
    return defaultProvider;
  }

  return {
    ...providerData,
    name: (providerData.name as I18nStringType)[language as keyof I18nStringType]
  };
};
