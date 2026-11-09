import { getToolVersionList } from '@/service/tool/data';
import {
  GetMarketplaceToolVersionsQuerySchema,
  type GetMarketplaceToolVersionsQueryType,
  type GetMarketplaceToolVersionsResponseType
} from '@fastgpt/global/openapi/core/plugin/marketplace/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';

export type ToolListQuery = GetMarketplaceToolVersionsQueryType;
export type ToolListBody = {};

export type ToolListResponse = GetMarketplaceToolVersionsResponseType;

async function handler(
  req: ApiRequestProps<ToolListBody, ToolListQuery>,
  res: ApiResponseType<any>
): Promise<ToolListResponse> {
  const {
    query: { toolId, type }
  } = parseApiInput({
    req,
    querySchema: GetMarketplaceToolVersionsQuerySchema
  });

  return getToolVersionList(toolId, type);
}

export default NextAPI(handler);
