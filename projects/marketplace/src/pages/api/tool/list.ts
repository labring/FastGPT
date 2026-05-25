import { getToolList } from '@/service/tool/data';
import type { PaginationProps, PaginationResponse } from '@fastgpt/global/openapi/api';
import { type ToolListItemType } from '@fastgpt/global/sdk/fastgpt-plugin';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { getPkgdownloadURL } from '@/service/s3';

export type ToolListQuery = {};
export type ToolListBody = PaginationProps<{
  searchKey?: string;
  tags?: string[];
}>;

export type ToolListItem = ToolListItemType & {
  downloadCount: number;
  downloadUrl: string;
  toolId: string;
};

export type ToolListResponse = PaginationResponse<ToolListItem>;

const getToolTags = (item: { tags?: readonly string[] | null }): readonly string[] =>
  Array.isArray(item.tags) ? item.tags : [];

async function handler(
  req: ApiRequestProps<ToolListBody, ToolListQuery>,
  res: ApiResponseType<any>
): Promise<ToolListResponse> {
  const { pageSize, offset } = parsePaginationRequest(req);
  const { searchKey, tags } = req.body;

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
    return true;
  });

  return {
    list: filteredData.slice(offset, offset + pageSize).map((item) => ({
      ...item,
      hasSecret: !!item?.secretSchema?.properties?.length,
      downloadCount: item.downloadCount,
      downloadUrl: item.downloadUrl || getPkgdownloadURL(item.toolId)
    })),
    total: filteredData.length
  };
}

export default NextAPI(handler);
