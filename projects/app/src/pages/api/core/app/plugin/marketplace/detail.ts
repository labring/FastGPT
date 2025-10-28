import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import type { ToolListItem } from '@fastgpt/global/core/app/plugin/type';

const MARKETPLACE_URL = process.env.MARKETPLACE_URL || '';

export type GetMarketplaceToolDetailQuery = {
  toolId: string;
};

export type GetMarketplaceToolDetailResponse = ToolListItem;

async function handler(
  req: ApiRequestProps<{}, GetMarketplaceToolDetailQuery>,
  res: ApiResponseType<GetMarketplaceToolDetailResponse>
): Promise<GetMarketplaceToolDetailResponse> {
  await authCert({ req, authToken: true });

  if (!MARKETPLACE_URL) {
    throw new Error('MARKETPLACE_URL is not configured');
  }

  const { toolId } = req.query;

  if (!toolId) {
    throw new Error('Tool ID is required');
  }

  const url = `${MARKETPLACE_URL}/api/tool/detail?toolId=${toolId}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Marketplace API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.data;
}

export default NextAPI(handler);
