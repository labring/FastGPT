import { getToolVersionList } from '@/service/tool/data';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';

export type ToolListQuery = {
  toolId?: string;
};
export type ToolListBody = {};

export type ToolListResponse = { toolId: string; version: string; etag?: string }[];

async function handler(
  req: ApiRequestProps<ToolListBody, ToolListQuery>,
  res: ApiResponseType<any>
): Promise<ToolListResponse> {
  const { toolId } = req.query;

  return getToolVersionList(toolId);
}

export default NextAPI(handler);
