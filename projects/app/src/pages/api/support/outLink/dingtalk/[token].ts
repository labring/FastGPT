import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { POST, GET } from '@fastgpt/service/common/api/plusRequest';

export type OutLinkDingtalkQuery = any;
export type OutLinkDingtalkBody = any;
export type OutLinkFeishuResponse = {};

async function handler(
  req: ApiRequestProps<OutLinkDingtalkBody, OutLinkDingtalkQuery>,
  res: ApiResponseType<any>
): Promise<void> {
  // send to pro
  const { token } = req.query;
  const method = req.method === 'POST' ? POST : GET;
  const result = await method<any>(`support/outLink/dingtalk/${token}`, req.body, {
    headers: req.headers as any
  });
  res.json(result);
}

export default handler;
