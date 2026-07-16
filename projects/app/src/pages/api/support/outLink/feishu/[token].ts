import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/types';
import { POST } from '@fastgpt/service/common/api/plusRequest';

export type OutLinkFeishuQuery = any;
export type OutLinkFeishuBody = any;
async function handler(
  req: ApiRequestProps<OutLinkFeishuBody, OutLinkFeishuQuery>,
  res: ApiResponseType<any>
): Promise<void> {
  // send to pro
  const { token } = req.query;
  const result = await POST<any>(`/support/outLink/feishu/${token}`, req.body, {
    headers: req.headers as any
  });
  res.json(result);
}

export default handler;
