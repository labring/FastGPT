import { GET, POST } from '@/web/common/api/request';
import type {
  GetMarketplaceToolsBodyType,
  MarketplaceToolsResponseType,
  GetMarketplaceToolDetailQueryType,
  GetMarketplaceToolDetailResponseType,
  GetMarketplaceToolTagsResponseType,
  GetMarketplaceToolVersionsResponseType,
  GetMarketplaceDownloadUrlResponseType,
  GetMarketplaceDownloadUrlsResponseType
} from '@fastgpt/global/openapi/core/plugin/marketplace/api';

export const getMarketplaceTools = (data: GetMarketplaceToolsBodyType) =>
  POST<MarketplaceToolsResponseType>('/marketplace/api/tool/list', data);

export const getMarketplaceToolDetail = (data: GetMarketplaceToolDetailQueryType) =>
  GET<GetMarketplaceToolDetailResponseType>('/marketplace/api/tool/detail', data);

export const getMarketPlaceToolTags = () =>
  GET<GetMarketplaceToolTagsResponseType>('/marketplace/api/tool/tags');

export const getMarketplaceDownloadURL = (
  toolId: string,
  version?: string,
  type?: 'tool' | 'moderation'
) =>
  GET<GetMarketplaceDownloadUrlResponseType>('/marketplace/api/tool/getDownloadUrl', {
    toolId,
    ...(version ? { version } : {}),
    ...(type ? { type } : {})
  });

export const getMarketplaceDownloadURLs = (toolIds: string[]) =>
  POST<GetMarketplaceDownloadUrlsResponseType>('/marketplace/api/tool/getDownloadUrl', {
    toolIds
  });

export const getMarketplaceToolVersions = (toolId?: string, type?: 'tool' | 'moderation') =>
  GET<GetMarketplaceToolVersionsResponseType>('/marketplace/api/tool/versions', {
    ...(toolId ? { toolId } : {}),
    ...(type ? { type } : {})
  });
