import { GET, POST } from '@/web/common/api/request';
import type {
  GetMarketplaceToolsBodyType,
  MarketplaceToolListItemType,
  GetMarketplaceToolDetailQueryType,
  GetMarketplaceToolDetailResponseType,
  GetMarketplaceToolTagsResponseType,
  GetMarketplaceToolVersionsResponseType
} from '@fastgpt/global/openapi/core/plugin/marketplace/api';
import type { PaginationResponse } from '@fastgpt/global/openapi/api';

export const getMarketplaceTools = (data: GetMarketplaceToolsBodyType) =>
  POST<PaginationResponse<MarketplaceToolListItemType>>('/marketplace/api/tool/list', data);

export const getMarketplaceToolDetail = (data: GetMarketplaceToolDetailQueryType) =>
  GET<GetMarketplaceToolDetailResponseType>('/marketplace/api/tool/detail', data);

export const getMarketPlaceToolTags = () =>
  GET<GetMarketplaceToolTagsResponseType>('/marketplace/api/tool/tags');

export const getMarketplaceDownloadURL = (toolId: string, version?: string) =>
  GET<string>('/marketplace/api/tool/getDownloadUrl', {
    toolId,
    ...(version ? { version } : {})
  });

export const getMarketplaceDownloadURLs = (toolIds: string[]) =>
  POST<string[]>('/marketplace/api/tool/getDownloadUrl', { toolIds });

export const getMarketplaceToolVersions = (toolId?: string) =>
  GET<GetMarketplaceToolVersionsResponseType>('/marketplace/api/tool/versions', {
    ...(toolId ? { toolId } : {})
  });
