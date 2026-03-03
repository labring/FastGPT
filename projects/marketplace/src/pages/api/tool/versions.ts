import { getToolList } from '@/service/tool/data';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';

export type ToolListQuery = {};
export type ToolListBody = {};

export type ToolListResponse = { toolId: string; version: string }[];

async function handler(
  req: ApiRequestProps<ToolListBody, ToolListQuery>,
  res: ApiResponseType<any>
): Promise<ToolListResponse> {
  const data = await getToolList();

  return data
    .filter((item) => {
      if (item.parentId) return false;
      return true;
    })
    .map(({ toolId, version }) => ({
      toolId,
      version: version ?? ''
    }));
}

export default NextAPI(handler);
