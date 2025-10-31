import { GET, POST } from '@/web/common/api/request';
import type {
  GetMarketplaceToolsBodyType,
  MarketplaceToolsResponseType,
  GetMarketplaceToolDetailQueryType,
  GetMarketplaceToolDetailResponseType,
  GetMarketplaceToolTagsResponseType
} from '@fastgpt/global/openapi/core/plugin/marketplace/api';

/* ============ marketplace ============== */
export const getMarketplaceTools = (data: GetMarketplaceToolsBodyType) =>
  POST<MarketplaceToolsResponseType>('/marketplace/api/tool/list', data);

export const getMarketplaceToolDetail = (data: GetMarketplaceToolDetailQueryType) =>
  GET<GetMarketplaceToolDetailResponseType>('/marketplace/api/tool/detail', data);

export const getMarketPlaceToolTags = () =>
  GET<GetMarketplaceToolTagsResponseType>('/marketplace/api/tool/tags');
