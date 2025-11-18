import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { getToolList } from '@/service/tool/data';
import { getPkgdownloadURL } from '@/service/s3';
import { increseDownloadCount } from '@/service/downloadCount';

export type GetDownloadURLQuery = {
  toolId: string;
};
export type GetDownloadURLBody = {};
export type GetDownloadURLResponse = string;

async function handler(
  req: ApiRequestProps<GetDownloadURLBody, GetDownloadURLQuery>,
  res: ApiResponseType<any>
): Promise<GetDownloadURLResponse> {
  if (!req.query.toolId) {
    return Promise.reject('toolId is required');
  }
  const tools = await getToolList();
  const tool = tools.find((item) => item.toolId === req.query.toolId);
  if (!tool) {
    return Promise.reject('tool not found');
  }
  await increseDownloadCount(req.query.toolId, 'tool');
  return getPkgdownloadURL(req.query.toolId);
}
export default NextAPI(handler);
