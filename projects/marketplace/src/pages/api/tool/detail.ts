import { getToolList } from '@/service/tool/data';
import { ToolSimpleSchema, type ToolDetailType } from '@fastgpt/global/sdk/fastgpt-plugin';
import { getPkgdownloadURL } from '@/service/s3';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';

export type ToolDetailQuery = {
  toolId: string;
};
export type ToolDetailBody = {};
export type ToolDetailResponse = {
  tool: ToolDetailType;
  downloadUrl: string;
};

async function handler(
  req: ApiRequestProps<ToolDetailBody, ToolDetailQuery>,
  res: ApiResponseType<any>
): Promise<ToolDetailResponse> {
  const { toolId } = req.query;

  if (!toolId) {
    throw new Error('toolId is required');
  }

  const toolList = await getToolList();
  const tool = toolList.find((item) => item.toolId === toolId);

  if (!tool) {
    throw new Error('tool not found');
  }

  return {
    tool: ToolSimpleSchema.parse(tool),
    downloadUrl: getPkgdownloadURL(toolId)
  };
}

export default NextAPI(handler);
