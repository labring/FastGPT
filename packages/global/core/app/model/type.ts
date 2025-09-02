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

declare global {
  var ModelProviders_cache:
    | { listData: Array<ModelProviderType>; mapData: Map<string, ModelProviderType> }
    | undefined;
  var aiproxyIdMap_cache:
    | { listData: Array<ModelProviderListType>; mapData: Map<string, ModelProviderListType> }
    | undefined;
}
