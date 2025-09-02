import type { I18nStringType } from '@fastgpt/global/common/i18n/type';
import { getProviderList } from '../../app/tool/api';
import type { ModelProviderType } from '@fastgpt/global/core/app/model/type';

export const defaultProvider: ModelProviderType = {
  id: 'Other',
  name: { en: 'Other' } as I18nStringType,
  avatar: 'model/other',
  order: 0
};

export const defaultMapData = [
  {
    id: 'Other',
    name: 'Other',
    avatar: 'model/other',
    provider: 'Other'
  }
];

// Preload model providers
export async function preloadModelProviders(): Promise<void> {
  const res = await getProviderList();

  const ModelProviders = Object.entries(res.ModelProviders).map(
    ([id, info]: [string, I18nStringType], index: number) => ({
      id: id,
      name: info,
      avatar: `/api/system/plugin/models/${id}.svg`,
      order: index
    })
  );

  const aiproxyIdMap = Object.entries(res.aiproxyIdMap).map(
    ([id, info]: [
      string,
      { name: I18nStringType | string; provider: string; avatar?: string }
    ]) => ({
      id,
      name: info.name,
      avatar: info.avatar || defaultProvider.avatar,
      provider: info.provider
    })
  );
  global.ModelProviders_cache = {
    listData: ModelProviders,
    mapData: new Map(ModelProviders.map((item) => [item.id, item]))
  };
  global.aiproxyIdMap_cache = {
    listData: aiproxyIdMap,
    mapData: new Map(aiproxyIdMap.map((item) => [item.id, item]))
  };
}

export const getModelProvider = (provider?: string, language = 'en') => {
  if (!provider) {
    return defaultProvider;
  }

  const providerData = global.ModelProviders_cache?.mapData.get(provider);
  if (!providerData) {
    return defaultProvider;
  }

  return {
    ...providerData,
    name: (providerData.name as I18nStringType)[language as keyof I18nStringType]
  };
};
