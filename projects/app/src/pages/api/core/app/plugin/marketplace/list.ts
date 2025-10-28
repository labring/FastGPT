import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import type { ToolListItem } from '@fastgpt/global/core/app/plugin/type';
import type { PaginationProps, PaginationResponse } from '@fastgpt/web/common/fetch/type';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';

const MARKETPLACE_URL = process.env.MARKETPLACE_URL || '';

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

  if (!MARKETPLACE_URL) {
    return Promise.reject(new Error('MARKETPLACE_URL is not configured'));
  }

  const { pageSize, offset } = parsePaginationRequest(req);
  const { searchKey, tags } = req.body;

  const url = `${MARKETPLACE_URL}/api/tool/list`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      pageNum: Math.floor(offset / pageSize) + 1,
      pageSize,
      searchKey,
      tags
    })
  });

  if (!response.ok) {
    throw new Error(`Marketplace API error: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();
  return result.data;
}

export default NextAPI(handler);
