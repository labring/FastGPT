import { GET, POST } from '@/web/common/api/request';
import type {
  GetMarketplaceToolsBodyType,
  MarketplaceToolListItemType,
  GetMarketplaceToolDetailQueryType,
  GetMarketplaceToolDetailResponseType,
  GetMarketplaceToolTagsResponseType,
  GetSystemInstalledPluginsQueryType,
  GetSystemInstalledPluginsResponseType
} from '@fastgpt/global/openapi/core/plugin/marketplace/api';
import type { PaginationResponse } from '@fastgpt/web/common/fetch/type';

export const getSystemInstalledPlugins = (data: GetSystemInstalledPluginsQueryType) =>
  GET<GetSystemInstalledPluginsResponseType>('/core/plugin/admin/marketplace/installed', data);

export const getMarketplaceTools = (data: GetMarketplaceToolsBodyType) =>
  POST<PaginationResponse<MarketplaceToolListItemType>>('/marketplace/api/tool/list', data);

export const getMarketplaceToolDetail = (data: GetMarketplaceToolDetailQueryType) =>
  GET<GetMarketplaceToolDetailResponseType>('/marketplace/api/tool/detail', data);

export const getMarketPlaceToolTags = () =>
  GET<GetMarketplaceToolTagsResponseType>('/marketplace/api/tool/tags');

export const getMarketplaceDownloadURL = (toolId: string) =>
  GET<string>('/marketplace/api/tool/getDownloadUrl', { toolId });

export const getMarketplaceDownloadURLs = (toolIds: string[]) =>
  POST<string[]>('/marketplace/api/tool/getDownloadUrl', { toolIds });

export const getMarketplaceToolVersions = () =>
  GET<Array<{ toolId: string; version: string }>>('/marketplace/api/tool/versions');
