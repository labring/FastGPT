import type { I18nStringType } from '../../../common/i18n/type';
import { getProviderList } from '../../../../service/core/app/tool/api';
import type { ModelProviderCacheType, ModelProviderType } from './type';
import type { ModelProviderIdType } from '@fastgpt-sdk/plugin';

export const defaultProvider: ModelProviderType = {
  id: 'Other',
  name: { en: 'Other' } as I18nStringType,
  avatar: 'model/other',
  order: 0
};

const defaultMapData = [
  {
    id: 'Other',
    name: 'Other',
    avatar: 'model/other',
    provider: 'Other' as ModelProviderIdType
  }
];

function getCachedModelProviders(): ModelProviderCacheType {
  if (!global.modelProviders_cache) {
    global.modelProviders_cache = {
      expires: 0,
      listData: [],
      mapData: []
    };
  }
  return global.modelProviders_cache;
}

function createCacheWithDefaults(): ModelProviderCacheType {
  return {
    expires: Date.now() + 60 * 60 * 1000,
    listData: [defaultProvider],
    mapData: defaultMapData
  };
}

// Preload model providers
export async function preloadModelProviders(): Promise<void> {
  try {
    const res = await getProviderList();

    if (res.mapData && res.listData) {
      const transformedListData = res.listData.map(
        (
          item: {
            id: string;
            info: I18nStringType;
          },
          index: number
        ) => ({
          id: item.id,
          name: item.info,
          avatar: `/api/system/plugin/models/${item.id}.svg`,
          order: index
        })
      );

      const transformedMapData = res.mapData.map(
        (item: {
          id: string;
          info: {
            name: I18nStringType | string;
            provider: string;
            avatar?: string;
          };
        }) => ({
          id: item.id,
          name: item.info.name,
          avatar: item.info.avatar || defaultProvider.avatar,
          provider: item.info.provider
        })
      );

      global.modelProviders_cache = {
        expires: Date.now() + 60 * 60 * 1000,
        listData: transformedListData,
        mapData: transformedMapData
      };
    } else {
      global.modelProviders_cache = createCacheWithDefaults();
    }
  } catch (error) {
    Promise.reject(error);
    global.modelProviders_cache = createCacheWithDefaults();
  }
}

function hasValidTranslation(name: I18nStringType | string, language: string): boolean {
  if (typeof name === 'string') return true;
  return Boolean(name[language as keyof I18nStringType]);
}

// Get model providers
export async function getModelProviders(language: string = 'en') {
  const cache = getCachedModelProviders();

  if (cache.listData.length === 0 || (cache.expires > 0 && Date.now() > cache.expires)) {
    await preloadModelProviders();
  }

  const updatedCache = getCachedModelProviders();

  return {
    listData: updatedCache.listData.filter((item) => hasValidTranslation(item.name, language)),
    mapData: updatedCache.mapData.filter((item) => hasValidTranslation(item.name, language))
  };
}

export const getModelProvider = async (provider?: ModelProviderIdType, language = 'en') => {
  const { listData } = await getModelProviders(language);
  if (!provider) {
    return defaultProvider;
  }
  return listData.find((item) => item.id === provider) || defaultProvider;
};
