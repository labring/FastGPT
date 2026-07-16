import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/types';
import { plusRequest } from '@fastgpt/service/common/api/plusRequest';

export type OutLinkOffiAccountQuery = any;
export type OutLinkOffiAccountBody = any;
async function handler(
  req: ApiRequestProps<OutLinkOffiAccountBody, OutLinkOffiAccountQuery>,
  res: ApiResponseType<any>
): Promise<any> {
  const { token } = req.query;
  const result = await plusRequest({
    method: req.method,
    url: `support/outLink/offiaccount/${token}`,
    params: req.query,
    data: req.body
  });

  if (result.data?.data?.message) {
    res.send(result.data.data.message);
  }

  res.send('');
}

export default handler;
