import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { plusRequest } from '@fastgpt/service/common/api/plusRequest';

export type OutLinkWecomQuery = any;
export type OutLinkWecomBody = any;
async function handler(
  req: ApiRequestProps<OutLinkWecomBody, OutLinkWecomQuery>,
  res: ApiResponseType<any>
): Promise<any> {
  const { token } = req.query;
  const result = await plusRequest({
    method: req.method,
    url: `support/outLink/wecom/${token}`,
    params: req.query,
    data: req.body
  });
  if (result.data?.data?.message) {
    return res.send(result.data.data.message);
  }

  return res.send('success');
}

export default handler;
