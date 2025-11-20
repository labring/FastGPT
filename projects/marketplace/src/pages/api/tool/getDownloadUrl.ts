import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { getToolList } from '@/service/tool/data';
import { getPkgdownloadURL } from '@/service/s3';
import { increaseDownloadCount } from '@/service/downloadCount';

export type GetDownloadURLQuery = {
  toolId: string;
};
export type GetDownloadURLBody = {};
export type GetDownloadURLResponse = string;

async function handler(
  req: ApiRequestProps<GetDownloadURLBody, GetDownloadURLQuery>,
  res: ApiResponseType<any>
): Promise<GetDownloadURLResponse> {
  const { toolId } = req.query;
  if (!toolId) {
    return Promise.reject('toolId is required');
  }
  const tools = await getToolList();
  const tool = tools.find((item) => item.toolId === toolId);
  if (!tool) {
    return Promise.reject(`tool: ${toolId} not found`);
  }
  await increaseDownloadCount(toolId, 'tool');
  return getPkgdownloadURL(toolId);
}
export default NextAPI(handler);
