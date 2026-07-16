import { getToolList } from '@/service/tool/data';
import type { PaginationProps, PaginationResponse } from '@fastgpt/global/openapi/api';
import { type ToolListItemType } from '@fastgpt/global/sdk/fastgpt-plugin';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/types';
import { NextAPI } from '@/service/middleware/entry';
import { getPkgdownloadURL } from '@/service/s3';
import {
  GetMarketplaceToolsBodySchema,
  MarketplaceOfficialSource,
  type MarketplaceSourceFilterType
} from '@fastgpt/global/openapi/core/plugin/marketplace/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

export type ToolListQuery = {};
export type ToolListBody = PaginationProps<{
  searchKey?: string;
  tags?: string[];
  source?: MarketplaceSourceFilterType;
}>;

export type ToolListItem = ToolListItemType & {
  downloadCount: number;
  downloadUrl: string;
  toolId: string;
  source?: string;
};

export type ToolListResponse = PaginationResponse<ToolListItem>;

const getToolTags = (item: { tags?: readonly string[] | null }): readonly string[] =>
  Array.isArray(item.tags) ? item.tags : [];

const hasSecretSchemaProperties = (secretSchema?: { properties?: Record<string, unknown> }) =>
  !!secretSchema?.properties && Object.keys(secretSchema.properties).length > 0;

const matchSource = (itemSource: string | undefined, source: MarketplaceSourceFilterType) => {
  if (source === MarketplaceOfficialSource) {
    return !itemSource || itemSource === MarketplaceOfficialSource;
  }

  return itemSource === source;
};

async function handler(
  req: ApiRequestProps<ToolListBody, ToolListQuery>,
  res: ApiResponseType<any>
): Promise<ToolListResponse> {
  const { body } = parseApiInput({
    req,
    bodySchema: GetMarketplaceToolsBodySchema
  });
  const { pageSize, offset } = parsePaginationRequest(req);
  const { searchKey, tags, source } = body;

  const data = await getToolList();
  const filteredData = data.filter((item) => {
    if (item.parentId) {
      return false;
    }
    if (
      searchKey &&
      !(
        Object.values(item.name).join('') +
        Object.values(item.description).join('') +
        item.toolId
      ).includes(searchKey)
    )
      return false;
    if (tags && !tags.some((tag) => getToolTags(item).includes(tag))) return false;
    if (source && !matchSource(item.source, source)) return false;
    return true;
  });

  return {
    list: filteredData.slice(offset, offset + pageSize).map((item) => ({
      ...item,
      hasSecret: hasSecretSchemaProperties(item.secretSchema),
      downloadCount: item.downloadCount,
      downloadUrl: item.downloadUrl || getPkgdownloadURL(item.toolId)
    })),
    total: filteredData.length
  };
}

export default NextAPI(handler);
