import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { getToolList } from '@/service/tool/data';
import { getPkgdownloadURL } from '@/service/s3';
import { increaseDownloadCount } from '@/service/downloadCount';

export type GetDownloadURLQuery = {
  toolId?: string;
};
export type GetDownloadURLBody = {
  toolIds?: string[];
};
export type GetDownloadURLResponse = string | string[];

async function handler(
  req: ApiRequestProps<GetDownloadURLBody, GetDownloadURLQuery>,
  res: ApiResponseType<any>
): Promise<GetDownloadURLResponse> {
  const { toolId } = req.query;
  const { toolIds } = req.body;
  if (!toolId && !toolIds) {
    return Promise.reject('toolId or toolIds is required');
  }

  const filterTools = toolIds && toolIds.length > 0 ? toolIds : toolId ? [toolId] : [];
  const tools = (await getToolList()).filter((item) => filterTools.includes(item.toolId));

  for await (const tool of tools) {
    await increaseDownloadCount(tool.toolId, 'tool');
  }

  return toolId
    ? getPkgdownloadURL(toolId)
    : Array.from(tools.map((tool) => getPkgdownloadURL(tool.toolId)));
}
export default NextAPI(handler);
