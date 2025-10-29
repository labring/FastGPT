import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import type { ToolDetailResponse } from '@fastgpt/global/core/app/plugin/type';
import { useMarketplaceRequest } from '@fastgpt/service/core/app/plugin/marketplace/api';

export type GetMarketplaceToolDetailQuery = {
  toolId: string;
};

export type GetMarketplaceToolDetailResponse = ToolDetailResponse;

async function handler(
  req: ApiRequestProps<{}, GetMarketplaceToolDetailQuery>,
  res: ApiResponseType<GetMarketplaceToolDetailResponse>
): Promise<GetMarketplaceToolDetailResponse> {
  await authCert({ req, authToken: true });

  const { toolId } = req.query;

  const marketplaceRequest = useMarketplaceRequest();

  return marketplaceRequest.getToolDetail({ toolId });
}

export default NextAPI(handler);
