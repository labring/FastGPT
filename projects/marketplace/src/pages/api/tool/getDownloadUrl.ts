import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { getToolList } from '@/service/tool/data';
import { getPkgdownloadURL } from '@/service/s3';
import { increaseDownloadCount } from '@/service/downloadCount';

export type GetDownloadURLQuery = {
  toolId?: string;
  version?: string;
};
export type GetDownloadURLBody = {
  toolIds?: string[];
};
export type GetDownloadURLResponse = string | string[];

async function handler(
  req: ApiRequestProps<GetDownloadURLBody, GetDownloadURLQuery>,
  res: ApiResponseType<any>
): Promise<GetDownloadURLResponse> {
  const { toolId, version } = req.query;
  const { toolIds } = req.body;
  if (!toolId && !toolIds) {
    throw new Error('toolId or toolIds is required');
  }

  const filterTools = toolIds && toolIds.length > 0 ? toolIds : toolId ? [toolId] : [];
  const toolList =
    toolId && version
      ? await getToolList({ toolId: toolId.split('/')[0], version })
      : await getToolList();
  const tools = toolList.filter((item) => filterTools.includes(item.toolId));

  if (toolId && version && tools.length === 0) {
    throw new Error('tool not found');
  }

  for await (const tool of tools) {
    await increaseDownloadCount(tool.toolId, 'tool');
  }

  return toolId
    ? tools[0]?.downloadUrl || getPkgdownloadURL(toolId)
    : Array.from(tools.map((tool) => tool.downloadUrl || getPkgdownloadURL(tool.toolId)));
}
export default NextAPI(handler);
