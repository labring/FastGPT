import { getToolVersionList } from '@/service/tool/data';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';

export type ToolListQuery = {
  toolId?: string;
  type?: 'tool' | 'moderation';
};
export type ToolListBody = {};

export type ToolListResponse = {
  toolId: string;
  version: string;
  etag?: string;
  type?: 'tool' | 'moderation';
}[];

async function handler(
  req: ApiRequestProps<ToolListBody, ToolListQuery>,
  res: ApiResponseType<any>
): Promise<ToolListResponse> {
  const { toolId, type } = req.query;

  return getToolVersionList(toolId, type);
}

export default NextAPI(handler);
