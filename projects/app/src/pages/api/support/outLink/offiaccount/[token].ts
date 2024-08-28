import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { plusRequest } from '@fastgpt/service/common/api/plusRequest';

export type OutLinkOffiAccountQuery = any;
export type OutLinkOffiAccountBody = any;
export type OutLinkOffiAccountResponse = {};

async function handler(
  req: ApiRequestProps<OutLinkOffiAccountBody, OutLinkOffiAccountQuery>,
  res: ApiResponseType<any>
): Promise<any> {
  const { token, type } = req.query;
  const result = await plusRequest({
    url: `support/outLink/offiaccount/${token}`,
    params: {
      ...req.query,
      type
    },
    data: req.body
  });

  if (result.data?.data?.message) {
    res.send(result.data.data.message);
  }

  res.send('');
}

export default handler;
