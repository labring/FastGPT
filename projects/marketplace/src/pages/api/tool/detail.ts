import { getToolList } from '@/service/tool/data';
import { ToolDetailSchema, type ToolDetailType } from '@fastgpt/global/sdk/fastgpt-plugin';
import { getPkgdownloadURL, getReadmeURL } from '@/service/s3';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';

export type ToolDetailQuery = {
  toolId: string;
};
export type ToolDetailBody = {};

export type ToolDetailResponse = {
  tools: Array<ToolDetailType & { readme: string }>;
  downloadCount: number;
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
  const tools = toolList.filter(
    (item) => item.toolId.startsWith(toolId + '/') || item.toolId === toolId
  );

  if (tools.length < 1) {
    res.status(404);
    Promise.reject('tool not found');
  }

  return {
    tools: tools.map((tool) => ({
      ...ToolDetailSchema.parse(tool),
      readme: getReadmeURL(toolId)
    })),
    downloadCount: tools.find((tool) => !tool.parentId)?.downloadCount ?? 0,
    downloadUrl: getPkgdownloadURL(toolId)
  };
}

export default NextAPI(handler);
