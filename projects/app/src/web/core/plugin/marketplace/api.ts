import { GET, POST } from '@/web/common/api/request';
import type {
  GetMarketplaceToolsBodyType,
  MarketplaceToolListItemType,
  GetMarketplaceToolDetailQueryType,
  GetMarketplaceToolDetailResponseType,
  GetMarketplaceToolTagsResponseType
} from '@fastgpt/global/openapi/core/plugin/marketplace/api';
import type { PaginationResponse } from '@fastgpt/web/common/fetch/type';

/* ============ marketplace ============== */
export const getMarketplaceTools = (data: GetMarketplaceToolsBodyType) =>
  POST<PaginationResponse<MarketplaceToolListItemType>>('/marketplace/api/tool/list', data);

export const getMarketplaceToolDetail = (data: GetMarketplaceToolDetailQueryType) =>
  GET<GetMarketplaceToolDetailResponseType>('/marketplace/api/tool/detail', data);

export const getMarketPlaceToolTags = () =>
  GET<GetMarketplaceToolTagsResponseType>('/marketplace/api/tool/tags');
