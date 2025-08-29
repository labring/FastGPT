import type { I18nStringType } from '../../../common/i18n/type';

export type ModelShowType = {
  id: string;
  name: string;
  avatar: string;
  order: number;
};

export type ModelProviderType = {
  id: string;
  name: I18nStringType;
  avatar: string;
  order: number;
};

export type ModelProviderListType = {
  id: string;
  name: I18nStringType | string;
  avatar: string;
  provider: string;
};

export type ModelProviderCacheType = {
  expires: number;
  listData: Array<ModelProviderType>;
  mapData: Array<ModelProviderListType>;
};

declare global {
  var modelProviders_cache: ModelProviderCacheType | undefined;
}
