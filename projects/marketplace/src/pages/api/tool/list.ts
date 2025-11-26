import { getToolList } from '@/service/tool/data';
import type { PaginationProps, PaginationResponse } from '@fastgpt/web/common/fetch/type';
import { ToolSimpleSchema, type ToolSimpleType } from '@fastgpt/global/sdk/fastgpt-plugin';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { getPkgdownloadURL } from '@/service/s3';

export type ToolListQuery = {};
export type ToolListBody = PaginationProps<{
  searchKey?: string;
  tags?: string[];
}>;

export type ToolListItem = ToolSimpleType & {
  downloadCount: number;
};

export type ToolListResponse = PaginationResponse<ToolListItem>;

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
    if (tags && !tags.some((tag) => (item.tags as string[]).includes(tag))) return false;
    return true;
  });

  return {
    list: filteredData.slice(offset, offset + pageSize).map((item) => ({
      ...ToolSimpleSchema.parse(item),
      downloadCount: item.downloadCount,
      downloadUrl: getPkgdownloadURL(item.toolId)
    })),
    total: filteredData.length
  };
}

export default NextAPI(handler);
