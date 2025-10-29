import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import type { ToolListItem } from '@fastgpt/global/core/app/plugin/type';
import type { PaginationProps, PaginationResponse } from '@fastgpt/web/common/fetch/type';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';
import { useMarketplaceRequest } from '@fastgpt/service/core/app/plugin/marketplace/api';

export type GetMarketplaceToolsQuery = {};
export type GetMarketplaceToolsBody = PaginationProps<{
  searchKey?: string;
  tags?: string[];
}>;

export type GetMarketplaceToolsResponse = PaginationResponse<ToolListItem>;

async function handler(
  req: ApiRequestProps<GetMarketplaceToolsBody, GetMarketplaceToolsQuery>,
  res: ApiResponseType<GetMarketplaceToolsResponse>
): Promise<GetMarketplaceToolsResponse> {
  await authCert({ req, authToken: true });

  const { pageSize, offset } = parsePaginationRequest(req);
  const { searchKey, tags } = req.body;

  const marketplaceRequest = useMarketplaceRequest();

  return marketplaceRequest.getToolList({
    pageNum: Math.floor(offset / pageSize) + 1,
    pageSize,
    searchKey,
    tags
  });
}

export default NextAPI(handler);
