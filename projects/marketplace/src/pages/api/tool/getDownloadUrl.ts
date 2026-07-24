import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { getToolList } from '@/service/tool/data';
import { getPkgdownloadURL } from '@/service/s3';
import { increaseDownloadCount } from '@/service/downloadCount';

export type GetDownloadURLQuery = {
  toolId?: string;
  version?: string;
};
export type GetDownloadURLResponse = string;

async function handler(
  req: ApiRequestProps<Record<string, never>, GetDownloadURLQuery>,
  res: ApiResponseType<any>
): Promise<GetDownloadURLResponse> {
  const { toolId, version } = req.query;
  if (!toolId) {
    throw new Error('toolId is required');
  }

  const toolList =
    toolId && version
      ? await getToolList({ toolId: toolId.split('/')[0], version })
      : await getToolList();
  const tools = toolList.filter((item) => item.toolId === toolId);

  if (toolId && version && tools.length === 0) {
    throw new Error('tool not found');
  }

  for await (const tool of tools) {
    await increaseDownloadCount(tool.toolId, 'tool');
  }

  return tools[0]?.downloadUrl || getPkgdownloadURL(toolId);
}
export default NextAPI(handler);
