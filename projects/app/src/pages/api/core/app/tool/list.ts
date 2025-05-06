import { NextAPI } from '@/service/middleware/entry';
import { NodeTemplateListItemType } from '@fastgpt/global/core/workflow/type/node';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import axios from 'axios';

export type ToolListQuery = {
  type?: string;
};
export type ToolListBody = {};
export type ToolListResponse = NodeTemplateListItemType[];

const ToolBaseURL = process.env.TOOL_BASE_URL || 'http://localhost:3010';

async function handler(
  req: ApiRequestProps<ToolListBody, ToolListQuery>,
  res: ApiResponseType<any>
): Promise<ToolListResponse> {
  const { type } = req.query;
  const { data: list } = await axios.get('list', {
    baseURL: ToolBaseURL,
    params: {
      type
    }
  });
  return list;
}
export default NextAPI(handler);
